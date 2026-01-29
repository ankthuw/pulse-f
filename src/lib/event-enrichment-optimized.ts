/**
 * Optimized GDELT Events Enrichment with Targeted BigQuery Queries
 *
 * Strategy: Query BigQuery only for the specific URLs returned by the Doc API,
 * joining event mentions with events table to get Goldstein scale data.
 *
 * This is CRITICAL for accurate impact score calculation because:
 * - Goldstein scale (-10 to +10) measures conflict/cooperation intensity
 * - It's the primary factor in the full impact score formula
 * - Without it, articles only get provisional scores (less accurate)
 *
 * Cost Analysis:
 * - Per query: ~100-250 URLs × ~2KB per joined row = ~200-500 KB scanned
 * - 1000 requests/day = ~500 MB/day (well under 1TB limit)
 */

import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'
import { BigQuery } from '@google-cloud/bigquery'

type Article = any

// =============================================================================
// URL Normalization & Matching
// =============================================================================

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

function extractArticleId(url: string): string | null {
  try {
    const match = url.match(/\/(story|article|articleshow|news|articles)\/([a-zA-Z0-9_-]+)/)
    return match ? match[2] : null
  } catch (_) {
    return null
  }
}

// =============================================================================
// Database Operations
// =============================================================================

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
  const run = (sql: string, params: any[] = []) => new Promise<any>((resolve, reject) => {
    db.run(sql, params, function(err: any) {
      if (err) return reject(err)
      return resolve(this)
    })
  })
  return { db, get, all, run, close: () => new Promise<void>((resolve) => db.close(() => resolve())) }
}

/**
 * Initialize local cache database if it doesn't exist
 */
