process.env.NODE_ENV = 'test';
import test from 'node:test'
import assert from 'node:assert'
import { basePrisma } from '../src/lib/db'
import {
  hashApiKey,
  validateApiKeyAndGetTenant,
  hasMinimumRole,
  validateUserRole
} from '../src/lib/auth'

const tenantId = '11111111-1111-1111-1111-111111111111'

test('RBAC & Role Helper Routines', async (t) => {
  await t.test('hasMinimumRole computes correct authority hierarchy', () => {
    assert.strictEqual(hasMinimumRole('OWNER', 'OWNER'), true)
    assert.strictEqual(hasMinimumRole('OWNER', 'ADMIN'), true)
    assert.strictEqual(hasMinimumRole('ADMIN', 'OWNER'), false)
    assert.strictEqual(hasMinimumRole('ADMIN', 'MEMBER'), true)
    assert.strictEqual(hasMinimumRole('MEMBER', 'ADMIN'), false)
    assert.strictEqual(hasMinimumRole('MEMBER', 'GUEST'), true)
    assert.strictEqual(hasMinimumRole('GUEST', 'MEMBER'), false)
    assert.strictEqual(hasMinimumRole('GUEST', 'GUEST'), true)
    assert.strictEqual(hasMinimumRole(null, 'MEMBER'), false)
  })

  await t.test('validateUserRole checks exact set memberships', () => {
    assert.strictEqual(validateUserRole('OWNER', ['OWNER', 'ADMIN']), true)
    assert.strictEqual(validateUserRole('MEMBER', ['OWNER', 'ADMIN']), false)
    assert.strictEqual(validateUserRole('GUEST', ['GUEST']), true)
    assert.strictEqual(validateUserRole(undefined, ['MEMBER']), false)
  })
})

test('API Key Generation & Hashed Key Verification', async (t) => {
  const rawKey = 'sk_live_test_123456789'
  const expectedHash = await hashApiKey(rawKey)

  await t.test('hashApiKey generates consistent SHA-256 hex string', async () => {
    const hash = await hashApiKey(rawKey)
    assert.strictEqual(hash, expectedHash)
    assert.strictEqual(hash.length, 64)
  })

  await t.test('validateApiKeyAndGetTenant succeeds with correct active key and triggers async timestamp update', async () => {
    let updateCalled = false
    let updatedId = ''

    ;(basePrisma.apiKey as any).findUnique = async (args: any) => {
      if (args.where.keyHash === expectedHash) {
        return {
          id: 'key-uuid-123',
          tenantId,
          keyHash: expectedHash,
          expiresAt: null
        }
      }
      return null
    }

    ;(basePrisma.apiKey as any).update = async (args: any) => {
      updateCalled = true
      updatedId = args.where.id
      return { id: 'key-uuid-123' }
    }

    const resolved = await validateApiKeyAndGetTenant(rawKey)
    assert.strictEqual(resolved, tenantId)
    
    // Wait for microtask queue to allow async update to run
    await new Promise((resolve) => setTimeout(resolve, 10))
    assert.strictEqual(updateCalled, true)
    assert.strictEqual(updatedId, 'key-uuid-123')
  })

  await t.test('validateApiKeyAndGetTenant fails if key is expired', async () => {
    ;(basePrisma.apiKey as any).findUnique = async () => {
      return {
        id: 'key-expired',
        tenantId,
        keyHash: expectedHash,
        expiresAt: new Date(Date.now() - 5000)
      }
    }

    const resolved = await validateApiKeyAndGetTenant(rawKey)
    assert.strictEqual(resolved, null)
  })
})
