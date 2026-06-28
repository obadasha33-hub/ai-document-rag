import { basePrisma } from './db'

/**
 * Audit Logging Service
 * Provides methods to write logs to the PostgreSQL AuditLog table.
 * To ensure logs are write-only at the API controller level, no GET handlers or retrieval endpoints should expose these logs.
 */

export async function logAuditEvent(
  tenantId: string,
  userId: string | null,
  action: string,
  description: string,
  ipAddress?: string | null,
  userAgent?: string | null
) {
  if (!tenantId) {
    throw new Error('Tenant ID is required for audit logging')
  }
  if (!action) {
    throw new Error('Action type is required for audit logging')
  }

  try {
    const auditLog = await basePrisma.auditLog.create({
      data: {
        tenantId,
        userId: userId || null,
        action,
        description,
        ipAddress: ipAddress || null,
        userAgent: userAgent || null,
      },
    })
    return auditLog
  } catch (error) {
    console.error('Failed to write audit log event:', error)
    throw new Error(`Audit logging failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}
