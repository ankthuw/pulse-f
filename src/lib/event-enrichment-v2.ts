import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'

type Article = any

// Normalize URL for better matching
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

// Extract article ID from URL
function extractArticleId(url: string): string | null {
  try {
    const match = url.match(/\/(story|article|articleshow|news|articles)\/([a-zA-Z0-9_-]+)/)
    return match ? match[2] : null
  } catch (_) {
    return null
  }
}

function getEventsDbPathForDate(targetDate?: string) {
  const date = targetDate || new Date().toISOString().slice(0, 10)
  const dateClean = date.replace(/-/g, '')
  return path.join(process.cwd(), 'db', `events_${dateClean}.db`)
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
 * Enrich articles with event-level metadata from local DB only (no BigQuery fallback)
 * Returns: globaleventid, goldsteinscale, avg_tone
 */
export async function enrichArticlesWithEvents(articles: Article[], targetDate?: string): Promise<Article[]> {
  const dbPath = getEventsDbPathForDate(targetDate)
  const conn = await openDb(dbPath)
  
  if (!conn) {
    console.log(`[event-enrich] No local DB found at ${dbPath}`)
    return articles
  }

  const { db, get, all } = conn

  // Get total DB size
  const totalCount = await get('SELECT COUNT(*) as count FROM event_mentions')
  console.log(`[event-enrich] Local DB has ${totalCount?.count || 0} event mention records`)

  // Cache all records if reasonable size
  let allRecords: any[] = []
  if (totalCount?.count < 10000) {
    allRecords = await all('SELECT document_identifier, global_event_id, goldstein_scale, avg_tone FROM event_mentions')
  }

  let exactMatches = 0
  let articleIdMatches = 0
  let normalizedMatches = 0

  const enriched = await Promise.all(articles.map(async (a) => {
    try {
      let mapping = null

      // Strategy 1: Exact URL match
      mapping = await get(
        'SELECT global_event_id, goldstein_scale, avg_tone FROM event_mentions WHERE document_identifier = ? LIMIT 1',
        [a.url]
      )
      if (mapping) {
        exactMatches++
        return {
          ...a,
          _event_enriched: true,
          events: {
            globaleventid: mapping.global_event_id,
            goldsteinscale: mapping.goldstein_scale,
            avg_tone: mapping.avg_tone,
          }
        }
      }

      // Strategy 2: Article ID match
      const articleId = extractArticleId(a.url)
      if (articleId && articleId.length > 3) {
        mapping = await get(
          'SELECT global_event_id, goldstein_scale, avg_tone FROM event_mentions WHERE document_identifier LIKE ? LIMIT 1',
          [`%/${articleId}%`]
        )
        if (mapping) {
          articleIdMatches++
          return {
            ...a,
            _event_enriched: true,
            events: {
              globaleventid: mapping.global_event_id,
              goldsteinscale: mapping.goldstein_scale,
              avg_tone: mapping.avg_tone,
            }
          }
        }
      }

      // Strategy 3: Normalized URL match
      if (allRecords.length > 0) {
        const normalized = normalizeUrl(a.url)
        for (const candidate of allRecords) {
          if (normalizeUrl(candidate.document_identifier) === normalized) {
            normalizedMatches++
            return {
              ...a,
              _event_enriched: true,
              events: {
                globaleventid: candidate.global_event_id,
                goldsteinscale: candidate.goldstein_scale,
                avg_tone: candidate.avg_tone,
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

  const enrichCount = enriched.filter(a => a._event_enriched).length
  console.log(`[event-enrich] Enriched ${enrichCount}/${articles.length} articles`)
  console.log(`[event-enrich] Match breakdown: ${exactMatches} exact, ${articleIdMatches} by article ID, ${normalizedMatches} normalized`)

  return enriched
}

/**
 * Calculate impact score with full/provisional modes
 */
export function calculateProvisionalScore(article: Article): { score: number, provisional: boolean } {
  const gkg = article.gkg
  const events = article.events
  
  // Full score: has both GKG and event data
  if (gkg && events) {
    const goldstein = events.goldsteinscale || 0
    const tone = gkg.tone_value || 0
    const mentions = gkg.mention_count || 1
    
    // Impact = |Goldstein scale| * tone weight * log(mentions)
    const goldsteinImpact = Math.abs(goldstein) * 10  // -10 to +10 → 0 to 100
    const toneBonus = Math.abs(tone) * 2  // More extreme tone = higher impact
    const mentionBonus = Math.log10(Math.max(mentions, 1)) * 5  // Logarithmic scale
    
    const score = Math.round(goldsteinImpact + toneBonus + mentionBonus)
    return { score: Math.min(Math.max(score, 1), 100), provisional: false }
  }
  
  // Provisional score: has GKG but no event data
  if (gkg) {
    const tone = gkg.tone_value || 0
    const mentions = gkg.mention_count || 1
    const base = 30
    const toneBonus = Math.abs(tone) * 2
    const mentionBonus = Math.log10(Math.max(mentions, 1)) * 3
    const score = Math.round(base + toneBonus + mentionBonus)
    return { score: Math.min(Math.max(score, 1), 100), provisional: true }
  }
  
  // Fallback: use old importance field if available
  if (article.importance) {
    return { score: article.importance, provisional: true }
  }
  
  return { score: 30, provisional: true }  // Default score
}

export default enrichArticlesWithEvents
