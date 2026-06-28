process.env.NODE_ENV = 'test';

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
import { basePrisma } from '../src/lib/db'
import { scrapeUrlWithFirecrawl } from '../src/lib/firecrawl'
import { searchTavily } from '../src/lib/tavily'
import { runOCR } from '../src/lib/parser'
import { POST } from '../src/app/api/ingest/url/route'
import { NextRequest } from 'next/server'

const tenantId = '11111111-1111-1111-1111-111111111111'
const userId = 'user-999'
const workspaceId = '22222222-2222-2222-2222-222222222222'

test('External Integrations Unit & API Tests', async (t) => {
  const originalFetch = global.fetch
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

  t.afterEach(() => {
    global.fetch = originalFetch
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
  })

  await t.test('scrapeUrlWithFirecrawl falls back to mock markdown when API key is missing', async () => {
    delete process.env.FIRECRAWL_API_KEY
    const result = await scrapeUrlWithFirecrawl('https://example.com')
    assert.match(result.markdown, /Mock Crawled Page/)
    assert.strictEqual(result.title, 'Mock Crawled Website')
  })

  await t.test('scrapeUrlWithFirecrawl queries Firecrawl API endpoint when key is present', async () => {
    process.env.FIRECRAWL_API_KEY = 'real-key-123'
    let fetchCalled = false

    global.fetch = async (url, init: any) => {
      if (typeof url === 'string' && url.includes('api.firecrawl.dev')) {
        fetchCalled = true
        const body = JSON.parse(init.body)
        assert.strictEqual(body.url, 'https://example.com')
        return new Response(JSON.stringify({
          success: true,
          data: {
            markdown: '# Firecrawl Markdown Content',
            metadata: { title: 'Firecrawl Title', description: 'Firecrawl Desc' }
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(url, init)
    }

    const result = await scrapeUrlWithFirecrawl('https://example.com')
    assert.strictEqual(fetchCalled, true)
    assert.strictEqual(result.markdown, '# Firecrawl Markdown Content')
    assert.strictEqual(result.title, 'Firecrawl Title')
  })

  await t.test('searchTavily queries Tavily endpoint and parses JSON results', async () => {
    process.env.TAVILY_API_KEY = 'real-key-456'
    let fetchCalled = false

    global.fetch = async (url, init: any) => {
      if (typeof url === 'string' && url.includes('api.tavily.com')) {
        fetchCalled = true
        return new Response(JSON.stringify({
          results: [
            { title: 'Tavily Result 1', url: 'https://result1.com', content: 'Tavily content 1', score: 0.95 }
          ]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(url, init)
    }

    const results = await searchTavily('what is a vector db')
    assert.strictEqual(fetchCalled, true)
    assert.strictEqual(results.length, 1)
    assert.strictEqual(results[0].title, 'Tavily Result 1')
    assert.strictEqual(results[0].content, 'Tavily content 1')
  })

  await t.test('runOCR invokes OCR.space when OCR_API_KEY is configured', async () => {
    process.env.OCR_API_KEY = 'ocr-key-789'
    let fetchCalled = false

    global.fetch = async (url, init: any) => {
      if (typeof url === 'string' && url.includes('ocr.space')) {
        fetchCalled = true
        return new Response(JSON.stringify({
          ParsedResults: [{ ParsedText: 'Parsed Text from OCR.space' }]
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(url, init)
    }

    const ocrText = await runOCR(Buffer.from('mock-file-content'))
    assert.strictEqual(fetchCalled, true)
    assert.strictEqual(ocrText, 'Parsed Text from OCR.space')
  })

  await t.test('URL Ingestion endpoint stores scraped markdown in database transaction', async () => {
    process.env.FIRECRAWL_API_KEY = 'mock_key'
    
    // Set up database stubs
    const stubs: any = {}
    stubs.workspaceFindUnique = async (args: any) => {
      if (args.where.id === workspaceId) {
        return { id: workspaceId, tenantId, name: 'Main Workspace' }
      }
      return null
    }
    ;(basePrisma.workspace as any).findUnique = stubs.workspaceFindUnique

    stubs.userFindUnique = async (args: any) => {
      if (args.where.id === userId) {
        return { id: userId, tenantId, role: 'ADMIN' }
      }
      return null
    }
    ;(basePrisma.user as any).findUnique = stubs.userFindUnique

    stubs.tenantFindUnique = async (args: any) => {
      if (args.where.id === tenantId) {
        return { id: tenantId, subscriptionStatus: 'FREE' }
      }
      return null
    }
    ;(basePrisma.tenant as any).findUnique = stubs.tenantFindUnique

    stubs.tenantUsageFindUnique = async () => {
      return { documentCount: 1, queryCount: 1 }
    }
    ;(basePrisma.tenantUsage as any).findUnique = stubs.tenantUsageFindUnique

    stubs.documentCreate = async (args: any) => {
      return { id: 'doc-url-123', tenantId, workspaceId, name: args.data.name, status: 'PROCESSING', fileSize: args.data.fileSize }
    }
    ;(basePrisma.document as any).create = stubs.documentCreate

    stubs.documentUpdateCaptured = []
    stubs.documentUpdate = async (args: any) => {
      stubs.documentUpdateCaptured.push(args)
      return { id: args.where.id, status: args.data.status }
    }
    ;(basePrisma.document as any).update = stubs.documentUpdate

    stubs.executeRawUnsafeCaptured = []
    stubs.executeRawUnsafe = async (sql: string, ...params: any[]) => {
      stubs.executeRawUnsafeCaptured.push({ sql, params })
      return 1
    }
    ;(basePrisma as any).$executeRawUnsafe = stubs.executeRawUnsafe

    stubs.tenantUsageUpsertCaptured = []
    stubs.tenantUsageUpsert = async (args: any) => {
      stubs.tenantUsageUpsertCaptured.push(args)
      return { id: 'usage-1', tenantId }
    }
    ;(basePrisma.tenantUsage as any).upsert = stubs.tenantUsageUpsert

    stubs.auditLogCreateCaptured = []
    stubs.auditLogCreate = async (args: any) => {
      stubs.auditLogCreateCaptured.push(args)
      return { id: 'log-1', tenantId }
    }
    ;(basePrisma.auditLog as any).create = stubs.auditLogCreate

    stubs.transaction = async (callback: (tx: any) => Promise<any>) => {
      return callback(basePrisma)
    }
    ;(basePrisma as any).$transaction = stubs.transaction

    // Mock generic embedding fetch
    global.fetch = async (url: string, init: any) => {
      if (url.includes('embeddings')) {
        return new Response(JSON.stringify({
          embedding: { values: new Array(768).fill(0.1) }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return originalFetch(url, init)
    }

    const request = new NextRequest('http://localhost/api/ingest/url', {
      method: 'POST',
      body: JSON.stringify({
        url: 'https://some-news.com/article',
        workspaceId: workspaceId
      })
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 200)

    const json = await response.json()
    assert.strictEqual(json.success, true)
    assert.strictEqual(json.status, 'INDEXED')
    assert.ok(json.chunksCount > 0)

    assert.strictEqual(stubs.executeRawUnsafeCaptured.length > 0, true)
    assert.match(stubs.executeRawUnsafeCaptured[0].sql, /INSERT INTO chunks/)
    assert.strictEqual(stubs.documentUpdateCaptured[0].data.status, 'INDEXED')
  })
})
