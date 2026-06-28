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
import { chunkText, estimateTokens, parseBlocks, splitTextRecursively } from '../src/lib/chunker'
import { POST } from '../src/app/api/ingest/route'
import { basePrisma } from '../src/lib/db'
import { NextRequest } from 'next/server'

// ==========================================
// SECTION 1: UNIT TESTS FOR CHUNKER
// ==========================================

test('Chunker Utility Unit Tests', async (t) => {
  await t.test('estimateTokens matches approximate token ratio', () => {
    const text = 'This is a test sentence for estimating token counts.'
    const tokens = estimateTokens(text)
    assert.ok(tokens > 0)
    assert.strictEqual(tokens, Math.max(1, Math.ceil(Math.max(text.length / 4, 9 * 1.3))))
  })

  await t.test('splitTextRecursively correctly cuts text with overlap', () => {
    const text = 'abcdefghijklmnopqrstuvwxyz'
    // maxChunkSize = 10, chunkOverlap = 3
    const splits = splitTextRecursively(text, 10, 3, [''])
    
    assert.ok(splits.length > 1)
    // First chunk should be 10 characters
    assert.strictEqual(splits[0], 'abcdefghij')
    // Second chunk starts with overlap 'hij' + 'klmnopq'
    assert.strictEqual(splits[1], 'hijklmnopq')
  })

  await t.test('parseBlocks identifies headings and markdown tables correctly', () => {
    const markdown = `# Title Heading\n\nSome paragraph text here.\n\n| Col 1 | Col 2 |\n| --- | --- |\n| Val 1 | Val 2 |`
    const blocks = parseBlocks(markdown)

    assert.strictEqual(blocks.length, 3)
    assert.strictEqual(blocks[0].type, 'heading')
    assert.strictEqual(blocks[0].content, '# Title Heading')
    assert.strictEqual(blocks[1].type, 'paragraph')
    assert.strictEqual(blocks[1].content, 'Some paragraph text here.')
    assert.strictEqual(blocks[2].type, 'table')
    assert.strictEqual(blocks[2].content, '| Col 1 | Col 2 |\n| --- | --- |\n| Val 1 | Val 2 |')
  })

  await t.test('heading blocks trigger a hard chunk boundary', () => {
    const text = 'Intro text.\n# A Major Heading\nEnding text here.'
    const chunks = chunkText(text, {
      maxChunkSize: 100,
      chunkOverlap: 0,
      enableSemanticBoundaries: false
    })

    // Should create:
    // 1. "Intro text."
    // 2. "# A Major Heading"
    // 3. "Ending text here."
    assert.strictEqual(chunks.length, 3)
    assert.strictEqual(chunks[0].content, 'Intro text.')
    assert.strictEqual(chunks[1].content, '# A Major Heading')
    assert.strictEqual(chunks[2].content, 'Ending text here.')
  })

  await t.test('splits large tables row-by-row and propagates headers', () => {
    const table = `| Item | Qty |\n| --- | --- |\n| Apples | 100 |\n| Oranges | 200 |\n| Bananas | 300 |`
    // Force a small maxChunkSize to split the table
    const chunks = chunkText(table, {
      maxChunkSize: 45, // small limit to trigger split
      chunkOverlap: 0,
    })

    assert.ok(chunks.length > 1)
    // Every table chunk should include the header and separator rows
    for (const chunk of chunks) {
      assert.ok(chunk.content.includes('| Item | Qty |'))
      assert.ok(chunk.content.includes('| --- | --- |'))
    }
  })

  await t.test('detects semantic boundaries on major keyword shifts', () => {
    // Paragraph A: context about cooking recipes
    const paraA = 'We will bake cookies using flour, sugar, butter, and chocolate chips.'
    // Paragraph B: context about software code
    const paraB = 'Deploy the database migration using prisma db push and restart the docker container.'
    const text = `${paraA}\n\n${paraB}`

    const chunks = chunkText(text, {
      maxChunkSize: 1000,
      enableSemanticBoundaries: true,
      semanticThreshold: 0.15
    })

    // Because the keyword overlap is 0 (similarity 0 < 0.15), they should split into 2 chunks
    assert.strictEqual(chunks.length, 2)
    assert.strictEqual(chunks[0].content, paraA)
    assert.strictEqual(chunks[1].content, paraB)
  })
})

// ==========================================
// SECTION 2: INTEGRATION TESTS FOR API/INGEST
// ==========================================

