import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const cacheDirectory = path.resolve(__dirname, '../../.cache')
const cacheFilePath = path.join(cacheDirectory, 'runtime-cache.json')

let cacheStore = null
let cacheReadyPromise = null

async function ensureCacheLoaded() {
  if (cacheStore) {
    return cacheStore
  }

  if (!cacheReadyPromise) {
    cacheReadyPromise = (async () => {
      await mkdir(cacheDirectory, { recursive: true })

      try {
        const rawContents = await readFile(cacheFilePath, 'utf8')
        cacheStore = JSON.parse(rawContents)
      } catch {
        cacheStore = {}
      }

      return cacheStore
    })()
  }

  return cacheReadyPromise
}

async function persistCache() {
  if (!cacheStore) {
    return
  }

  await mkdir(cacheDirectory, { recursive: true })
  await writeFile(cacheFilePath, JSON.stringify(cacheStore, null, 2), 'utf8')
}

export async function getCacheEntry(namespace, key, { allowStale = false } = {}) {
  const store = await ensureCacheLoaded()
  const namespaceEntries = store[namespace] || {}
  const entry = namespaceEntries[key]

  if (!entry) {
    return null
  }

  if (allowStale || entry.expiresAt > Date.now()) {
    return entry.value
  }

  delete namespaceEntries[key]
  store[namespace] = namespaceEntries
  await persistCache()
  return null
}

export async function setCacheEntry(namespace, key, value, ttlMs) {
  const store = await ensureCacheLoaded()
  const namespaceEntries = store[namespace] || {}

  namespaceEntries[key] = {
    value,
    expiresAt: Date.now() + ttlMs,
  }

  store[namespace] = namespaceEntries
  await persistCache()
}
