process.env.NODE_ENV = 'test';

// Intercept module loading to mock Next.js server-only restrictions and Clerk session
import Module from 'module'
const originalRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (id: string) {
  if (id === 'server-only') return {}
  if (id === '@clerk/nextjs/server') {
    return {
      auth: async () => ({ userId: 'user-999' })
    }
  }
  return originalRequire.apply(this, arguments)
}

import test from 'node:test'
import assert from 'node:assert'
import { getEmbedding, getDeterministicMockEmbedding } from '../src/lib/embeddings'
import { hybridSearch } from '../src/lib/search'
import { rerankResults, compileRagPrompt } from '../src/lib/rag'
import { POST } from '../src/app/api/chat/route'
import { basePrisma } from '../src/lib/db'
import { NextRequest } from 'next/server'
import * as routeAuth from '../src/lib/route-auth'

test('Embedding Utilities', async (t) => {
  await t.test('getDeterministicMockEmbedding returns unit vector of 768 dimensions', () => {
    const text = 'test content for mock embedding'
    const vector = getDeterministicMockEmbedding(text)
    assert.strictEqual(vector.length, 768)
    
    // Check normalization: sum of squares should be very close to 1
    const sumOfSquares = vector.reduce((sum, val) => sum + val * val, 0)
    assert.ok(Math.abs(sumOfSquares - 1) < 1e-6, `Magnitude should be 1, got ${sumOfSquares}`)
  })

  await t.test('getEmbedding returns same vector for same string (cached)', async () => {
    const text = 'cache-test-string'
    const vec1 = await getEmbedding(text)
    const vec2 = await getEmbedding(text)
    assert.deepStrictEqual(vec1, vec2)
  })
})

test('Hybrid Search RRF & Fallback', async (t) => {
  const tenantId = '11111111-1111-1111-1111-111111111111'
  const workspaceId = '33333333-3333-3333-3333-333333333333'
  
  await t.test('combines dense and sparse results using RRF in fallback mode', async () => {
    // Stub Prisma queries for fallback search
    const mockDocs = [
      { id: 'doc-1', name: 'Document A' },
      { id: 'doc-2', name: 'Document B' }
    ]
    const mockChunks = [
      { id: 'chunk-1', tenantId, documentId: 'doc-1', content: 'We deploy docker images with prisma migrations.', pageNumber: 1, tokenCount: 10 },
      { id: 'chunk-2', tenantId, documentId: 'doc-2', content: 'Database backup and replication configuration.', pageNumber: 3, tokenCount: 12 },
      { id: 'chunk-3', tenantId, documentId: 'doc-1', content: 'Other unrelated text content is here.', pageNumber: 5, tokenCount: 15 }
    ]

    const originalFindManyDoc = basePrisma.document.findMany
    const originalFindManyChunk = basePrisma.chunk.findMany
    const originalQueryRawUnsafe = basePrisma.$queryRawUnsafe

    ;(basePrisma.document as any).findMany = async () => mockDocs
    ;(basePrisma.chunk as any).findMany = async () => mockChunks
    // Force the fallback path by making pgvector query fail
    ;(basePrisma as any).$queryRawUnsafe = async () => {
      throw new Error('mock pgvector unavailable, forcing fallback')
    }

    try {
      const results = await hybridSearch(tenantId, workspaceId, 'prisma docker database')
      assert.ok(results.length > 0)

      // Verify sorting: chunk-1 should be first because it matches 'prisma' and 'docker'
      assert.strictEqual(results[0].id, 'chunk-1')
      assert.strictEqual(results[0].documentName, 'Document A')
      assert.ok(results[0].score > 0)
    } finally {
      basePrisma.document.findMany = originalFindManyDoc
      basePrisma.chunk.findMany = originalFindManyChunk
      basePrisma.$queryRawUnsafe = originalQueryRawUnsafe
    }
  })
})

