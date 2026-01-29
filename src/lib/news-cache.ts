/**
 * Frontend News Cache Service using IndexedDB
 *
 * Caches API responses to avoid redundant API calls when:
 * - Switching categories
 * - Changing sort options
 * - Reloading the page
 *
 * Cache Strategy:
 * - Key: `${category}_${lang}_${sort}`
 * - Store full API response with timestamp
 * - TTL: 5 minutes for fresh data
 * - Stale-while-revalidate: serve stale data, refresh in background
 */

interface CacheEntry {
  key: string
  articles: any[]
  timestamp: number
  cached: boolean  // true = from cache, false = from API
}

const DB_NAME = 'PulseNewsCache'
const STORE_NAME = 'articles'
const CACHE_TTL = 5 * 60 * 1000  // 5 minutes

class NewsCacheService {
  private db: IDBDatabase | null = null

  /**
   * Initialize IndexedDB database
   */
  async init(): Promise<void> {
    if (this.db) return

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve()
      }

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result

        // Create object store for articles
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' })
          store.createIndex('timestamp', 'timestamp', { unique: false })
        }
      }
    })
  }

  /**
   * Generate cache key from parameters
   */
  private generateKey(category: string, lang: string, sort: string): string {
    return `${category}_${lang}_${sort}`
  }

  /**
   * Check if cache entry is still valid
   */
  private isValid(entry: CacheEntry): boolean {
    const now = Date.now()
    const age = now - entry.timestamp
    return age < CACHE_TTL
  }

  /**
   * Get articles from cache
   * Returns null if not found or expired
   */
  async get(category: string, lang: string, sort: string): Promise<any[] | null> {
    await this.init()

    if (!this.db) return null

    const key = this.generateKey(category, lang, sort)

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(key)

      request.onsuccess = () => {
        const entry = request.result as CacheEntry

        if (!entry) {
          resolve(null)
          return
        }

        // Check if cache is still valid
        if (this.isValid(entry)) {
          console.log(`[cache] HIT: ${key}`)
          resolve(entry.articles)
        } else {
          console.log(`[cache] EXPIRED: ${key}`)
          resolve(null)
        }
      }

      request.onerror = () => resolve(null)
    })
  }

  /**
   * Store articles in cache
   */
  async set(category: string, lang: string, sort: string, articles: any[], fromCache = false): Promise<void> {
    await this.init()

    if (!this.db) return

    const key = this.generateKey(category, lang, sort)

    const entry: CacheEntry = {
      key,
      articles,
      timestamp: Date.now(),
      cached: fromCache
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(entry)

      request.onsuccess = () => {
        console.log(`[cache] STORED: ${key} (${articles.length} articles)`)
        resolve()
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Clear all cache entries (optional - for manual cache invalidation)
   */
  async clear(): Promise<void> {
    await this.init()

    if (!this.db) return

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.clear()

      request.onsuccess = () => {
        console.log('[cache] CLEARED all entries')
        resolve()
      }

      request.onerror = () => reject(request.error)
    })
  }

  /**
   * Get all cached entries (for debugging)
   */
  async getAllEntries(): Promise<CacheEntry[]> {
    await this.init()

    if (!this.db) return []

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.getAll()

      request.onsuccess = () => resolve(request.result)
      request.onerror = () => resolve([])
    })
  }
}

// Singleton instance
export const newsCache = new NewsCacheService()
