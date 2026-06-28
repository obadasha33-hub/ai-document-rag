import { getTenantPrisma, basePrisma } from './db'
import { getEmbedding } from './embeddings'

export interface SearchResult {
  id: string
  tenantId: string
  documentId: string
  documentName: string
  content: string
  pageNumber: number | null
  tokenCount: number
  score: number // RRF combined score
  denseRank?: number
  sparseRank?: number
  similarity?: number
}

// Reciprocal Rank Fusion constant k (standard value is 60)
const RRF_K = 60

/**
 * Performs hybrid search on the document chunks:
 * 1. Generates the embedding and runs a dense vector query using pgvector (<=>).
 * 2. Runs a sparse text matching query using ts_rank and full-text search @@.
 * 3. Merges the results using Reciprocal Rank Fusion (RRF).
 * 4. Gracefully falls back to memory-based/Prisma search if pgvector queries fail.
 */
export async function hybridSearch(
  tenantId: string,
  workspaceId: string,
  query: string,
  options: { limit?: number; limitDense?: number; limitSparse?: number } = {}
): Promise<SearchResult[]> {
  const limit = options.limit || 10
  const limitDense = options.limitDense || limit * 2
  const limitSparse = options.limitSparse || limit * 2

  const cleanQuery = query.trim()
  if (!cleanQuery) {
    return []
  }

  const tenantPrisma = getTenantPrisma(tenantId)

  try {
    // Generate query embedding
    const queryVector = await getEmbedding(cleanQuery, 'RETRIEVAL_QUERY')
    const queryVectorStr = `[${queryVector.join(',')}]`

    // 1. Dense Cosine Similarity Search (using pgvector <=> operator)
    // Ordered by distance asc, so closest is first. Cosine similarity = 1 - distance.
    const denseRaw: any[] = await basePrisma.$queryRawUnsafe(
      `
      SELECT 
        c.id,
        c."tenantId",
        c."documentId",
        c.content,
        c."pageNumber",
        c."tokenCount",
        d.name as "documentName",
        1 - (c.embedding::text::vector <=> $1::vector) as similarity
      FROM chunks c
      JOIN documents d ON c."documentId" = d.id
      WHERE c."tenantId" = $2::uuid 
        AND d."workspaceId" = $3::uuid
        AND d."tenantId" = $2::uuid
      ORDER BY c.embedding::text::vector <=> $1::vector ASC
      LIMIT $4
      `,
      queryVectorStr,
      tenantId,
      workspaceId,
      limitDense
    )

    // 2. Sparse Lexical Search (using Postgres Full-Text Search)
    const sparseRaw: any[] = await basePrisma.$queryRawUnsafe(
      `
      SELECT 
        c.id,
        c."tenantId",
        c."documentId",
        c.content,
        c."pageNumber",
        c."tokenCount",
        d.name as "documentName",
        ts_rank(to_tsvector('english', c.content), plainto_tsquery('english', $1)) as rank
      FROM chunks c
      JOIN documents d ON c."documentId" = d.id
      WHERE c."tenantId" = $2::uuid 
        AND d."workspaceId" = $3::uuid
        AND d."tenantId" = $2::uuid
        AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $4
      `,
      cleanQuery,
      tenantId,
      workspaceId,
      limitSparse
    )

    // 3. Reciprocal Rank Fusion (RRF)
    const rrfMap = new Map<string, SearchResult>()

    // Process dense matches
    denseRaw.forEach((row, index) => {
      const denseRank = index + 1
      rrfMap.set(row.id, {
        id: row.id,
        tenantId: row.tenantId,
        documentId: row.documentId,
        documentName: row.documentName,
        content: row.content,
        pageNumber: row.pageNumber,
        tokenCount: row.tokenCount,
        score: 1 / (RRF_K + denseRank),
        denseRank,
        similarity: row.similarity
      })
    })

    // Process sparse matches
    sparseRaw.forEach((row, index) => {
      const sparseRank = index + 1
      const existing = rrfMap.get(row.id)
      if (existing) {
        existing.score += 1 / (RRF_K + sparseRank)
        existing.sparseRank = sparseRank
      } else {
        rrfMap.set(row.id, {
          id: row.id,
          tenantId: row.tenantId,
          documentId: row.documentId,
          documentName: row.documentName,
          content: row.content,
          pageNumber: row.pageNumber,
          tokenCount: row.tokenCount,
          score: 1 / (RRF_K + sparseRank),
          sparseRank
        })
      }
    })

    // Sort and limit results
    return Array.from(rrfMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

  } catch (err) {
    // Fallback: Use standard Prisma Client operations to retrieve documents and chunks
    // then perform in-memory lexical similarity matches.
    try {
      const docs = await tenantPrisma.document.findMany({
        where: { workspaceId },
        select: { id: true, name: true }
      })
      const docIds = docs.map(d => d.id)

      if (docIds.length === 0) {
        return []
      }

      const chunks = await tenantPrisma.chunk.findMany({
        where: {
          documentId: { in: docIds }
        }
      })

      const queryWords = cleanQuery.toLowerCase().split(/\s+/)
      const scored = chunks.map(chunk => {
        const doc = docs.find(d => d.id === chunk.documentId)
        const documentName = doc ? doc.name : 'Unknown Document'
        const contentLower = chunk.content.toLowerCase()
        
        // Mock dense score using Jaccard intersection of words
        const matches = queryWords.filter(word => contentLower.includes(word))
        const similarity = matches.length / Math.max(1, queryWords.length)

        // Mock sparse match score (simple token overlap count)
        const matchCount = matches.length

        return {
          id: chunk.id,
          tenantId: chunk.tenantId,
          documentId: chunk.documentId,
          documentName,
          content: chunk.content,
          pageNumber: chunk.pageNumber,
          tokenCount: chunk.tokenCount,
          similarity,
          matchCount
        }
      })

      // Sort and slice dense candidates
      const denseCandidates = [...scored]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limitDense)

      // Sort and slice sparse candidates
      const sparseCandidates = [...scored]
        .filter(c => c.matchCount > 0)
        .sort((a, b) => b.matchCount - a.matchCount)
        .slice(0, limitSparse)

      const rrfMap = new Map<string, SearchResult>()

      denseCandidates.forEach((row, index) => {
        const denseRank = index + 1
        rrfMap.set(row.id, {
          id: row.id,
          tenantId: row.tenantId,
          documentId: row.documentId,
          documentName: row.documentName,
          content: row.content,
          pageNumber: row.pageNumber,
          tokenCount: row.tokenCount,
          score: 1 / (RRF_K + denseRank),
          denseRank,
          similarity: row.similarity
        })
      })

      sparseCandidates.forEach((row, index) => {
        const sparseRank = index + 1
        const existing = rrfMap.get(row.id)
        if (existing) {
          existing.score += 1 / (RRF_K + sparseRank)
          existing.sparseRank = sparseRank
        } else {
          rrfMap.set(row.id, {
            id: row.id,
            tenantId: row.tenantId,
            documentId: row.documentId,
            documentName: row.documentName,
            content: row.content,
            pageNumber: row.pageNumber,
            tokenCount: row.tokenCount,
            score: 1 / (RRF_K + sparseRank),
            sparseRank,
            similarity: row.similarity
          })
        }
      })

      return Array.from(rrfMap.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)

    } catch (fallbackErr) {
      console.error('Fallback search failed completely:', fallbackErr)
      return []
    }
  }
}
