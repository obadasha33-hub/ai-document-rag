import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'

const CACHE_FILE = process.env.NODE_ENV === 'production'
  ? path.join(os.tmpdir(), '.embeddings-cache.json')
  : path.join(process.cwd(), '.embeddings-cache.json')

export const EMBEDDING_DIM = 768

let cache: Record<string, number[]> = {}
let cacheLoaded = false

async function ensureCacheLoaded() {
  if (cacheLoaded) return
  try {
    if (existsSync(CACHE_FILE)) {
      const data = await fs.readFile(CACHE_FILE, 'utf-8')
      cache = JSON.parse(data)
    }
  } catch (e) {
    // Gracefully handle missing or corrupted cache file
  }
  cacheLoaded = true
}

function enforceCacheLimit() {
  const keys = Object.keys(cache)
  if (keys.length > 5000) {
    const keysToRemove = keys.slice(0, keys.length - 5000)
    for (const key of keysToRemove) {
      delete cache[key]
    }
  }
}

async function saveCache() {
  try {
    const dir = path.dirname(CACHE_FILE)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8')
  } catch (e) {
    // Gracefully handle write failures
  }
}

export function getDeterministicMockEmbedding(text: string): number[] {
  const hash = crypto.createHash('sha256').update(text).digest()
  const vector: number[] = []
  let seed = 0
  for (let i = 0; i < 4; i++) {
    seed = (seed << 8) + hash[i]
  }
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    vector.push((seed / 4294967296) - 0.5)
  }
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  return magnitude > 0 ? vector.map(val => val / magnitude) : Array(EMBEDDING_DIM).fill(0)
}

export async function getEmbedding(
  text: string,
  taskType: 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' = 'RETRIEVAL_DOCUMENT'
): Promise<number[]> {
  const cleanText = text.trim()
  if (!cleanText) {
    return Array(EMBEDDING_DIM).fill(0)
  }

  await ensureCacheLoaded()

  const hashKey = crypto.createHash('sha256').update(cleanText + ':' + taskType).digest('hex')
  if (cache[hashKey]) {
    return cache[hashKey]
  }

  const apiKey = process.env.GOOGLE_API_KEY
  if (!apiKey || apiKey === 'mock_key' || apiKey.startsWith('mock-')) {
    const vector = getDeterministicMockEmbedding(cleanText)
    cache[hashKey] = vector
    enforceCacheLimit()
    await saveCache()
    return vector
  }

  // Cascading try for different endpoints and model versions
  const attempts = [
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-2:embedContent`,
      model: 'models/gemini-embedding-2'
    },
    {
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent`,
      model: 'models/gemini-embedding-001'
    },
    {
      url: `https://generativelanguage.googleapis.com/v1/models/gemini-embedding-2:embedContent`,
      model: 'models/gemini-embedding-2'
    },
    {
      url: `https://generativelanguage.googleapis.com/v1/models/gemini-embedding-001:embedContent`,
      model: 'models/gemini-embedding-001'
    }
  ]

  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    try {
      const response = await fetch(attempt.url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          model: attempt.model,
          content: { parts: [{ text: cleanText }] },
          taskType,
          outputDimensionality: EMBEDDING_DIM
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const vector = data?.embedding?.values
        if (vector && Array.isArray(vector)) {
          cache[hashKey] = vector
          enforceCacheLimit()
          await saveCache()
          return vector
        }
      } else {
        const errText = await response.text()
        console.warn(`Gemini embedding attempt ${i + 1} failed: ${response.status} - ${errText}`)
      }
    } catch (err) {
      console.warn(`Gemini embedding attempt ${i + 1} threw error:`, err)
    }
  }

  // Fallback: local deterministic mockup
  const vector = getDeterministicMockEmbedding(cleanText)
  cache[hashKey] = vector
  enforceCacheLimit()
  return vector
}
