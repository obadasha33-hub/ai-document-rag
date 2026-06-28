import { SearchResult } from './search'

export interface RerankedResult extends SearchResult {
  relevanceScore: number
}

/**
 * Reranks search results using the Cohere Rerank API if COHERE_API_KEY is configured.
 * Otherwise, uses a deterministic local relevance scorer combining lexical overlap and search score.
 */
export async function rerankResults(
  query: string,
  results: SearchResult[]
): Promise<RerankedResult[]> {
  if (results.length === 0) {
    return []
  }

  const apiKey = process.env.COHERE_API_KEY
  
  if (apiKey && apiKey !== 'mock_key' && !apiKey.startsWith('mock-')) {
    try {
      const response = await fetch('https://api.cohere.ai/v1/rerank', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'rerank-english-v3.0',
          query: query,
          documents: results.map(r => r.content),
          top_n: results.length,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const reranked: RerankedResult[] = new Array(results.length)
        
        data.results.forEach((item: { index: number; relevance_score: number }) => {
          const original = results[item.index]
          reranked[item.index] = {
            ...original,
            relevanceScore: item.relevance_score,
          }
        })
        
        return reranked
          .filter(Boolean)
          .sort((a, b) => b.relevanceScore - a.relevanceScore)
      } else {
        console.warn(`Cohere API returned status ${response.status}, utilizing fallback reranker`)
      }
    } catch (err) {
      console.warn('Cohere reranker API execution failed, utilizing fallback reranker. Error:', err)
    }
  }

  // Fallback local reranker calculating a deterministic score
  const queryWords = query.toLowerCase().split(/\s+/)
  const reranked: RerankedResult[] = results.map(row => {
    const contentLower = row.content.toLowerCase()
    const matches = queryWords.filter(word => contentLower.includes(word))
    
    // Overlap score represents percentage of query tokens present in the chunk
    const overlapScore = matches.length / Math.max(1, queryWords.length)
    
    // Combine original search score (RRF value) and token overlap to yield local relevanceScore
    const relevanceScore = Math.min(1, Math.max(0, (row.score * 10) + (overlapScore * 0.7)))
    
    return {
      ...row,
      relevanceScore,
    }
  })

  return reranked.sort((a, b) => b.relevanceScore - a.relevanceScore)
}

/**
 * Formats context fragments in XML and compiles the system/user prompts for RAG execution.
 * Enforces anti-hallucination rules and strict inline citation requirements.
 */
export function compileRagPrompt(
  query: string,
  results: SearchResult[],
  systemPromptOverride?: string
): { systemPrompt: string; userPrompt: string } {
  const formattedFragments = results
    .map((res) => {
      const pageAttr = res.pageNumber ? ` page="${res.pageNumber}"` : ''
      return `<fragment id="${res.documentId}" name="${res.documentName}"${pageAttr}>\n${res.content}\n</fragment>`
    })
    .join('\n\n')

  const baseSystemPrompt =
    systemPromptOverride ||
    `You are an advanced Document Intelligence Assistant. Your objective is to answer the user's questions accurately and objectively using ONLY the context fragments provided below.

You are strictly restricted to this database. You must behave as a closed-domain Q&A assistant:
1. Strict Context Adherence: Base your response ONLY on the text content wrapped within <context_fragments>. Do not assume, extrapolate, or bring in external knowledge.
2. Anti-Hallucination: If the answer cannot be found or reasonably inferred from the provided context fragments, state clearly: "I cannot find the answer to this question in the provided documents."
3. No General Knowledge: If the user asks a general question (e.g. "write a python script", "who is the president", "explain gravity") that is not directly answered by the context, you must refuse to answer. Politely state: "I am only authorized to answer questions based on the documents uploaded to this workspace."
4. Citations: When you refer to information from a context fragment, you MUST cite it. Include inline citations matching the format: [DocName, page X] or [DocName].
5. XML Tags: The context is provided inside <context_fragments>. Do not mention XML tags in your response. Avoid prefixing your response with meta text or filler.`

  const systemPrompt = `${baseSystemPrompt}\n\n<context_fragments>\n${formattedFragments}\n</context_fragments>`
  const userPrompt = query

  return {
    systemPrompt,
    userPrompt,
  }
}