test('RAG Scorer and Prompt Compiler', async (t) => {
  await t.test('rerankResults computes score and sorts results', async () => {
    const query = 'artificial intelligence'
    const results = [
      { id: '1', tenantId: 't', documentId: 'd', documentName: 'doc', content: 'some text about artificial intelligence and ML', pageNumber: 1, tokenCount: 10, score: 0.02 },
      { id: '2', tenantId: 't', documentId: 'd', documentName: 'doc', content: 'random irrelevant text in document', pageNumber: 2, tokenCount: 10, score: 0.015 }
    ]

    const reranked = await rerankResults(query, results)
    assert.strictEqual(reranked.length, 2)
    assert.strictEqual(reranked[0].id, '1')
    assert.ok(reranked[0].relevanceScore > reranked[1].relevanceScore)
  })

  await t.test('compileRagPrompt properly wraps fragment content into XML block structure', () => {
    const query = 'test query'
    const results = [
      { id: 'chunk-1', tenantId: 't1', documentId: 'doc-1', documentName: 'report.pdf', content: 'content of page 1', pageNumber: 1, tokenCount: 5, score: 0.03 }
    ]

    const prompts = compileRagPrompt(query, results)
    assert.ok(prompts.systemPrompt.includes('<context_fragments>'))
    assert.ok(prompts.systemPrompt.includes('<fragment id="doc-1" name="report.pdf" page="1">'))
    assert.ok(prompts.systemPrompt.includes('content of page 1'))
    assert.strictEqual(prompts.userPrompt, query)
  })
})