test('Ingestion API Handler Integration Tests', async (t) => {
  const tenantId = '11111111-1111-1111-1111-111111111111'
  const workspaceId = '33333333-3333-3333-3333-333333333333'
  const userId = 'user-999'
  let currentTestUserRole = 'ADMIN'


  // Standard valid FormData mockup builder
  const createMockFormData = (filename = 'doc.txt', content = 'Hello world content') => {
    const formData = new FormData()
    const file = new File([Buffer.from(content)], filename, { type: 'text/plain' })
    formData.append('file', file)
    formData.append('workspaceId', workspaceId)
    formData.append('metadata', JSON.stringify({ source: 'email' }))
    return formData
  }

  // Restore/reset stub helpers
  const stubs: any = {}
  
  const originalFindUniqueWorkspace = basePrisma.workspace.findUnique
  const originalCreateDocument = basePrisma.document.create
  const originalUpdateDocument = basePrisma.document.update
  const originalExecuteRawUnsafe = basePrisma.$executeRawUnsafe
  const originalUpsertTenantUsage = basePrisma.tenantUsage.upsert
  const originalCreateAuditLog = basePrisma.auditLog.create
  const originalTransaction = basePrisma.$transaction
  const originalFindUniqueTenant = basePrisma.tenant.findUnique
  const originalFindUniqueTenantUsage = basePrisma.tenantUsage.findUnique
  const originalFindUniqueUser = basePrisma.user.findUnique
  const originalFetch = global.fetch


  t.afterEach(() => {
    basePrisma.workspace.findUnique = originalFindUniqueWorkspace
    basePrisma.document.create = originalCreateDocument
    basePrisma.document.update = originalUpdateDocument
    basePrisma.$executeRawUnsafe = originalExecuteRawUnsafe
    basePrisma.tenantUsage.upsert = originalUpsertTenantUsage
    basePrisma.auditLog.create = originalCreateAuditLog
    basePrisma.$transaction = originalTransaction
    basePrisma.tenant.findUnique = originalFindUniqueTenant
    basePrisma.tenantUsage.findUnique = originalFindUniqueTenantUsage
    basePrisma.user.findUnique = originalFindUniqueUser
    global.fetch = originalFetch
  })

  const setupPrismaStubs = () => {
    // Tenant lookup stub
    stubs.tenantFindUnique = async (args: any) => {
      if (args.where.id === tenantId) {
        return { id: tenantId, subscriptionStatus: 'ACTIVE', stripeSubscriptionId: 'sub_active_456' }
      }
      return null
    }
    ;(basePrisma.tenant as any).findUnique = stubs.tenantFindUnique

    // TenantUsage lookup stub
    stubs.tenantUsageFindUnique = async () => {
      return { documentCount: 1, queryCount: 1 }
    }
    ;(basePrisma.tenantUsage as any).findUnique = stubs.tenantUsageFindUnique

    // Workspace lookup stub
    stubs.workspaceFindUnique = async (args: any) => {
      if (args.where.id === workspaceId) {
        return { id: workspaceId, tenantId, name: 'Main Workspace' }
      }
      return null
    }
    ;(basePrisma.workspace as any).findUnique = stubs.workspaceFindUnique

    // User lookup stub
    stubs.userFindUnique = async (args: any) => {
      if (args.where.id === userId) {
        return { id: userId, tenantId, role: currentTestUserRole }
      }
      return null
    }
    ;(basePrisma.user as any).findUnique = stubs.userFindUnique

    // Mock global.fetch to return mock embedding vectors immediately (preventing network calls/retries)
    stubs.fetch = async (url: string, init: any) => {
      if (url.includes('generativelanguage.googleapis.com') || url.includes('embeddings')) {
        return new Response(JSON.stringify({
          embedding: { values: new Array(768).fill(0.1) }
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      }
      return originalFetch(url, init)
    }
    global.fetch = stubs.fetch

    // Document creation stub
    stubs.documentCreate = async (args: any) => {
      return { id: 'doc-777', tenantId, workspaceId, name: args.data.name, status: 'PROCESSING', fileSize: args.data.fileSize }
    }
    ;(basePrisma.document as any).create = stubs.documentCreate

    // Document update stub
    stubs.documentUpdateCaptured = []
    stubs.documentUpdate = async (args: any) => {
      stubs.documentUpdateCaptured.push(args)
      return { id: args.where.id, status: args.data.status }
    }
    ;(basePrisma.document as any).update = stubs.documentUpdate

    // Chunk raw insertion execution stub
    stubs.executeRawUnsafeCaptured = []
    stubs.executeRawUnsafe = async (sql: string, ...params: any[]) => {
      stubs.executeRawUnsafeCaptured.push({ sql, params })
      return 1
    }
    ;(basePrisma as any).$executeRawUnsafe = stubs.executeRawUnsafe

    // Usage upsert stub
    stubs.tenantUsageUpsertCaptured = []
    stubs.tenantUsageUpsert = async (args: any) => {
      stubs.tenantUsageUpsertCaptured.push(args)
      return { id: 'usage-1', tenantId }
    }
    ;(basePrisma.tenantUsage as any).upsert = stubs.tenantUsageUpsert

    // AuditLog create stub
    stubs.auditLogCreateCaptured = []
    stubs.auditLogCreate = async (args: any) => {
      stubs.auditLogCreateCaptured.push(args)
      return { id: 'log-1', tenantId }
    }
    ;(basePrisma.auditLog as any).create = stubs.auditLogCreate

    // Transaction stub
    stubs.transaction = async (callback: (tx: any) => Promise<any>) => {
      return callback(basePrisma)
    }
    ;(basePrisma as any).$transaction = stubs.transaction
  }

  await t.test('successfully parses, chunks, and inserts document details', async () => {
    currentTestUserRole = 'ADMIN'
    setupPrismaStubs()

    const formData = createMockFormData('test.txt', 'This is document body content.')
    const request = new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'ADMIN'
      }),
      body: formData
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 200)

    const json = await response.json()
    assert.strictEqual(json.success, true)
    assert.strictEqual(json.documentId, 'doc-777')
    assert.strictEqual(json.status, 'INDEXED')
    assert.strictEqual(json.chunksCount, 1)

    // Check document status went to INDEXED
    assert.strictEqual(stubs.documentUpdateCaptured.length, 1)
    assert.strictEqual(stubs.documentUpdateCaptured[0].data.status, 'INDEXED')

    // Check chunk sql inserts were called
    assert.strictEqual(stubs.executeRawUnsafeCaptured.length, 1)
    const rawCall = stubs.executeRawUnsafeCaptured[0]
    assert.match(rawCall.sql, /INSERT INTO chunks/)
    assert.strictEqual(rawCall.params[1], tenantId)
    assert.strictEqual(rawCall.params[2], 'doc-777')
    assert.strictEqual(rawCall.params[3], 'This is document body content.')

    // Check usage metric update
    assert.strictEqual(stubs.tenantUsageUpsertCaptured.length, 1)
    assert.strictEqual(stubs.tenantUsageUpsertCaptured[0].where.tenantId_month.tenantId, tenantId)
    
    // Check audit log entry
    assert.strictEqual(stubs.auditLogCreateCaptured.length, 1)
    assert.strictEqual(stubs.auditLogCreateCaptured[0].data.userId, userId)
    assert.strictEqual(stubs.auditLogCreateCaptured[0].data.action, 'FILE_UPLOAD')
  })

  await t.test('denies file upload request if user role is GUEST', async () => {
    currentTestUserRole = 'GUEST'
    setupPrismaStubs()

    const formData = createMockFormData()
    const request = new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'GUEST'
      }),
      body: formData
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 403)
    const json = await response.json()
    assert.match(json.error, /GUEST role is not authorized/)
  })

  await t.test('rejects request with missing file', async () => {
    currentTestUserRole = 'ADMIN'
    setupPrismaStubs()

    const formData = new FormData()
    formData.append('workspaceId', workspaceId)
    const request = new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'ADMIN'
      }),
      body: formData
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 400)
    const json = await response.json()
    assert.match(json.error, /Missing file/)
  })

  await t.test('rejects request with invalid workspace ID format', async () => {
    currentTestUserRole = 'ADMIN'
    setupPrismaStubs()

    const formData = new FormData()
    const file = new File([Buffer.from('hello')], 'doc.txt')
    formData.append('file', file)
    formData.append('workspaceId', 'invalid-uuid')
    
    const request = new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'ADMIN'
      }),
      body: formData
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 400)
    const json = await response.json()
    assert.match(json.error, /Invalid workspaceId format/)
  })

  await t.test('gracefully fails and rolls back to ERROR on sql insert failure', async () => {
    currentTestUserRole = 'ADMIN'
    setupPrismaStubs()

    // Override executeRawUnsafe to crash
    ;(basePrisma as any).$executeRawUnsafe = async () => {
      throw new Error('Database disk full')
    }

    const formData = createMockFormData('test.txt', 'Crash content')
    const request = new NextRequest('http://localhost/api/ingest', {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'ADMIN'
      }),
      body: formData
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 500)
    const json = await response.json()
    assert.match(json.error, /Ingestion pipeline execution failed/)

    // Confirm that the document status was updated to ERROR
    const errorUpdates = stubs.documentUpdateCaptured.filter((up: any) => up.data.status === 'ERROR')
    assert.strictEqual(errorUpdates.length, 1)
    assert.match(errorUpdates[0].data.errorMessage, /Database disk full/)
  })
})

