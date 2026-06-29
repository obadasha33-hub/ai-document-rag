import { NextRequest, NextResponse } from 'next/server'
import { getTenantPrisma, basePrisma } from '@/lib/db'
import { scrapeUrlWithFirecrawl } from '@/lib/firecrawl'
import { chunkText } from '@/lib/chunker'
import { randomUUID } from 'crypto'
import { checkUsageLimit } from '@/lib/billing'
import { getEmbedding } from '@/lib/embeddings'
import { resolveClerkAuth } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const auth = await resolveClerkAuth()
  if (auth instanceof NextResponse) return auth
  const { tenantId, userId, role: userRole } = auth

  if (userRole === 'GUEST') {
    return NextResponse.json(
      { error: 'Forbidden: GUEST role is not authorized to perform URL ingestion' },
      { status: 403 }
    )
  }

  const billingCheck = await checkUsageLimit(tenantId, 'documents')
  if (!billingCheck.allowed) {
    return NextResponse.json(
      { error: billingCheck.reason || 'Billing limit exceeded' },
      { status: 403 }
    )
  }

  let body: any
  try {
    body = await request.json()
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid JSON request body' },
      { status: 400 }
    )
  }

  const { url, workspaceId } = body

  if (!url) {
    return NextResponse.json(
      { error: 'Missing required field: url' },
      { status: 400 }
    )
  }

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'Missing required field: workspaceId' },
      { status: 400 }
    )
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(workspaceId)) {
    return NextResponse.json(
      { error: 'Invalid workspaceId format' },
      { status: 400 }
    )
  }

  const tenantPrisma = getTenantPrisma(tenantId)
  let workspace
  try {
    workspace = await tenantPrisma.workspace.findUnique({
      where: { id: workspaceId },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Database access failure verifying workspace' },
      { status: 500 }
    )
  }

  if (!workspace) {
    return NextResponse.json(
      { error: 'Workspace not found or unauthorized' },
      { status: 404 }
    )
  }

  let document: any = null
  try {
    // 1. Fetch and clean website content via Firecrawl
    const crawlResult = await scrapeUrlWithFirecrawl(url)
    
    // 2. Chunker segmentation
    const chunks = chunkText(crawlResult.markdown, {
      maxChunkSize: 1000,
      chunkOverlap: 200,
    })

    if (chunks.length === 0) {
      throw new Error('No content could be extracted or chunked from website.')
    }

    const documentName = crawlResult.title || `Web Page: ${url.replace(/^https?:\/\/(www\.)?/, '')}`
    const fakeFileSize = Buffer.byteLength(crawlResult.markdown, 'utf8')

    // 3. Generate all embeddings outside the transaction to prevent database transaction timeouts
    const chunksWithEmbeddings: any[] = []
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk.content)
      chunksWithEmbeddings.push({
        ...chunk,
        embedding
      })
    }

    // 4. Write document creation and chunk vector inserts inside a transaction
    const result = await basePrisma.$transaction(async (tx) => {
      const doc = await tx.document.create({
        data: {
          tenantId,
          workspaceId,
          name: documentName,
          filePath: `urls/${tenantId}/${workspaceId}/${randomUUID()}`,
          fileSize: fakeFileSize,
          mimeType: 'text/markdown',
          status: 'PROCESSING',
          metadata: {
            url,
            description: crawlResult.description || null,
          },
        },
      })
      document = doc

      for (const item of chunksWithEmbeddings) {
        const chunkId = randomUUID()
        await tx.$executeRawUnsafe(
          'INSERT INTO chunks (id, "tenantId", "documentId", content, "pageNumber", "tokenCount", embedding) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb)',
          chunkId,
          tenantId,
          doc.id,
          item.content,
          null,
          item.tokenCount,
          JSON.stringify(item.embedding)
        )
      }

      const updatedDoc = await tx.document.update({
        where: { id: doc.id },
        data: {
          status: 'INDEXED',
        },
      })

      const currentMonth = new Date().toISOString().slice(0, 7)
      await tx.tenantUsage.upsert({
        where: {
          tenantId_month: {
            tenantId,
            month: currentMonth,
          },
        },
        update: {
          documentCount: { increment: 1 },
          storageBytes: { increment: BigInt(fakeFileSize) },
        },
        create: {
          tenantId,
          month: currentMonth,
          documentCount: 1,
          storageBytes: BigInt(fakeFileSize),
        },
      })

      await tx.auditLog.create({
        data: {
          tenantId,
          userId: userId || null,
          action: 'FILE_UPLOAD',
          description: `Successfully crawled URL '${url}' into document '${documentName}' (${chunks.length} chunks).`,
          ipAddress: request.headers.get('x-forwarded-for') || null,
          userAgent: request.headers.get('user-agent') || null,
        },
      })

      return updatedDoc
    }, { timeout: 30000 })

    document = result

    return NextResponse.json({
      success: true,
      documentId: document.id,
      chunksCount: chunks.length,
      status: 'INDEXED',
    })

  } catch (err) {
    console.error('URL Ingestion pipeline failed:', err)

    if (document && document.id) {
      try {
        await tenantPrisma.document.update({
          where: { id: document.id },
          data: {
            status: 'ERROR',
            errorMessage: err instanceof Error ? err.message : String(err),
          },
        })
      } catch (dbErr) {
        console.error('Failed to update URL document status to ERROR:', dbErr)
      }
    }

    const errorDetails = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
      ? (err instanceof Error ? err.message : String(err))
      : undefined

    return NextResponse.json(
      {
        error: 'URL Ingestion pipeline execution failed',
        details: errorDetails,
      },
      { status: 500 }
    )
  }
}
