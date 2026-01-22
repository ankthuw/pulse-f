import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'

type Article = any

// Normalize URL for better matching: strip protocol, www, query params, anchors
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    let host = urlObj.hostname.replace(/^www\./, '').toLowerCase()
    let pathname = urlObj.pathname.toLowerCase()
    pathname = pathname.replace(/\/$/, '')
    return `${host}${pathname}`
  } catch (_) {
    return url.toLowerCase()
  }
}

// Extract article ID or slug from URL for matching syndicated content
function extractArticleId(url: string): string | null {
  try {
    // Match patterns like: /story/9158758/ or /articleshow/124960631.cms
    const match = url.match(/\/(story|article|articleshow|news|articles)\/([a-zA-Z0-9_-]+)/)
    return match ? match[2] : null
  } catch (_) {
    return null
  }
}

function getDbPathForDate(targetDate?: string) {
  const date = targetDate || new Date().toISOString().slice(0, 10)
  const dateClean = date.replace(/-/g, '')
  return path.join(process.cwd(), 'db', `gkg_${dateClean}.db`)
}

async function openDb(dbPath: string) {
  if (!fs.existsSync(dbPath)) return null
  const sqlite = sqlite3.verbose()
  const db = new sqlite.Database(dbPath, sqlite3.OPEN_READONLY)
  const get = (sql: string, params: any[] = []) => new Promise<any>((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => err ? reject(err) : resolve(row))
  })
  const all = (sql: string, params: any[] = []) => new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any[]) => err ? reject(err) : resolve(rows))
  })
  return { db, get, all }
}

/**
 * Enrich articles from local GKG database (no BigQuery fallback)
 * Simple approach: try multiple matching strategies, accept best-effort results
 */
export async function enrichArticlesFromLocalGKG(articles: Article[], targetDate?: string): Promise<Article[]> {
  const dbPath = getDbPathForDate(targetDate)
  const conn = await openDb(dbPath)
  
  if (!conn) {
    console.log(`[gkg-enrich] No local DB found at ${dbPath}`)
    return articles
  }

  const { db, get, all } = conn

  // Get total DB size for logging
  const totalCount = await get('SELECT COUNT(*) as count FROM gkg')
  console.log(`[gkg-enrich] Local DB has ${totalCount?.count || 0} GKG records`)

  // Cache all DB records for normalized matching (only if reasonable size)
  let allRecords: any[] = []
  if (totalCount?.count < 5000) {
    allRecords = await all('SELECT document_identifier, source_common_name, v2_tone, tone_value, mention_count, v2_themes, v2_persons FROM gkg')
  }

  let exactMatches = 0
  let articleIdMatches = 0
  let normalizedMatches = 0

  const enriched = await Promise.all(articles.map(async (a) => {
    try {
      let doc = null

      // Strategy 1: Exact URL match
      doc = await get(
        'SELECT document_identifier, source_common_name, v2_tone, tone_value, mention_count, v2_themes, v2_persons FROM gkg WHERE document_identifier = ? LIMIT 1',
        [a.url]
      )
      if (doc) {
        exactMatches++
        return {
          ...a,
          _gkg_enriched: true,
          gkg: {
            document_identifier: doc.document_identifier,
            source_common_name: doc.source_common_name,
            v2_tone: doc.v2_tone,
            tone_value: doc.tone_value,
            mention_count: doc.mention_count,
            v2_themes: doc.v2_themes,
            v2_persons: doc.v2_persons,
          }
        }
      }

      // Strategy 2: Article ID match (for syndicated content)
      const articleId = extractArticleId(a.url)
      if (articleId && articleId.length > 3) {
        doc = await get(
          'SELECT document_identifier, source_common_name, v2_tone, tone_value, mention_count, v2_themes, v2_persons FROM gkg WHERE document_identifier LIKE ? LIMIT 1',
          [`%/${articleId}%`]
        )
        if (doc) {
          articleIdMatches++
          return {
            ...a,
            _gkg_enriched: true,
            gkg: {
              document_identifier: doc.document_identifier,
              source_common_name: doc.source_common_name,
              v2_tone: doc.v2_tone,
              tone_value: doc.tone_value,
              mention_count: doc.mention_count,
              v2_themes: doc.v2_themes,
              v2_persons: doc.v2_persons,
            }
          }
        }
      }

      // Strategy 3: Normalized URL match (strip www, query params, etc)
      if (allRecords.length > 0) {
        const normalized = normalizeUrl(a.url)
        for (const candidate of allRecords) {
          if (normalizeUrl(candidate.document_identifier) === normalized) {
            normalizedMatches++
            return {
              ...a,
              _gkg_enriched: true,
              gkg: {
                document_identifier: candidate.document_identifier,
                source_common_name: candidate.source_common_name,
                v2_tone: candidate.v2_tone,
                tone_value: candidate.tone_value,
                mention_count: candidate.mention_count,
                v2_themes: candidate.v2_themes,
                v2_persons: candidate.v2_persons,
              }
            }
          }
        }
      }

      return a
    } catch (err) {
      return a
    }
  }))

  try { db.close() } catch (_) {}

  const enrichCount = enriched.filter(a => a._gkg_enriched).length
  console.log(`[gkg-enrich] Enriched ${enrichCount}/${articles.length} articles`)
  console.log(`[gkg-enrich] Match breakdown: ${exactMatches} exact, ${articleIdMatches} by article ID, ${normalizedMatches} normalized`)

  return enriched
}

export default enrichArticlesFromLocalGKG
