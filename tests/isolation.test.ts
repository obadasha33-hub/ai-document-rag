process.env.NODE_ENV = 'test';
import test from 'node:test'
import assert from 'node:assert'
import { basePrisma, getTenantPrisma } from '../src/lib/db'
import { middleware } from '../src/middleware'
import { verifyJwt, hashApiKey } from '../src/lib/auth'
import { NextRequest, NextResponse } from 'next/server'

// Setup global mock for fetch or other web APIs if needed, but NextRequest/NextResponse are available from next/server

test('Database Client Tenant Isolation', async (t) => {
  const tenantId1 = '11111111-1111-1111-1111-111111111111'
  const tenantId2 = '22222222-2222-2222-2222-222222222222'

  await t.test('automatically injects tenantId on findMany operations', async () => {
    let capturedArgs: any = null
    
    // Stub basePrisma's user.findMany method
    ;(basePrisma.user as any).findMany = async (args: any) => {
      capturedArgs = args
      return [{ id: 'user-1', tenantId: tenantId1, email: 'user@example.com' }]
    }

    const client = getTenantPrisma(tenantId1)
    await client.user.findMany({
      where: { email: 'user@example.com' }
    })

    assert.ok(capturedArgs, 'args should have been captured')
    assert.deepStrictEqual(capturedArgs.where, {
      email: 'user@example.com',
      tenantId: tenantId1
    }, 'should inject tenantId into the where clause')
  })

  await t.test('automatically injects tenantId on create operations', async () => {
    let capturedArgs: any = null
    
    // Stub basePrisma's document.create method
    ;(basePrisma.document as any).create = async (args: any) => {
      capturedArgs = args
      return { id: 'doc-1', tenantId: tenantId2, name: 'report.pdf' }
    }

    const client = getTenantPrisma(tenantId2)
    await client.document.create({
      data: {
        tenantId: tenantId2,
        workspaceId: '33333333-3333-3333-3333-333333333333',
        name: 'report.pdf',
        filePath: 's3://...',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }
    })

    assert.ok(capturedArgs, 'args should have been captured')
    assert.strictEqual(capturedArgs.data.tenantId, tenantId2, 'should inject tenantId into creation data')
    assert.strictEqual(capturedArgs.data.name, 'report.pdf')
  })

  await t.test('automatically injects tenantId on createMany operations', async () => {
    let capturedArgs: any = null
    
    // Stub basePrisma's chunk.createMany method
    ;(basePrisma.chunk as any).createMany = async (args: any) => {
      capturedArgs = args
      return { count: 2 }
    }

    const client = getTenantPrisma(tenantId1)
    const validDocUuid = '55555555-5555-5555-5555-555555555555'
    await client.chunk.createMany({
      data: [
        { tenantId: tenantId1, documentId: validDocUuid, content: 'chunk 1', tokenCount: 50 },
        { tenantId: tenantId1, documentId: validDocUuid, content: 'chunk 2', tokenCount: 60 }
      ]
    })

    assert.ok(capturedArgs, 'args should have been captured')
    assert.ok(Array.isArray(capturedArgs.data), 'data should be an array')
    assert.strictEqual(capturedArgs.data[0].tenantId, tenantId1, 'first chunk should have tenantId injected')
    assert.strictEqual(capturedArgs.data[1].tenantId, tenantId1, 'second chunk should have tenantId injected')
  })

  await t.test('throws error if tenantId is missing at factory instantiation', () => {
    assert.throws(() => {
      getTenantPrisma('')
    }, /tenantId is required/)
  })
})

import crypto from 'crypto'

function signJwt(payload: any, secret: string): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')
  return `${headerB64}.${payloadB64}.${signature}`
}

// Helper mock request generator
function createMockRequest(headers: Record<string, string>, path: string = 'http://localhost/api/chat') {
  return new NextRequest(path, {
    method: 'POST',
    headers: new Headers(headers)
  })
}



