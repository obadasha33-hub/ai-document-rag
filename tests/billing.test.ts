process.env.NODE_ENV = 'test';
import test from 'node:test'
import assert from 'node:assert'
import { checkUsageLimit } from '../src/lib/billing'
import { basePrisma } from '../src/lib/db'

test('Billing & Usage limits', async (t) => {
  const tenantId = '11111111-1111-1111-1111-111111111111'
  const originalFindUniqueTenant = basePrisma.tenant.findUnique
  const originalFindUniqueTenantUsage = basePrisma.tenantUsage.findUnique

  t.afterEach(() => {
    basePrisma.tenant.findUnique = originalFindUniqueTenant
    basePrisma.tenantUsage.findUnique = originalFindUniqueTenantUsage
  })

  await t.test('checkUsageLimit returns allowed=true if usage is below limit', async () => {
    ;(basePrisma.tenant as any).findUnique = async () => ({
      id: tenantId,
      subscriptionStatus: 'FREE'
    })

    ;(basePrisma.tenantUsage as any).findUnique = async () => ({
      tenantId,
      documentCount: 5,
      queryCount: 50
    })

    const docCheck = await checkUsageLimit(tenantId, 'documents')
    assert.strictEqual(docCheck.allowed, true)
    assert.strictEqual(docCheck.overage, false)
    assert.strictEqual(docCheck.currentCount, 5)
    assert.strictEqual(docCheck.limit, 20)

    const queryCheck = await checkUsageLimit(tenantId, 'queries')
    assert.strictEqual(queryCheck.allowed, true)
    assert.strictEqual(queryCheck.overage, false)
    assert.strictEqual(queryCheck.currentCount, 50)
    assert.strictEqual(queryCheck.limit, 200)
  })

  await t.test('checkUsageLimit returns allowed=false if usage exceeds limit', async () => {
    ;(basePrisma.tenant as any).findUnique = async () => ({
      id: tenantId,
      subscriptionStatus: 'FREE'
    })

    ;(basePrisma.tenantUsage as any).findUnique = async () => ({
      tenantId,
      documentCount: 20,
      queryCount: 205
    })

    const docCheck = await checkUsageLimit(tenantId, 'documents')
    assert.strictEqual(docCheck.allowed, false)
    assert.strictEqual(docCheck.overage, true)
    assert.strictEqual(docCheck.currentCount, 20)

    const queryCheck = await checkUsageLimit(tenantId, 'queries')
    assert.strictEqual(queryCheck.allowed, false)
    assert.strictEqual(queryCheck.overage, true)
    assert.strictEqual(queryCheck.currentCount, 205)
  })

  await t.test('checkUsageLimit returns allowed=false if tenant not found', async () => {
    ;(basePrisma.tenant as any).findUnique = async () => null

    const result = await checkUsageLimit(tenantId, 'documents')
    assert.strictEqual(result.allowed, false)
    assert.strictEqual(result.reason, 'Tenant not found')
  })
})

