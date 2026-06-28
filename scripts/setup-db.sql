-- SQL setup script to initialize the Postgres database with pgvector support
-- Use this script to set up tables on managed services like Supabase or Neon Postgres

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Create Enum types (Postgres requires explicit creation if not exists)
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'GUEST');
CREATE TYPE "SubscriptionStatus" AS ENUM ('FREE');
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADING', 'PROCESSING', 'INDEXED', 'ERROR');
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- 3. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 4. Create users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    role "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "users_tenantId_idx" ON users("tenantId");

-- 5. Create workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    "systemPrompt" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "workspaces_tenantId_idx" ON workspaces("tenantId");

-- 6. Create documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "workspaceId" UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    status "DocumentStatus" NOT NULL DEFAULT 'UPLOADING',
    "errorMessage" TEXT,
    metadata JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "documents_tenantId_workspaceId_idx" ON documents("tenantId", "workspaceId");

-- 7. Create chunks table (with vector(768) type for embeddings)
CREATE TABLE IF NOT EXISTS chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "documentId" UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    "pageNumber" INTEGER,
    "tokenCount" INTEGER NOT NULL,
    embedding vector(768),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "chunks_tenantId_documentId_idx" ON chunks("tenantId", "documentId");

-- Create HNSW index on chunk embeddings for fast approximate nearest neighbor search
-- 768 is the default dimension of text-embedding-004
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_cosine_idx ON chunks 
USING hnsw (embedding vector_cosine_ops);

-- 8. Create tenant_usages table
CREATE TABLE IF NOT EXISTS tenant_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    "documentCount" INTEGER NOT NULL DEFAULT 0,
    "storageBytes" BIGINT NOT NULL DEFAULT 0,
    "queryCount" INTEGER NOT NULL DEFAULT 0,
    "apiCallCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "tenant_usages_tenantId_month_key" UNIQUE ("tenantId", month)
);

-- 9. Create api_keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    "keyHash" TEXT UNIQUE NOT NULL,
    "keyHint" TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "expiresAt" TIMESTAMP WITH TIME ZONE,
    "lastUsedAt" TIMESTAMP WITH TIME ZONE
);
CREATE INDEX IF NOT EXISTS "api_keys_tenantId_idx" ON api_keys("tenantId");

-- 10. Create chat_threads table
CREATE TABLE IF NOT EXISTS chat_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "workspaceId" UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    "userId" TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "chat_threads_tenantId_workspaceId_userId_idx" ON chat_threads("tenantId", "workspaceId", "userId");

-- 11. Create chat_messages table
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "threadId" UUID NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
    role "MessageRole" NOT NULL,
    content TEXT NOT NULL,
    citations JSONB,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "chat_messages_threadId_idx" ON chat_messages("threadId");

-- 12. Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    "userId" TEXT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "audit_logs_tenantId_createdAt_idx" ON audit_logs("tenantId", "createdAt");
