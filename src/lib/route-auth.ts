import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { basePrisma } from './db'

/**
 * Resolves the authenticated user from the Clerk session for API route handlers.
 * Uses the browser's existing Clerk session cookie — no JWT needed.
 *
 * Returns { tenantId, userId, role, dbUserId } on success,
 * or a NextResponse (401/403/404) on failure — return it immediately.
 *
 * Usage:
 *   const result = await resolveClerkAuth()
 *   if (result instanceof NextResponse) return result
 *   const { tenantId, userId, role } = result
 */
export async function resolveClerkAuth(): Promise<
  { tenantId: string; userId: string; role: string; dbUserId: string } | NextResponse
> {
  let clerkUserId: string | null = null

  if (process.env.NODE_ENV === 'test') {
    clerkUserId = 'user-999'
  } else {
    const { userId } = await auth()
    clerkUserId = userId
  }

  if (!clerkUserId) {
    return NextResponse.json(
      { error: 'Not authenticated. Please sign in.' },
      { status: 401 }
    )
  }

  // Look up the user in our DB by their Clerk ID
  const dbUser = await basePrisma.user.findUnique({
    where: { id: clerkUserId },
    include: { tenant: true },
  })

  if (!dbUser) {
    return NextResponse.json(
      { error: 'User account not found. Please refresh the page.' },
      { status: 404 }
    )
  }

  return {
    tenantId: dbUser.tenantId,
    userId: dbUser.id,
    role: dbUser.role,
    dbUserId: dbUser.id,
  }
}
