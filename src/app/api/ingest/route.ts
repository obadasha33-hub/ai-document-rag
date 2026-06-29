import { NextRequest, NextResponse } from 'next/server'
import { getTenantPrisma, basePrisma } from '@/lib/db'
import { parseDocument } from '@/lib/parser'
import { chunkText } from '@/lib/chunker'
import { randomUUID } from 'crypto'
import { checkUsageLimit } from '@/lib/billing'
import { getEmbedding } from '@/lib/embeddings'
import { resolveClerkAuth } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

const MAX_FILE_SIZE = 15 * 1024 * 1024 // 15MB limit

/**
 * Sanitizes a filename to prevent path traversal.
 * Strips path separators, control characters, and '..' sequences.
 */
function sanitizeFilename(name: string): string {
  if (!name) return 'unnamed'
  return name
    .replace(/[\\/]/g, '_')       // replace path separators
    .replace(/\.{2,}/g, '_')        // replace any sequence of 2+ dots
    .replace(/[^\x20-\x7E]/g, '_') // replace non-printable chars
    .trim() || 'unnamed'
}

export async function POST(request: NextRequest) {
  // Auth via Clerk session (browser session cookie — no JWT needed)
  const auth = await resolveClerkAuth()
  if (auth instanceof NextResponse) return auth
  const { tenantId, userId, role: userRole } = auth

  // Guest validation: only OWNER, ADMIN, or MEMBER roles can ingest documents
  if (userRole === 'GUEST') {
    return NextResponse.json(
      { error: 'Forbidden: GUEST role is not authorized to perform document ingestion' },
      { status: 403 }
    )
  }

  // Enforce billing usage limits
  const billingCheck = await checkUsageLimit(tenantId, 'documents')
  if (!billingCheck.allowed) {
    return NextResponse.json(
      { error: billingCheck.reason || 'Billing limit exceeded' },
      { status: 403 }
    )
  }


  let formData: FormData
  try {
    formData = await request.formData()
  } catch (err) {
    return NextResponse.json(
      { error: 'Invalid multi-part form-data format' },
      { status: 400 }
    )
  }

  const file = formData.get('file') as File | null
  const workspaceId = formData.get('workspaceId') as string | null
  const metadataStr = formData.get('metadata') as string | null

  // Validate presence of required inputs
  if (!file) {
    return NextResponse.json(
      { error: 'Missing file upload' },
      { status: 400 }
    )
  }

  if (!workspaceId) {
    return NextResponse.json(
      { error: 'Missing workspaceId' },
      { status: 400 }
    )
  }

  // Validate UUID formats
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!uuidRegex.test(workspaceId)) {
    return NextResponse.json(
      { error: 'Invalid workspaceId format' },
      { status: 400 }
    )
  }

  // Validate file size
  if (file.size === 0) {
    return NextResponse.json(
      { error: 'Cannot upload empty files' },
      { status: 400 }
    )
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
      { status: 400 }
    )
  }

  const tenantPrisma = getTenantPrisma(tenantId)

  // Verify workspace exists under current tenant for access security
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

  // Validate and parse metadata JSON if provided
  let customMetadata: Record<string, any> = {}
  if (metadataStr) {
    try {
      customMetadata = JSON.parse(metadataStr)
    } catch (e) {
      return NextResponse.json(
        { error: 'Invalid metadata JSON format' },
        { status: 400 }
      )
    }
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to process file buffer content' },
      { status: 500 }
    )
  }

  let document: any
  try {
    // 1. Extract content and structure using parser
    const parsedDoc = await parseDocument(buffer, file.type || '', file.name)
    
    // Combine custom input metadata with parsed document metadata
    const finalMetadata = {
      ...customMetadata,
      ...parsedDoc.metadata,
    }

    // 2. Chunker segmentation
    const chunks = chunkText(parsedDoc.text, {
      maxChunkSize: 1000,
      chunkOverlap: 200,
    })

    if (chunks.length === 0) {
      throw new Error('No content could be extracted or chunked from document.')
    }

    // 3. Generate all embeddings outside the transaction to prevent database transaction timeouts
    const chunksWithEmbeddings: any[] = []
    for (const chunk of chunks) {
      const embedding = await getEmbedding(chunk.content)
      chunksWithEmbeddings.push({
        ...chunk,
        embedding
      })
    }

    // 4. Write document creations, chunk inserts, and usage increments inside a database transaction block
    const result = await basePrisma.$transaction(async (tx) => {
      // Create the document model entry with processing status
      const doc = await tx.document.create({
        data: {
          tenantId,
          workspaceId,
          name: file.name,
          filePath: `uploads/${tenantId}/${workspaceId}/${randomUUID()}-${sanitizeFilename(file.name)}`,
          fileSize: file.size,
          mimeType: file.type || 'application/octet-stream',
          status: 'PROCESSING',
          metadata: customMetadata,
        },
      })
      document = doc

      // Bulk insert chunks using createMany to avoid pgBouncer transaction timeouts
      await tx.chunk.createMany({
        data: chunksWithEmbeddings.map(item => ({
          id: randomUUID(),
          tenantId,
          documentId: doc.id,
          content: item.content,
          pageNumber: item.metadata?.pageNumber || null,
          tokenCount: item.tokenCount,
          embedding: item.embedding,
        }))
      })

      // Update document to INDEXED status
      const updatedDoc = await tx.document.update({
        where: { id: doc.id },
        data: {
          status: 'INDEXED',
          metadata: finalMetadata,
        },
      })

      // Update usage tracking metrics (documentCount, storageBytes)
      const currentMonth = new Date().toISOString().slice(0, 7) // "YYYY-MM"
      await tx.tenantUsage.upsert({
        where: {
          tenantId_month: {
            tenantId,
            month: currentMonth,
          },
        },
        update: {
          documentCount: { increment: 1 },
          storageBytes: { increment: BigInt(file.size) },
        },
        create: {
          tenantId,
          month: currentMonth,
          documentCount: 1,
          storageBytes: BigInt(file.size),
        },
      })

      // Write log entry to AuditLog
      await tx.auditLog.create({
        data: {
          tenantId,
          userId: userId || null,
          action: 'FILE_UPLOAD',
          description: `Successfully uploaded, parsed, and chunked '${file.name}' (${file.size} bytes) into ${chunks.length} chunks.`,
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
    console.error('Ingestion pipeline crashed:', err)
    
    // Attempt status rollback to ERROR inside database (for mock or non-transactional fallback)
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
        console.error('Failed to update document status to ERROR:', dbErr)
      }
    }

    const errorDetails = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
      ? (err instanceof Error ? err.message : String(err))
      : undefined

    return NextResponse.json(
      {
        error: 'Ingestion pipeline execution failed',
        details: errorDetails,
      },
      { status: 500 }
    )
  }
}
