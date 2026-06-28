import { NextRequest, NextResponse } from 'next/server'
import { getTenantPrisma, basePrisma } from '@/lib/db'
import { hybridSearch, SearchResult } from '@/lib/search'
import { rerankResults, compileRagPrompt } from '@/lib/rag'
import { checkUsageLimit } from '@/lib/billing'
import { resolveClerkAuth } from '@/lib/route-auth'
import { searchTavily } from '@/lib/tavily'

export const dynamic = 'force-dynamic'

/**
 * Helper to simulate a streaming token generation for mock fallback
 */
async function* getMockStream(query: string, citations: any[]) {
  const citationText = citations.length > 0
    ? ` [${citations[0].docName}${citations[0].pageNumber ? `, page ${citations[0].pageNumber}` : ''}]`
    : ''
  const responseText = `This is a mock RAG answer addressing your question: "${query}". Based on the context: "${citations[0]?.snippet || 'no document content matches your query'}"${citationText}, the requested information is verified. Let me know if you need additional details.`

  // Send content in small chunks to simulate network streaming
  const chunks = responseText.match(/.{1,6}/g) || [responseText]
  for (const chunk of chunks) {
    yield chunk
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
}

export async function POST(request: NextRequest) {
  // Auth via Clerk session (browser session cookie — no JWT needed)
  const auth = await resolveClerkAuth()
  if (auth instanceof NextResponse) return auth
  const { tenantId, userId, role: userRole } = auth

  // Authorize user roles (GUEST is forbidden)
  if (userRole === 'GUEST') {
    return NextResponse.json(
      { error: 'Forbidden: GUEST role is not authorized to execute chat queries' },
      { status: 403 }
    )
  }

  // Enforce billing usage limits
  const billingCheck = await checkUsageLimit(tenantId, 'queries')
  if (!billingCheck.allowed) {
    return NextResponse.json(
      { error: billingCheck.reason || 'Billing limit exceeded' },
      { status: 403 }
    )
  }
  let body: any
  try {
    body = await request.json()
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid JSON request body' },
      { status: 400 }
    )
  }

  const { workspaceId, message: query, threadId } = body

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'Missing required field: workspaceId' },
      { status: 400 }
    )
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(workspaceId)) {
    return NextResponse.json(
      { error: 'Invalid workspaceId format' },
      { status: 400 }
    )
  }

  if (!query || !query.trim()) {
    return NextResponse.json(
      { error: 'Missing or empty search query message' },
      { status: 400 }
    )
  }

  if (query.length > 8000) {
    return NextResponse.json(
      { error: 'Query message exceeds the maximum allowed length of 8000 characters.' },
      { status: 400 }
    )
  }

  if (threadId && !uuidRegex.test(threadId)) {
    return NextResponse.json(
      { error: 'Invalid threadId format' },
      { status: 400 }
    )
  }

  const tenantPrisma = getTenantPrisma(tenantId)

  // 1. Verify workspace exists under tenant
  const workspace = await tenantPrisma.workspace.findUnique({
    where: { id: workspaceId },
  })

  if (!workspace) {
    return NextResponse.json(
      { error: 'Workspace not found or unauthorized access' },
      { status: 404 }
    )
  }

  // 2. Resolve or create ChatThread
  let activeThreadId = threadId
  if (activeThreadId) {
    const thread = await tenantPrisma.chatThread.findUnique({
      where: { id: activeThreadId },
    })
    if (!thread || thread.workspaceId !== workspaceId) {
      return NextResponse.json(
        { error: 'Chat thread not found or unauthorized' },
        { status: 404 }
      )
    }
  } else {
    const newThread = await tenantPrisma.chatThread.create({
      data: {
        tenantId,
        workspaceId,
        userId: userId || 'system',
        title: query.substring(0, 50) || 'New Conversation',
      },
    })
    activeThreadId = newThread.id
  }

  // 3. Perform Hybrid Search & Reranking
  const searchResults = await hybridSearch(tenantId, workspaceId, query, { limit: 45 })
  
  const combinedResults = [...searchResults]
  try {
    const webResults = await searchTavily(query)
    const mappedWebResults: SearchResult[] = webResults.map((r, idx) => ({
      id: `web-search-${idx}`,
      tenantId,
      documentId: `web-${idx}`,
      documentName: `Web Match: ${r.title}`,
      content: `[Source: ${r.url}] ${r.content}`,
      pageNumber: null,
      tokenCount: Math.ceil(r.content.split(/\s+/).length * 1.3),
      score: (r.score || 0.8) * 0.016, // scale to align with RRF scores
    }))
    combinedResults.push(...mappedWebResults)
  } catch (err) {
    console.error('Tavily grounding enhancement failed, proceeding with local matches only:', err)
  }

  const reranked = await rerankResults(query, combinedResults)
  
  // Accumulate context chunks dynamically up to a 10k token budget
  const CONTEXT_TOKEN_BUDGET = 10000
  let accumulatedTokens = 0
  const contextChunks: typeof reranked = []

  for (const chunk of reranked) {
    if (accumulatedTokens + chunk.tokenCount <= CONTEXT_TOKEN_BUDGET || contextChunks.length === 0) {
      contextChunks.push(chunk)
      accumulatedTokens += chunk.tokenCount
    } else {
      break
    }
  }

  const citations = contextChunks.map(c => ({
    docId: c.documentId,
    docName: c.documentName,
    pageNumber: c.pageNumber,
    snippet: c.content,
  }))

  const { systemPrompt, userPrompt } = compileRagPrompt(query, contextChunks, workspace.systemPrompt || undefined)

  // Provider resolution order:
  //   1. NVIDIA NIM (NVIDIA_API_KEY) — OpenAI-compatible at integrate.api.nvidia.com
  //   2. OpenAI (OPENAI_API_KEY)        — api.openai.com
  //   3. Mock  (everything else / "mock_*") — deterministic canned stream
  const nvidiaKey = process.env.NVIDIA_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY
  const isMockNvidia = !nvidiaKey || nvidiaKey === 'mock_key' || nvidiaKey.startsWith('mock-')
  const isMockOpenai = !openaiKey || openaiKey === 'mock_key' || openaiKey.startsWith('mock-')
  const useNvidia = !isMockNvidia
  const useOpenai = !useNvidia && !isMockOpenai
  const isMock = !useNvidia && !useOpenai

  // NVIDIA NIM free-tier model (fast, ~balanced quality). Override with NVIDIA_MODEL env if you have access to a better one.
  const nvidiaModel = process.env.NVIDIA_MODEL || 'nvidia/nemotron-3-ultra-550b-a55b'

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Yield thread id context
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'thread', threadId: activeThreadId })}\n\n`)
        )

        // Yield citations collection
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'citations', citations })}\n\n`)
        )

        // Save User Message entry to DB
        await basePrisma.chatMessage.create({
          data: {
            threadId: activeThreadId,
            role: 'USER',
            content: query,
          },
        })

        let fullText = ''

        if (isMock) {
          for await (const chunk of getMockStream(query, citations)) {
            fullText += chunk
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'token', token: chunk })}\n\n`)
            )
          }
        } else if (useNvidia) {
          // NVIDIA NIM — OpenAI-compatible chat completions at integrate.api.nvidia.com
          const apiResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${nvidiaKey}`,
              Accept: 'text/event-stream',
            },
            body: JSON.stringify({
              model: nvidiaModel,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              temperature: 0.5,
              max_tokens: 1024,
            }),
            signal: request.signal,
          })

          if (!apiResponse.ok) {
            const errStr = await apiResponse.text()
            throw new Error(`NVIDIA NIM stream error: ${apiResponse.status} - ${errStr}`)
          }

          const reader = apiResponse.body?.getReader()
          const decoder = new TextDecoder()
          let lineBuffer = ''

          if (reader) {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              lineBuffer += decoder.decode(value, { stream: true })
              const lines = lineBuffer.split('\n')
              lineBuffer = lines.pop() || ''

              for (const line of lines) {
                const cleanLine = line.trim()
                if (!cleanLine || !cleanLine.startsWith('data: ')) continue

                const dataStr = cleanLine.substring(6)
                if (dataStr === '[DONE]') break

                try {
                  const parsed = JSON.parse(dataStr)
                  const token = parsed.choices?.[0]?.delta?.content || ''
                  if (token) {
                    fullText += token
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`)
                    )
                  }
                } catch (_) { /* ignore malformed SSE */ }
              }
            }
          }
        } else {
          // OpenAI
          const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiKey}`,
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
              ],
              stream: true,
              temperature: 0.5,
            }),
            signal: request.signal,
          })

          if (!apiResponse.ok) {
            const errStr = await apiResponse.text()
            throw new Error(`OpenAI completions stream error: ${apiResponse.status} - ${errStr}`)
          }

          const reader = apiResponse.body?.getReader()
          const decoder = new TextDecoder()
          let lineBuffer = ''

          if (reader) {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              lineBuffer += decoder.decode(value, { stream: true })
              const lines = lineBuffer.split('\n')
              lineBuffer = lines.pop() || ''

              for (const line of lines) {
                const cleanLine = line.trim()
                if (!cleanLine || !cleanLine.startsWith('data: ')) continue

                const dataStr = cleanLine.substring(6)
                if (dataStr === '[DONE]') break

                try {
                  const parsed = JSON.parse(dataStr)
                  const token = parsed.choices?.[0]?.delta?.content || ''
                  if (token) {
                    fullText += token
                    controller.enqueue(
                      encoder.encode(`data: ${JSON.stringify({ type: 'token', token })}\n\n`)
                    )
                  }
                } catch (_) {
                  // Suppress issues parsing incomplete SSE tokens
                }
              }
            }
          }
        }

        // Save Assistant response and citations collection to DB
        await basePrisma.chatMessage.create({
          data: {
            threadId: activeThreadId,
            role: 'ASSISTANT',
            content: fullText,
            citations: citations as any,
          },
        })

        // Log search usage and api call counts
        const currentMonth = new Date().toISOString().slice(0, 7)
        await tenantPrisma.tenantUsage.upsert({
          where: {
            tenantId_month: {
              tenantId,
              month: currentMonth,
            },
          },
          update: {
            queryCount: { increment: 1 },
          },
          create: {
            tenantId,
            month: currentMonth,
            queryCount: 1,
          },
        })

        // Log audit event details
        await basePrisma.auditLog.create({
          data: {
            tenantId,
            userId: userId || null,
            action: 'CHAT_QUERY',
            description: `Successfully executed RAG query in thread ${activeThreadId} matching ${citations.length} documents.`,
          },
        })

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        )
        controller.close()
      } catch (err) {
        console.error('SSE chat handler stream failure:', err)
        const clientErrorMessage = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
          ? (err instanceof Error ? err.message : String(err))
          : 'An unexpected error occurred during stream generation. Please try again.'
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'error', error: clientErrorMessage })}\n\n`)
        )
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
