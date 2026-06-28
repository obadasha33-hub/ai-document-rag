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
import { NextRequest } from 'next/server'
import { basePrisma } from '../src/lib/db'
import { POST } from '../src/app/api/workspace/delete/route'

const tenantId = '11111111-1111-1111-1111-111111111111'
const workspaceId = '33333333-3333-3333-3333-333333333333'
const userId = 'user-999'
let currentTestUserRole = 'ADMIN'


test('GDPR Workspace Hard Purge API Handler', async (t) => {
  const originalFindUniqueWorkspace = basePrisma.workspace.findUnique
  const originalExecuteRaw = basePrisma.$executeRaw
  const originalCreateAuditLog = basePrisma.auditLog.create
  const originalTransaction = basePrisma.$transaction
  const originalFindUniqueUser = basePrisma.user.findUnique


  const stubs: any = {}

  t.afterEach(() => {
    basePrisma.workspace.findUnique = originalFindUniqueWorkspace
    basePrisma.$executeRaw = originalExecuteRaw
    basePrisma.auditLog.create = originalCreateAuditLog
    basePrisma.$transaction = originalTransaction
    basePrisma.user.findUnique = originalFindUniqueUser
  })

  const setupPurgeStubs = () => {
    stubs.workspaceFindUnique = async (args: any) => {
      if (args.where.id === workspaceId) {
        return {
          id: workspaceId,
          tenantId,
          name: 'GDPR Archive Workspace',
          documents: [
            { id: 'doc-1', filePath: 'uploads/tenant-1/workspace-1/doc1.pdf' },
            { id: 'doc-2', filePath: 's3://some-cloud-storage/doc2.docx' }
          ]
        }
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


    stubs.executeRawCaptured = []
    stubs.executeRaw = async (strings: TemplateStringsArray, ...values: any[]) => {
      stubs.executeRawCaptured.push({ strings, values })
      return 1
    }
    ;(basePrisma as any).$executeRaw = stubs.executeRaw

    stubs.auditLogCreateCaptured = []
    stubs.auditLogCreate = async (args: any) => {
      stubs.auditLogCreateCaptured.push(args)
      return { id: 'audit-gdpr-1', tenantId }
    }
    ;(basePrisma.auditLog as any).create = stubs.auditLogCreate

    stubs.transaction = async (callback: (tx: any) => Promise<any>) => {
      return callback(basePrisma)
    }
    ;(basePrisma as any).$transaction = stubs.transaction
  }

  await t.test('successfully executes transactional raw SQL deletes for workspace, threads, messages, chunks, and documents', async () => {
    currentTestUserRole = 'ADMIN'
    setupPurgeStubs()

    const request = new NextRequest(`http://localhost/api/workspace/delete?id=${workspaceId}`, {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'ADMIN'
      })
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 200)

    const json = await response.json()
    assert.strictEqual(json.success, true)
    assert.strictEqual(json.workspaceId, workspaceId)
    assert.strictEqual(json.deletedDocuments, 2)
    assert.ok(json.deletedFiles.length >= 2)

    // Assert that raw SQL executions were captured and targeted the correct workspace/tenant UUIDs
    assert.strictEqual(stubs.executeRawCaptured.length, 5)
    for (const sqlExecution of stubs.executeRawCaptured) {
      // Every query parameters must target the workspaceId and tenantId
      assert.ok(sqlExecution.values.includes(workspaceId), 'SQL must filter by workspaceId')
      assert.ok(sqlExecution.values.includes(tenantId), 'SQL must filter by tenantId to enforce isolation boundaries')
    }

    // Verify audit log entry
    assert.strictEqual(stubs.auditLogCreateCaptured.length, 1)
    const auditRecord = stubs.auditLogCreateCaptured[0]
    assert.strictEqual(auditRecord.data.action, 'WORKSPACE_PURGED')
    assert.strictEqual(auditRecord.data.tenantId, tenantId)
    assert.strictEqual(auditRecord.data.userId, userId)
    assert.match(auditRecord.data.description, /GDPR Hard-Purge executed/)
  })

  await t.test('denies purge request if user role is MEMBER', async () => {
    currentTestUserRole = 'MEMBER'
    setupPurgeStubs()

    const request = new NextRequest(`http://localhost/api/workspace/delete?id=${workspaceId}`, {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'MEMBER'
      })
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 403)
    const json = await response.json()
    assert.match(json.error, /Insufficient permissions/)
  })

  await t.test('rejects purge request if workspace ID format is invalid', async () => {
    currentTestUserRole = 'OWNER'
    setupPurgeStubs()

    const request = new NextRequest('http://localhost/api/workspace/delete?id=bad-uuid-format', {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'OWNER'
      })
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 400)
    const json = await response.json()
    assert.match(json.error, /Invalid workspaceId format/)
  })

  await t.test('returns 404 if workspace does not exist under tenant', async () => {
    currentTestUserRole = 'ADMIN'
    setupPurgeStubs()

    const request = new NextRequest('http://localhost/api/workspace/delete?id=00000000-0000-0000-0000-000000000000', {
      method: 'POST',
      headers: new Headers({
        'x-tenant-id': tenantId,
        'x-user-id': userId,
        'x-user-role': 'ADMIN'
      })
    })

    const response = await POST(request)
    assert.strictEqual(response.status, 404)
    const json = await response.json()
    assert.match(json.error, /Workspace not found or unauthorized/)
  })
})

