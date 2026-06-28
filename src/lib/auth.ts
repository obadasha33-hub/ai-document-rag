import { basePrisma } from './db'
import crypto from 'crypto'

/**
 * Computes a SHA-256 hash of a string using Web Crypto API,
 * ensuring compatibility with both Edge Runtime and Node.js.
 */
export async function hashApiKey(apiKey: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(apiKey)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Validates an API key by computing its SHA-256 hash and checking the ApiKey database table.
 * Returns the associated tenantId, or null if the key is invalid or expired.
 */
export async function validateApiKeyAndGetTenant(apiKey: string): Promise<string | null> {
  if (!apiKey) return null
  
  try {
    const keyHash = await hashApiKey(apiKey)
    const apiKeyRecord = await basePrisma.apiKey.findUnique({
      where: { keyHash },
      include: { tenant: true },
    })

    if (!apiKeyRecord) return null

    // Check expiration if set
    if (apiKeyRecord.expiresAt && new Date() > new Date(apiKeyRecord.expiresAt)) {
      return null
    }

    // Update last used timestamp asynchronously
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    basePrisma.apiKey.update({
      where: { id: apiKeyRecord.id },
      data: { lastUsedAt: new Date() },
    }).catch(err => console.error('Failed to update API key lastUsedAt:', err))

    return apiKeyRecord.tenantId
  } catch (error) {
    console.error('Error validating API key:', error)
    return null
  }
}

export interface JwtPayload {
  userId: string
  tenantId: string
  email: string
  role: string
}

/**
 * Decodes and verifies a JWT token.
 * FAILS HARD if JWT_SECRET is not set — no fallbacks, no mock tokens.
 */
export async function verifyJwt(token: string): Promise<JwtPayload | null> {
  if (!token) return null

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required but not set.')
  }

  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    const [headerB64, payloadB64, signatureB64] = parts

    // Verify signature cryptographically using HMAC-SHA256
    const secret = process.env.JWT_SECRET
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url')

    if (signatureB64 !== expectedSignature) {
      return null
    }

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString())
    
    // Validate expiration
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      return null
    }

    return {
      userId: payload.sub || payload.userId,
      tenantId: payload.tenantId,
      email: payload.email,
      role: payload.role || 'MEMBER',
    }
  } catch (error) {
    console.error('Error verifying JWT:', error)
    return null
  }
}

/**
 * Signs a payload cryptographically with HMAC-SHA256.
 */
export function signJwt(payload: any): string {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required but not set.')
  }
  const header = { alg: 'HS256', typ: 'JWT' }
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  
  const fullPayload = {
    ...payload,
    exp: payload.exp || Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
  }
  
  const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url')
  const signature = crypto
    .createHmac('sha256', process.env.JWT_SECRET)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url')
  return `${headerB64}.${payloadB64}.${signature}`
}

export type Role = 'OWNER' | 'ADMIN' | 'MEMBER' | 'GUEST'

export const ROLE_LEVELS: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  GUEST: 1,
}

/**
 * Checks if the user role has at least the minimum required level of authority.
 */
export function hasMinimumRole(userRole: string | null | undefined, minRole: Role): boolean {
  if (!userRole) return false
  const userLevel = ROLE_LEVELS[userRole as Role] || 0
  const minLevel = ROLE_LEVELS[minRole] || 0
  return userLevel >= minLevel
}

/**
 * Checks if the user role matches one of the specified allowed roles.
 */
export function validateUserRole(userRole: string | null | undefined, allowedRoles: Role[]): boolean {
  if (!userRole) return false
  return allowedRoles.includes(userRole as Role)
}