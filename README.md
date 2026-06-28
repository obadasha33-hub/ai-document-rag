# VeritasDoc (Enterprise Document RAG)

VeritasDoc is a production-ready, secure, and multi-tenant Enterprise Document RAG (Retrieval-Augmented Generation) application built on Next.js 15 App Router and PostgreSQL with pgvector. It features full tenancy isolation, reciprocal rank fusion hybrid search, candidate reranking, web search grounding, webpage crawling, cloud OCR parsing, and Clerk user authentication.

---

## 🚀 Key Features

* **Multi-Tenant Isolation:** Database isolation boundaries are automatically injected into queries/creates via custom Prisma extensions, ensuring users never see data from other tenants.
* **Hybrid Search (Dense + Lexical):** Combines vector semantic search (Cosine similarity) with full-text search using **Reciprocal Rank Fusion (RRF)**.
* **Smart Reranking:** Integrates Cohere Rerank v3 to prioritize context relevance before prompt compilation.
* **Web Search Grounding:** Dynamically fetches search matches from the **Tavily API** if local document context is insufficient.
* **Dynamic Web Crawler:** Crawls any website URL using **Firecrawl** and ingests clean markdown context.
* **Cloud OCR:** Automatically extracts text from uploaded images and scanned PDFs using **OCR.space**.
* **Zero-Config Fallback Mode:** Works out-of-the-box in local offline mode without external API keys (uses deterministic local SHA-256 embeddings, canned streams, and Jaccard word-overlap relevance scorers).

---

## 🛠️ Tech Stack

* **Framework:** Next.js 15 (App Router, Server Actions, Edge SSE Streamers)
* **Database & Vector Store:** PostgreSQL + `pgvector`
* **ORM:** Prisma Client
* **Auth:** Clerk (Multi-tenant User Session Auth)
* **LLM Completions:** NVIDIA NIM API (`nemotron-3-ultra`) or OpenAI API
* **Embeddings:** Google Gemini API (`gemini-embedding-2` / `gemini-embedding-001`) with customized dimensionality limits
* **Reranking:** Cohere Rerank API

---

## 📦 Getting Started

### 1. Prerequisites
Ensure you have Node.js 18+ and a running PostgreSQL instance with the `pgvector` extension installed.

### 2. Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/your-username/veritas-doc.git
cd veritas-doc
npm install
```

### 3. Setup Environment Variables
Copy the env template file and populate it with your database connection details and API keys:
```bash
cp .env.example .env
```
*(See `.env` for detailed documentation of each key.)*

### 4. Database Schema Setup
Activate `pgvector` and construct the tables. You can run the database initialization script located in the repository:
```bash
# Run schema migrations
npx prisma db push
```
Alternatively, execute the custom SQL script [setup-db.sql](scripts/setup-db.sql) directly on your Supabase, Neon, or local PostgreSQL database console to construct the HNSW vector indices and table references.

### 5. Running the Application
Boot up the local Next.js development server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to view the application workspace.

---

## 🧪 Testing

The codebase includes 50 integration and unit tests covering RBAC authorization, billing quota checks, RRF hybrid search, database tenancy, ingestion pipelines, and GDPR purges.

Run the test suite:
```bash
npm test
```

---

## ☁️ Deployment

### 1. Database Provisioning
We recommend **Supabase** or **Neon Postgres** for cloud hosting:
* Create a database.
* Activate the `vector` extension in the SQL editor: `CREATE EXTENSION IF NOT EXISTS vector;`.
* Run standard migrations or use the [setup-db.sql](scripts/setup-db.sql) script.

### 2. Frontend & API Hosting (Vercel)
The project contains a [vercel.json](vercel.json) build profile. To deploy:
* Import your project repository into Vercel.
* Add your environment variables (`DATABASE_URL`, `CLERK_SECRET_KEY`, `GOOGLE_API_KEY`, etc.) in the Project Settings.
* Click **Deploy**.
