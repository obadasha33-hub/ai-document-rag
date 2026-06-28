'use server'

import { basePrisma } from '@/lib/db'
import { SubscriptionStatus, DocumentStatus, Role } from '@prisma/client'
import { verifyJwt, JwtPayload, signJwt } from '@/lib/auth'
import { cookies } from 'next/headers'
import crypto from 'crypto'
import { auth, currentUser } from '@clerk/nextjs/server'

export interface BootstrapData {
  tenant: {
    id: string
    name: string
    subscriptionStatus: SubscriptionStatus
  }
  workspaces: Array<{
    id: string
    name: string
    systemPrompt: string | null
  }>
  activeWorkspaceId: string
  usage: {
    documentCount: number
    limitDocuments: number
    queryCount: number
    limitQueries: number
    storageBytes: number
  }
  documents: Array<{
    id: string
    name: string
    fileSize: number
    mimeType: string
    status: DocumentStatus
    errorMessage: string | null
    createdAt: string
  }>
  currentUser: {
    id: string
    name: string
    email: string
    role: Role
  }
  token: string
}
async function getCurrentUser(): Promise<JwtPayload | null> {
  try {
    const clerkAuth = await auth()
    console.log('[DEBUG AUTH] clerkAuth:', { userId: clerkAuth.userId, sessionId: clerkAuth.sessionId })
    if (!clerkAuth.userId) {
      console.log('[DEBUG AUTH] No clerkAuth.userId found.')
      return null
    }

    // 1. First, check if the user already exists in the database by their Clerk userId
    let dbUser = await basePrisma.user.findUnique({
      where: { id: clerkAuth.userId },
      include: { tenant: true },
    })

    // 2. If the user does not exist in the database, we need to register/sync them
    if (!dbUser) {
      console.log('[DEBUG AUTH] User not found in DB, attempting to fetch from Clerk API...')
      let email = `user_${clerkAuth.userId}@clerk.local`
      let name = 'Clerk User'

      try {
        const clerkUser = await currentUser()
        if (clerkUser) {
          const clerkEmail = clerkUser.emailAddresses[0]?.emailAddress
          if (clerkEmail) {
            email = clerkEmail
          }
          name = `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim() || email.split('@')[0]
        }
      } catch (err) {
        console.error('[DEBUG AUTH] Failed to fetch full user details from Clerk API, using fallback:', err)
      }

      // Check if user email already exists (maybe created via other routes)
      dbUser = await basePrisma.user.findUnique({
        where: { email },
        include: { tenant: true },
      })

      if (!dbUser) {
        // Create new Tenant, default Workspace, and User
        const tenantName = email.split('@')[0].toUpperCase() + ' Corp'
        const tenant = await basePrisma.tenant.create({
          data: {
            name: tenantName,
            subscriptionStatus: 'FREE',
          },
        })

        // Create default workspace for tenant
        await basePrisma.workspace.create({
          data: {
            tenantId: tenant.id,
            name: 'Default Workspace',
            systemPrompt: 'You are an advanced RAG assistant. Answer questions truthfully using the provided context.',
          },
        })

        dbUser = await basePrisma.user.create({
          data: {
            id: clerkAuth.userId,
            tenantId: tenant.id,
            email,
            name,
            role: 'ADMIN',
          },
          include: { tenant: true },
        })
      } else {
        // Update user ID to link to their Clerk account
        dbUser = await basePrisma.user.update({
          where: { email },
          data: { id: clerkAuth.userId },
          include: { tenant: true },
        })
      }
    }

    return {
      userId: dbUser.id,
      tenantId: dbUser.tenantId,
      email: dbUser.email,
      role: dbUser.role,
    }
  } catch (error) {
    console.error('Error fetching current user from Clerk:', error)
    return null
  }
}
export async function getBootstrapData(selectedWorkspaceId?: string): Promise<BootstrapData> {
  // Require valid authentication — no more mock users
  const authUser = await getCurrentUser()
  if (!authUser) {
    throw new Error('Unauthorized: Valid session required')
  }

  try {
    // 1. Verify tenant exists
    const tenant = await basePrisma.tenant.findUnique({
      where: { id: authUser.tenantId },
    })
    if (!tenant) {
      throw new Error('Tenant not found for authenticated user')
    }

    // 2. Verify user exists in database
    const dbUser = await basePrisma.user.findUnique({
      where: { id: authUser.userId },
    })
    if (!dbUser) {
      throw new Error('User not found in database')
    }

    // 3. Find workspaces for the tenant
    const workspaces = await basePrisma.workspace.findMany({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: 'asc' },
    })

    if (workspaces.length === 0) {
      throw new Error('No workspaces found for tenant. Please create a workspace first.')
    }

    const activeWorkspaceId = selectedWorkspaceId && workspaces.some(w => w.id === selectedWorkspaceId)
      ? selectedWorkspaceId
      : workspaces[0].id

    // Fixed limits for the free tier
    const limitDocs = 20
    const limitQueries = 200

    // 4. Load usage metrics for current month
    const currentMonth = new Date().toISOString().slice(0, 7)
    let usageRecord = await basePrisma.tenantUsage.findUnique({
      where: {
        tenantId_month: {
          tenantId: tenant.id,
          month: currentMonth,
        },
      },
    })

    if (!usageRecord) {
      usageRecord = await basePrisma.tenantUsage.create({
        data: {
          tenantId: tenant.id,
          month: currentMonth,
          documentCount: 0,
          queryCount: 0,
          storageBytes: 0n,
        },
      })
    }

    // 5. Load documents for active workspace
    const documents = await basePrisma.document.findMany({
      where: {
        tenantId: tenant.id,
        workspaceId: activeWorkspaceId,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Sign a fresh JWT token for client-side API route access (e.g. streaming chat)
    const token = signJwt({
      sub: dbUser.id,
      userId: dbUser.id,
      tenantId: tenant.id,
      email: dbUser.email,
      role: dbUser.role,
    })

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        subscriptionStatus: 'FREE',
      },
      workspaces: workspaces.map(w => ({
        id: w.id,
        name: w.name,
        systemPrompt: w.systemPrompt,
      })),
      activeWorkspaceId,
      usage: {
        documentCount: usageRecord.documentCount,
        limitDocuments: limitDocs,
        queryCount: usageRecord.queryCount,
        limitQueries: limitQueries,
        storageBytes: Number(usageRecord.storageBytes),
      },
      documents: documents.map(d => ({
        id: d.id,
        name: d.name,
        fileSize: d.fileSize,
        mimeType: d.mimeType,
        status: d.status,
        errorMessage: d.errorMessage,
        createdAt: d.createdAt.toISOString(),
      })),
      currentUser: {
        id: dbUser.id,
        name: dbUser.name || 'User',
        email: dbUser.email,
        role: dbUser.role,
      },
      token,
    }
  } catch (error) {
    // Re-throw the error to avoid mock data fallback
    throw error
  }
}

export async function createWorkspaceAction(tenantId: string, name: string, systemPrompt?: string): Promise<boolean> {
  const authUser = await getCurrentUser()
  if (!authUser || authUser.tenantId !== tenantId || authUser.role === 'GUEST') {
    throw new Error('Unauthorized or insufficient permissions')
  }

  try {
    await basePrisma.workspace.create({
      data: {
        tenantId,
        name,
        systemPrompt: systemPrompt || null,
      },
    })
    return true
  } catch (err) {
    console.error('Failed to create workspace in DB:', err)
    return false
  }
}

export async function getThreadHistory(tenantId: string, workspaceId: string): Promise<Array<{ id: string, title: string, createdAt: string }>> {
  const authUser = await getCurrentUser()
  if (!authUser || authUser.tenantId !== tenantId) {
    throw new Error('Unauthorized')
  }

  try {
    const threads = await basePrisma.chatThread.findMany({
      where: {
        tenantId,
        workspaceId,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    })
    return threads.map(t => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt.toISOString(),
    }))
  } catch (err) {
    console.error('Failed to fetch thread history:', err)
    return []
  }
}

export async function getThreadMessages(tenantId: string, threadId: string): Promise<Array<{ id: string, role: string, content: string, citations: any, createdAt: string }>> {
  const authUser = await getCurrentUser()
  if (!authUser || authUser.tenantId !== tenantId) {
    throw new Error('Unauthorized')
  }

  try {
    // Validate thread ownership to prevent direct object reference access bypasses
    const thread = await basePrisma.chatThread.findUnique({
      where: { id: threadId }
    })
    if (!thread || thread.tenantId !== tenantId) {
      throw new Error('Unauthorized thread access')
    }

    const messages = await basePrisma.chatMessage.findMany({
      where: {
        threadId,
      },
      orderBy: { createdAt: 'asc' },
    })
    return messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      citations: m.citations,
      createdAt: m.createdAt.toISOString(),
    }))
  } catch (err) {
    console.error('Failed to fetch thread messages:', err)
    return []
  }
}


export async function getSessionUser(): Promise<JwtPayload | null> {
  return getCurrentUser()
}

export async function loginAction(email: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Please enter a valid email address.' }
    }

    // 1. Find user by email
    let user = await basePrisma.user.findUnique({
      where: { email },
      include: { tenant: true },
    })

    // 2. If user doesn't exist, create a new Tenant, Workspace, and User
    if (!user) {
      const tenantName = email.split('@')[0].toUpperCase() + ' Corp'
      const tenant = await basePrisma.tenant.create({
        data: {
          name: tenantName,
          subscriptionStatus: 'FREE',
        },
      })

      // Create default workspace for tenant
      await basePrisma.workspace.create({
        data: {
          tenantId: tenant.id,
          name: 'Default Workspace',
          systemPrompt: 'You are an advanced RAG assistant. Answer questions truthfully using the provided context.',
        },
      })

      user = await basePrisma.user.create({
        data: {
          id: `usr_${crypto.randomUUID()}`,
          tenantId: tenant.id,
          email,
          name: email.split('@')[0],
          role: 'ADMIN',
        },
        include: { tenant: true },
      })
    }

    // 3. Sign JWT
    const payload = {
      sub: user.id,
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    }

    const token = signJwt(payload)

    // 4. Set session cookie
    const cookieStore = await cookies()
    cookieStore.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    })

    return { success: true }
  } catch (err: any) {
    console.error('Login action error:', err)
    return { success: false, error: err.message || 'An error occurred during authentication.' }
  }
}

export async function logoutAction(): Promise<boolean> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
  return true
}