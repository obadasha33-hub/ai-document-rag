import { PrismaClient } from '@prisma/client'

// Global declaration for PrismaClient to prevent multiple instances in development
const globalForPrisma = global as unknown as { prisma: PrismaClient }

export const basePrisma = globalForPrisma.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma

// Only store original model methods in test environments (avoids monkeypatch overhead in production)
let originalMethodsInitialized = false
const originalMethods = new Map<string, any>()
const modelKeys = ['tenant', 'workspace', 'user', 'role', 'document', 'chunk', 'auditLog', 'tenantUsage', 'apiKey', 'chatThread', 'chatMessage']

function ensureOriginalMethods() {
  if (originalMethodsInitialized) return
  for (const m of modelKeys) {
    const delegate = (basePrisma as any)[m]
    if (delegate) {
      // Collect from delegate instance keys
      for (const op of Object.keys(delegate)) {
        if (typeof delegate[op] === 'function') {
          originalMethods.set(`${m}.${op}`, delegate[op])
        }
      }
      // Collect from prototype keys
      const proto = Object.getPrototypeOf(delegate)
      if (proto) {
        for (const op of Object.keys(proto)) {
          if (typeof proto[op] === 'function') {
            originalMethods.set(`${m}.${op}`, proto[op])
          }
        }
      }
    }
  }
  originalMethodsInitialized = true
}

ensureOriginalMethods()

/**
 * Returns a scoped Prisma Client instance that automatically injects tenantId
 * into queries, mutations, and creates to guarantee strict isolation boundaries.
 */
export function getTenantPrisma(tenantId: string) {
  if (!tenantId) {
    throw new Error('Tenant context error: tenantId is required to instantiate scoped client database context')
  }

  return basePrisma.$extends({
    name: 'tenantIsolationExtension',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: { model: string; operation: string; args: any; query: (a: any) => Promise<any> }) {
          const modelKey = model.charAt(0).toLowerCase() + model.slice(1)
          const typedArgs = (args || {}) as any

          // Skip tenant id injection for the Tenant model itself
          if (model !== 'Tenant') {
            // Enforce tenant scoping on write operations (create/createMany)
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (operation === 'create') {
              typedArgs.data = typedArgs.data || {}
              typedArgs.data.tenantId = tenantId
            } else if (operation === 'createMany') {
              if (typedArgs.data) {
                if (Array.isArray(typedArgs.data)) {
                  typedArgs.data = typedArgs.data.map((item: any) => ({
                    ...item,
                    tenantId,
                  }))
                } else {
                  typedArgs.data.tenantId = tenantId
                }
              }
            }
            // Enforce tenant scoping on upsert operations
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            else if (operation === 'upsert') {
              typedArgs.create = typedArgs.create || {}
              typedArgs.create.tenantId = tenantId
              
              typedArgs.update = typedArgs.update || {}
              typedArgs.update.tenantId = tenantId

              typedArgs.where = typedArgs.where || {}
              typedArgs.where.tenantId = tenantId
            }
            // Enforce tenant scoping on query/update/delete operations
            else {
              typedArgs.where = typedArgs.where || {}
              typedArgs.where.tenantId = tenantId
            }
          }

          // In test environments, if basePrisma method is stubbed, redirect to it
          const isTest = process.env.NODE_ENV === 'test' || process.env.CI === 'true'
          if (isTest) {
            const currentMethod = (basePrisma as any)[modelKey]?.[operation]
            const originalMethod = originalMethods.get(`${modelKey}.${operation}`)
            if (currentMethod && currentMethod !== originalMethod) {
              return currentMethod(typedArgs)
            }
          }

          return query(typedArgs)
        },
      },
    },
  })
}

export type TenantPrismaClient = ReturnType<typeof getTenantPrisma>

