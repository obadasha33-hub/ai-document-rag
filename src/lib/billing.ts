import { basePrisma } from './db'

// Fixed limits for the entirely free tier
const FREE_LIMITS = {
  documents: 20,  // Reasonable free limit
  queries: 200,   // Enough for daily use
}

export interface UsageCheckResult {
  allowed: boolean
  overage: boolean
  currentCount: number
  limit: number
  reason?: string
}

/**
 * Checks usage limit for a specific tenant and feature (documents or queries).
 * Since the platform is now 100% free, this only enforces soft/hard limits and
 * returns clear information about those limits.
 */
export async function checkUsageLimit(
  tenantId: string,
  feature: 'documents' | 'queries'
): Promise<UsageCheckResult> {
  const tenant = await basePrisma.tenant.findUnique({
    where: { id: tenantId },
  })

  if (!tenant) {
    return {
      allowed: false,
      overage: false,
      currentCount: 0,
      limit: 0,
      reason: 'Tenant not found'
    }
  }

  const currentMonth = new Date().toISOString().slice(0, 7) // "YYYY-MM"
  const usage = await basePrisma.tenantUsage.findUnique({
    where: {
      tenantId_month: {
        tenantId,
        month: currentMonth
      }
    }
  })

  const currentCount = usage ?
    feature === 'documents' ? usage.documentCount : usage.queryCount
    : 0

  const limit = FREE_LIMITS[feature]
  const isAllowed = currentCount < limit
  const isOverage = currentCount >= limit

  if (!isAllowed) {
    return {
      allowed: false,
      overage: true,
      currentCount,
      limit,
      reason: `Your free tier allows ${limit} ${feature} per month. Upgrade to increase limits (coming soon).`
    }
  }

  return {
    allowed: true,
    overage: false,
    currentCount,
    limit
  }
}