async function ensureCacheDb(targetDate?: string): Promise<sqlite3.Database | null> {
  const dbPath = getEventsDbPathForDate(targetDate)
  const dbDir = path.dirname(dbPath)

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const sqlite = sqlite3.verbose()
  const db = new sqlite.Database(dbPath)

  // Create optimized schema for event mentions
  await new Promise<void>((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS event_mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_identifier TEXT UNIQUE,
        global_event_id TEXT,
        goldstein_scale REAL,
        avg_tone REAL,
        num_articles INTEGER,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_events_doc_id ON event_mentions(document_identifier);
      CREATE INDEX IF NOT EXISTS idx_events_event_id ON event_mentions(global_event_id);
      CREATE INDEX IF NOT EXISTS idx_events_cached_at ON event_mentions(cached_at);
    `, (err) => err ? reject(err) : resolve())
  })

  return db
}

// =============================================================================
// BigQuery Targeted Query
// =============================================================================

interface EventEnrichmentResult {
  document_identifier: string
  global_event_id: string
  goldstein_scale: number
  avg_tone: number
  num_articles: number
}

/**
 * Query BigQuery for event data for specific URLs only
 * Joins event mentions with events table to get Goldstein scale
 *
 * @param urls - Array of URLs to fetch event data for
 * @param targetDate - Date for cache DB (creates/updates local cache)
 * @returns Map of URL -> Event enrichment data
 */
export async function batchQueryEventsForUrls(
  urls: string[],
  targetDate?: string
): Promise<Map<string, EventEnrichmentResult>> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  if (!projectId) {
    console.warn('[events-bq] GOOGLE_CLOUD_PROJECT not set, skipping BigQuery query')
    return new Map()
  }

  // Filter and deduplicate URLs
  const uniqueUrls = Array.from(new Set(urls.filter(u => u && u.length > 0)))
  if (uniqueUrls.length === 0) {
    return new Map()
  }

  // Limit batch size
  const MAX_BATCH = 500
  const batch = uniqueUrls.slice(0, MAX_BATCH)

  console.log(`[events-bq] Querying BigQuery for ${batch.length} URLs...`)

  const bq = new BigQuery({ projectId })

  // Test query to check if Events data exists
  try {
    const testQuery = `
      SELECT COUNT(*) as count
      FROM \`gdelt-bq.gdeltv2.eventmentions_partitioned\` em
      INNER JOIN \`gdelt-bq.gdeltv2.events\` e
        ON e.globaleventid = em.globaleventid
      WHERE em._PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      LIMIT 1
    `
    const [testJob] = await bq.createQueryJob({ query: testQuery, location: 'US' })
    const [testRows] = await testJob.getQueryResults()
    console.log(`[events-bq] Events available (7 days):`, testRows?.[0]?.count)
  } catch (testErr: any) {
    console.error(`[events-bq] Test query failed:`, testErr?.message)
  }

  // Optimized query: Join event mentions with events to get Goldstein scale
  // Simplified version - doesn't join with GKG to avoid missing data
  // Use QUALIFY to get only the most relevant event per URL
  const query = `
    SELECT
      em.MentionIdentifier AS document_identifier,
      e.globaleventid AS global_event_id,
      e.GoldsteinScale AS goldstein_scale,
      COALESCE(e.AvgTone, 0) AS avg_tone,
      COUNT(*) AS num_articles
    FROM \`gdelt-bq.gdeltv2.eventmentions_partitioned\` em
    INNER JOIN \`gdelt-bq.gdeltv2.events\` e
      ON e.globaleventid = em.globaleventid
    WHERE em._PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
      AND em.MentionIdentifier IN UNNEST(@urls)
    GROUP BY em.MentionIdentifier, e.globaleventid, e.GoldsteinScale, e.AvgTone
    QUALIFY ROW_NUMBER() OVER (
      PARTITION BY em.MentionIdentifier
      ORDER BY ABS(e.GoldsteinScale) DESC, num_articles DESC
    ) = 1
    LIMIT 1000
  `

  try {
    const options = {
      query,
      params: { urls: batch },
      location: 'US'
    }

    const [job] = await bq.createQueryJob(options)

    // Wait for job to complete and get more details
    await job.getQueryResults()

    // Log job status for debugging
    const status = job.metadata.status
    console.log(`[events-bq] Job status:`, status?.state)
    if (status?.errors && status.errors.length > 0) {
      console.error(`[events-bq] Job errors:`, status.errors)
    }

    const [rows] = await job.getQueryResults()

    console.log(`[events-bq] BigQuery returned ${rows?.length || 0} event records`)
    console.log(`[events-bq] Bytes processed: ${job.metadata?.statistics?.totalBytesProcessed || 'N/A'}`)

    if (!rows || rows.length === 0) {
      return new Map()
    }

    // Parse results and build map
    const resultMap = new Map<string, EventEnrichmentResult>()

    for (const row of rows) {
      const url = row.document_identifier

      resultMap.set(url, {
        document_identifier: url,
        global_event_id: row.global_event_id || '',
        goldstein_scale: row.goldstein_scale || 0,
        avg_tone: row.avg_tone || 0,
        num_articles: row.num_articles || 0,
      })
    }

    // Cache results to local DB
    await cacheEventResults(resultMap, targetDate)

    return resultMap

  } catch (err: any) {
    console.warn('[events-bq] BigQuery query failed:', err?.message || err)
    return new Map()
  }
}

/**
 * Cache BigQuery results to local SQLite database
 */
async function cacheEventResults(results: Map<string, EventEnrichmentResult>, targetDate?: string): Promise<void> {
  try {
    const db = await ensureCacheDb(targetDate)
    if (!db) return

    for (const [url, data] of results.entries()) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO event_mentions (document_identifier, global_event_id, goldstein_scale, avg_tone, num_articles) VALUES (?, ?, ?, ?, ?)`,
          [
            data.document_identifier,
            data.global_event_id || null,
            data.goldstein_scale || null,
            data.avg_tone || null,
            data.num_articles || null
          ],
          (err) => err ? reject(err) : resolve()
        )
      })
    }

    db.close()
    console.log(`[events-cache] Cached ${results.size} results to local DB`)

  } catch (err) {
    console.warn('[events-cache] Failed to cache results:', err)
  }
}

// =============================================================================
// Main Enrichment Function
// =============================================================================

/**
 * Enrich articles with Events data using optimized strategy:
 * 1. Check local cache first (fast, free)
 * 2. For missing URLs, batch query BigQuery (targeted, minimal cost)
 * 3. Cache BigQuery results locally for next time
 *
 * This provides Goldstein scale data which is CRITICAL for accurate impact scores
 */
export async function enrichArticlesWithEventsOptimized(
  articles: Article[],
  targetDate?: string
): Promise<Article[]> {
  if (!articles || articles.length === 0) {
    return articles
  }

  console.log(`[events-enrich] Starting enrichment for ${articles.length} articles...`)

  // Step 1: Check local cache for all articles
  const dbPath = getEventsDbPathForDate(targetDate)
  const conn = await openDb(dbPath)

  const missingUrls: string[] = []
  const urlToArticleMap = new Map<string, Article[]>()
  const enrichedResults = new Map<string, any>()

  // Group articles by URL
  for (const article of articles) {
    const url = article.url
    if (!url) continue

    if (!urlToArticleMap.has(url)) {
      urlToArticleMap.set(url, [])
    }
    urlToArticleMap.get(url)!.push(article)
  }

  // Check local cache for each URL
  if (conn) {
    console.log(`[events-enrich] Checking local cache...`)
    const { get, close } = conn

    for (const url of urlToArticleMap.keys()) {
      try {
        const cached = await get(
          'SELECT document_identifier, global_event_id, goldstein_scale, avg_tone, num_articles FROM event_mentions WHERE document_identifier = ? LIMIT 1',
          [url]
        )

        if (cached) {
          enrichedResults.set(url, {
            globaleventid: cached.global_event_id,
            goldsteinscale: cached.goldstein_scale,
            avg_tone: cached.avg_tone,
            num_articles: cached.num_articles,
          })
        } else {
          missingUrls.push(url)
        }
      } catch (err) {
        missingUrls.push(url)
      }
    }

    await close()
  } else {
    console.log(`[events-enrich] No local cache found, will query BigQuery for all URLs`)
    missingUrls.push(...urlToArticleMap.keys())
  }

  console.log(`[events-enrich] Local cache hit: ${enrichedResults.size}/${urlToArticleMap.size}`)
  console.log(`[events-enrich] Missing: ${missingUrls.length} URLs`)

  // Step 2: Batch query BigQuery for missing URLs
  if (missingUrls.length > 0) {
    const bqResults = await batchQueryEventsForUrls(missingUrls, targetDate)

    // Merge BigQuery results (transform format)
    for (const [url, data] of bqResults.entries()) {
      enrichedResults.set(url, {
        globaleventid: data.global_event_id,
        goldsteinscale: data.goldstein_scale,
        avg_tone: data.avg_tone,
        num_articles: data.num_articles,
      })
    }
  }

  // Step 3: Apply enrichment to all articles
  const finalResults = articles.map(article => {
    const enrichment = enrichedResults.get(article.url)

    if (!enrichment) {
      return article // No enrichment data available
    }

    return {
      ...article,
      _event_enriched: true,
      events: enrichment
    }
  })

  const enrichCount = finalResults.filter(a => a._event_enriched).length
  console.log(`[events-enrich] Final result: ${enrichCount}/${articles.length} articles enriched`)

  return finalResults
}

/**
 * Calculate time decay factor based on article age
 * Fresh articles (<24h) get full weight, older articles get reduced weight
 */
function getTimeDecayFactor(publishedAt: string): number {
  try {
    const published = new Date(publishedAt)
    const now = new Date()
    const hoursOld = (now.getTime() - published.getTime()) / (1000 * 60 * 60)

    // Step-wise decay curve
    if (hoursOld < 24) return 1.0      // Fresh: no decay
    if (hoursOld < 72) return 0.9      // 1-3 days: slight decay
    if (hoursOld < 168) return 0.7     // 3-7 days: moderate decay
    return 0.5                         // 7+ days: significant decay
  } catch {
    return 1.0 // If date parsing fails, assume fresh
  }
}

/**
 * Normalize mention count to 0-100 scale using logarithmic compression
 * Adjusted to give better scores across the range (1 to millions)
 */
function normalizeMentions(mentionCount: number): number {
  if (!mentionCount || mentionCount < 1) return 0

  // Logarithmic scaling with better distribution:
  // 1 article → 20 points (minimum)
  // 10 articles → 40 points
  // 100 articles → 60 points
  // 1,000 articles → 75 points
  // 10,000+ articles → 90+ points
  const logMentions = Math.log10(mentionCount)

  // Base score + logarithmic scaling
  const score = Math.min(
    20 + (logMentions * 20),
    95
  )

  return Math.min(Math.max(score, 0), 100)
}

/**
 * Calculate impact score (1-100) based on enrichment data
 *
 * SCORING TIERS (in order of priority):
 *
 * 1. FULL SCORE (Events + GKG available):
 *    - Goldstein Scale: 35% weight (measures geopolitical significance)
 *    - Num Articles: 30% weight (measures global media attention)
 *    - Tone Extremity: 25% weight (measures emotional intensity)
 *    - Time Freshness: 10% weight (newer articles get boost)
 *
 * 2. EVENTS-ONLY SCORE (Events data, no GKG):
 *    - Goldstein Scale: 40% weight
 *    - Num Articles: 40% weight
 *    - Tone from Events: 20% weight
 *    - Time Freshness: 10% weight
 *
 * 3. GKG-ONLY SCORE (GKG data, no Events):
 *    - Mention Count: 50% weight
 *    - Tone Extremity: 40% weight
 *    - Time Freshness: 10% weight
 *
 * 4. BASELINE SCORE (no enrichment):
 *    - Time-based variation (10-40 points)
 *    - Prevents all articles from having the same score
 *
 * @param article - Article with optional gkg/events enrichment
 * @returns { score: 1-100, provisional: boolean }
 */
export function calculateProvisionalScore(article: Article): { score: number, provisional: boolean } {
  const gkg = article.gkg
  const events = article.events

  // Time decay: Newer articles get boost (0.5-1.0 factor)
  const timeDecay = getTimeDecayFactor(
    article.publishedAt || new Date().toISOString()
  )

  // ============================================================================
  // TIER 1: Full score - Has both Events and GKG data (most accurate)
  // ============================================================================
  if (events && gkg) {
    // Goldstein scale (-10 to +10): Measures conflict/cooperation intensity
    const goldstein = Math.abs(events.goldsteinscale || 0)
    const goldsteinScore = goldstein > 0
      ? Math.min((goldstein / 10) * 100, 100)
      : 20  // Base score for neutral goldstein (increased from 10)

    // Num Articles: Measures global media attention (log-compressed)
    const numArticles = events.num_articles || 1
    const articleScore = normalizeMentions(numArticles)

    // Tone: Prefer events.avg_tone, fallback to gkg.tone_value
    const tone = Math.abs(events.avg_tone || gkg.tone_value || 0)
    const toneScore = Math.min((tone / 10) * 100, 100)

    // Weighted sum - rebalance weights for neutral goldstein
    const rawScore =
      (goldsteinScore * 0.30) +
      (articleScore * 0.40) +  // Higher weight for article count
      (toneScore * 0.20) +
      (timeDecay * 10)

    return {
      score: Math.min(Math.max(Math.round(rawScore), 1), 100),
      provisional: false
    }
  }

  // ============================================================================
  // TIER 2: Events-only score - Has Events but no GKG
  // ============================================================================
  if (events) {
    // Goldstein scale (-10 to +10): Measures conflict/cooperation intensity
    // Note: A value of 0 means "neutral/conflict undefined" - give it a small base score
    const goldstein = Math.abs(events.goldsteinscale || 0)
    const goldsteinScore = goldstein > 0
      ? Math.min((goldstein / 10) * 100, 100)
      : 20  // Base score for neutral goldstein (increased from 10)

    // Num Articles: Measures global media attention
    const numArticles = events.num_articles || 1
    const articleScore = normalizeMentions(numArticles)

    // Tone from Events: Higher tone = more positive
    const tone = Math.abs(events.avg_tone || 0)
    const toneScore = Math.min((tone / 10) * 100, 100)

    // Weighted sum - give more weight to num_articles when goldstein is neutral
    const rawScore =
      (goldsteinScore * 0.25) +
      (articleScore * 0.55) +  // Higher weight for article count
      (toneScore * 0.20) +
      (timeDecay * 10)

    return {
      score: Math.min(Math.max(Math.round(rawScore), 1), 100),
      provisional: true
    }
  }

  // ============================================================================
  // TIER 3: GKG-only score - Has GKG but no Events
  // ============================================================================
  if (gkg) {
    // Mention Count: Measures global media attention
    const mentions = gkg.mention_count || 1
    const mentionScore = normalizeMentions(mentions)

    // Tone Extremity: Measures emotional intensity
    const tone = Math.abs(gkg.tone_value || 0)
    const toneScore = Math.min((tone / 10) * 100, 100)

    // Weighted sum with higher baseline
    const rawScore =
      30 + // Base score (increased from 20)
      (mentionScore * 0.50) +
      (toneScore * 0.40) +
      (timeDecay * 5)

    return {
      score: Math.min(Math.max(Math.round(rawScore), 1), 100),
      provisional: true
    }
  }

  // ============================================================================
  // TIER 4: Baseline score - No enrichment data available
  // ============================================================================
  // Use time-based variation so not all articles have score of 30
  const baseScore = Math.round(20 + (timeDecay * 30))  // 20-50 range based on freshness

  return {
    score: baseScore,
    provisional: true
  }
}

export default enrichArticlesWithEventsOptimized