test('Chat Streaming Route SSE Handler', async (t) => {
  const tenantId = '11111111-1111-1111-1111-111111111111'
  const workspaceId = '33333333-3333-3333-3333-333333333333'
  const userId = 'user-999'

  const stubs: any = {}

  const originalFindUniqueWorkspace = basePrisma.workspace.findUnique
  const originalFindUniqueChatThread = basePrisma.chatThread.findUnique
  const originalCreateChatThread = basePrisma.chatThread.create
  const originalCreateChatMessage = basePrisma.chatMessage.create
  const originalUpsertTenantUsage = basePrisma.tenantUsage.upsert
  const originalCreateAuditLog = basePrisma.auditLog.create
  const originalFindManyDocument = basePrisma.document.findMany
  const originalFindManyChunk = basePrisma.chunk.findMany
  const originalFindUniqueTenant = basePrisma.tenant.findUnique
  const originalFindUniqueTenantUsage = basePrisma.tenantUsage.findUnique
  const originalQueryRawUnsafe = basePrisma.$queryRawUnsafe
  const originalFetch = global.fetch
  const originalFindUniqueUser = basePrisma.user.findUnique


  t.afterEach(() => {
    basePrisma.workspace.findUnique = originalFindUniqueWorkspace
    basePrisma.chatThread.findUnique = originalFindUniqueChatThread
    basePrisma.chatThread.create = originalCreateChatThread
    basePrisma.chatMessage.create = originalCreateChatMessage
    basePrisma.tenantUsage.upsert = originalUpsertTenantUsage
    basePrisma.auditLog.create = originalCreateAuditLog
    basePrisma.document.findMany = originalFindManyDocument
    basePrisma.chunk.findMany = originalFindManyChunk
    basePrisma.tenant.findUnique = originalFindUniqueTenant
    basePrisma.tenantUsage.findUnique = originalFindUniqueTenantUsage
    basePrisma.$queryRawUnsafe = originalQueryRawUnsafe
    global.fetch = originalFetch
    basePrisma.user.findUnique = originalFindUniqueUser
  })

  const setupChatStubs = () => {
    // Stub tenant findUnique
    stubs.tenantFindUnique = async (args: any) => {
      if (args.where.id === tenantId) {
        return { id: tenantId, subscriptionStatus: 'ACTIVE', stripeSubscriptionId: 'sub_active_456' }
      }
      return null
    }
    ;(basePrisma.tenant as any).findUnique = stubs.tenantFindUnique

    // Stub tenantUsage findUnique
    stubs.tenantUsageFindUnique = async () => {
      return { documentCount: 1, queryCount: 1 }
    }
    ;(basePrisma.tenantUsage as any).findUnique = stubs.tenantUsageFindUnique

    // Stub workspace findUnique
    stubs.workspaceFindUnique = async (args: any) => {
      if (args.where.id === workspaceId) {
        return { id: workspaceId, tenantId, name: 'Main Workspace', systemPrompt: 'Be concise.' }
      }
      return null
    }
    ;(basePrisma.workspace as any).findUnique = stubs.workspaceFindUnique

    // Stub user findUnique
    stubs.userFindUnique = async (args: any) => {
      if (args.where.id === userId) {
        return { id: userId, tenantId, role: 'ADMIN' }
      }
      return null
    }
    ;(basePrisma.user as any).findUnique = stubs.userFindUnique


    // Stub thread lookups / creations
    stubs.chatThreadFindUnique = async () => null
    stubs.chatThreadCreate = async (args: any) => {
      return { id: 'thread-888', workspaceId, userId: args.data.userId, title: args.data.title }
    }
    ;(basePrisma.chatThread as any).findUnique = stubs.chatThreadFindUnique
    ;(basePrisma.chatThread as any).create = stubs.chatThreadCreate

    // Stub Message creations
    stubs.chatMessageCreateCaptured = []
    stubs.chatMessageCreate = async (args: any) => {
      stubs.chatMessageCreateCaptured.push(args)
      return { id: 'msg-' + Math.random(), threadId: args.data.threadId, role: args.data.role, content: args.data.content }
    }
    ;(basePrisma.chatMessage as any).create = stubs.chatMessageCreate

    // Stub Usage upsert
    stubs.tenantUsageUpsertCaptured = []
    stubs.tenantUsageUpsert = async (args: any) => {
      stubs.tenantUsageUpsertCaptured.push(args)
      return { id: 'usage-1', tenantId }
    }
    ;(basePrisma.tenantUsage as any).upsert = stubs.tenantUsageUpsert

    // Stub AuditLog create
    stubs.auditLogCreateCaptured = []
    stubs.auditLogCreate = async (args: any) => {
      stubs.auditLogCreateCaptured.push(args)
      return { id: 'log-1', tenantId }
    }
    ;(basePrisma.auditLog as any).create = stubs.auditLogCreate

    // Stub Document/Chunk list for hybrid search fallback
    ;(basePrisma.document as any).findMany = async () => [
      { id: 'doc-1', name: 'Reference.txt' }
    ]
    ;(basePrisma.chunk as any).findMany = async () => [
      { id: 'chunk-1', tenantId, documentId: 'doc-1', content: 'Database backup and replication guide content.', pageNumber: 1, tokenCount: 15 }
    ]

    // Force hybridSearch into fallback path (pgvector unavailable in test env)
    ;(basePrisma as any).$queryRawUnsafe = async () => {
      throw new Error('mock pgvector unavailable, forcing fallback')
    }

    // Mock global.fetch to intercept completion calls and yield mock SSE chunks
    stubs.fetch = async (url: string, init: any) => {
      if (url.includes('chat/completions')) {
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            const chunks = [
              { choices: [{ delta: { content: 'Mocked ' } }] },
              { choices: [{ delta: { content: 'RAG ' } }] },
              { choices: [{ delta: { content: 'answer ' } }] }
            ]
            for (const chunk of chunks) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
            }
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }
        })
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        })
      }
      return originalFetch(url, init)
    }
    global.fetch = stubs.fetch
  }


  await t.test('streams correct SSE formatted chunks and saves user & assistant history', async () => {
    setupChatStubs()

    const request = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'ADMIN'
      }),
      body: JSON.stringify({
        workspaceId,
        message: 'database backup configuration'
      })
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.headers.get('Content-Type'), 'text/event-stream')

    // Parse stream chunks
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const events: any[] = []

    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          const cleanLine = line.trim()
          if (cleanLine.startsWith('data: ')) {
            try {
              events.push(JSON.parse(cleanLine.substring(6)))
            } catch (e) {
              if (cleanLine.substring(6) === '[DONE]') {
                events.push({ type: 'done' })
              }
            }
          }
        }
      }
    }

    // Verify correct sequence of events
    console.log('PARSED EVENTS IN TEST:', JSON.stringify(events, null, 2))
    assert.ok(events.length > 2)
    
    // Verify first event is either thread ID or citations
    const threadEvent = events.find(e => e.type === 'thread')
    assert.ok(threadEvent)
    assert.strictEqual(threadEvent.threadId, 'thread-888')

    const citationsEvent = events.find(e => e.type === 'citations')
    assert.ok(citationsEvent)
    assert.strictEqual(citationsEvent.citations[0].docName, 'Reference.txt')
    
    // Assert there is at least one token chunk
    const tokens = events.filter(e => e.type === 'token')
    assert.ok(tokens.length > 0)

    const doneEvent = events.find(e => e.type === 'done')
    assert.ok(doneEvent)

    // Verify messages saved in DB
    const savedUserMsg = stubs.chatMessageCreateCaptured.find((m: any) => m.data.role === 'USER')
    const savedAssistantMsg = stubs.chatMessageCreateCaptured.find((m: any) => m.data.role === 'ASSISTANT')

    assert.ok(savedUserMsg)
    assert.strictEqual(savedUserMsg.data.content, 'database backup configuration')
    assert.ok(savedAssistantMsg)
    assert.ok(savedAssistantMsg.data.content.length > 0)
    assert.strictEqual(savedAssistantMsg.data.citations[0].docName, 'Reference.txt')
  })
})

