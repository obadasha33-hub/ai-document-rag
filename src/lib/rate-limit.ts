/**
 * Simple in-memory rate limiter for API routes.
 * Limits are applied per-IP per-endpoint to prevent abuse.
 * In production, replace with @upstash/ratelimit + Redis or similar.
 */

interface RateLimitEntry {
  count: number
  firstHit: number
  blocked: boolean
}

const store = new Map<string, RateLimitEntry>()

const LIMIT = 60 // requests
const WINDOW = 60 * 1000 // 60 seconds

function getKey(ip: string, endpoint: string): string {
  return `${ip}:${endpoint}`
}

function pruneExpiredEntries(now: number) {
  for (const [key, entry] of store.entries()) {
    if (now - entry.firstHit > WINDOW) {
      store.delete(key)
    }
  }
}

export function checkRateLimit(ip: string, endpoint: string): { allowed: boolean; retryAfter: number } {
  const key = getKey(ip, endpoint)
  const now = Date.now()
  
  if (store.size > 2000) {
    pruneExpiredEntries(now)
  }

  let entry = store.get(key)

  if (!entry || now - entry.firstHit > WINDOW) {
    entry = { count: 1, firstHit: now, blocked: false }
    store.set(key, entry)
    return { allowed: true, retryAfter: 0 }
  }

  entry.count += 1

  if (entry.count > LIMIT) {
    entry.blocked = true
    const elapsed = now - entry.firstHit
    const retryAfter = Math.ceil((WINDOW - elapsed) / 1000)
    return { allowed: false, retryAfter: Math.max(1, retryAfter) }
  }

  return { allowed: true, retryAfter: 0 }
}

export function getRateLimitStatus(ip: string, endpoint: string): { allowed: boolean; count: number; limit: number; window: number; remaining: number; } {
  const key = getKey(ip, endpoint)
  const entry = store.get(key)
  const count = entry ? entry.count : 0
  return {
    allowed: true,
    count,
    limit: LIMIT,
    window: WINDOW,
    remaining: Math.max(0, LIMIT - count)
  }
}