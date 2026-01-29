/**
 * Optimized GDELT GKG Enrichment with Targeted BigQuery Queries
 *
 * Strategy: Instead of ingesting entire days of data, query BigQuery only
 * for the specific URLs returned by the Doc API. This minimizes data scanned
 * while maximizing coverage.
 *
 * Cost Analysis:
 * - Per query: ~100-250 URLs × ~1KB per row = ~100-250 KB scanned
 * - 1000 requests/day = ~250 MB/day (well under 1TB limit)
 * - vs full ingest: ~100-500 MB/day just for one day of data
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
  const dbPath = getDbPathForDate(targetDate)
  const dbDir = path.dirname(dbPath)

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const sqlite = sqlite3.verbose()
  const db = new sqlite3.Database(dbPath)

  // Create table with optimized schema for URL lookups
  await new Promise<void>((resolve, reject) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS gkg (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_identifier TEXT UNIQUE,
        source_common_name TEXT,
        v2_tone TEXT,
        tone_value REAL,
        mention_count INTEGER,
        v2_themes TEXT,
        v2_persons TEXT,
        date_ts TEXT,
        cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_gkg_doc_id ON gkg(document_identifier);
      CREATE INDEX IF NOT EXISTS idx_gkg_cached_at ON gkg(cached_at);
    `, (err) => err ? reject(err) : resolve())
  })

  return db
}

// =============================================================================
// BigQuery Targeted Query
// =============================================================================

interface GKGEnrichmentResult {
  document_identifier: string
  source_common_name?: string
  v2_tone?: string
  tone_value?: number
  mention_count?: number
  v2_themes?: string
  v2_persons?: string
  date_ts?: string
}

/**
 * Query BigQuery for specific URLs only (optimized for minimal data scanned)
 *
 * @param urls - Array of URLs to fetch GKG data for
 * @param targetDate - Date for cache DB (creates/updates local cache)
 * @returns Map of URL -> GKG enrichment data
 */
export async function batchQueryGKGForUrls(
  urls: string[],
  targetDate?: string
): Promise<Map<string, GKGEnrichmentResult>> {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  if (!projectId) {
    console.warn('[gkg-bq] GOOGLE_CLOUD_PROJECT not set, skipping BigQuery query')
    return new Map()
  }

  // Filter out empty URLs and deduplicate
  const uniqueUrls = Array.from(new Set(urls.filter(u => u && u.length > 0)))
  if (uniqueUrls.length === 0) {
    return new Map()
  }

  // Limit batch size to avoid hitting BigQuery limits
  const MAX_BATCH = 500
  const batch = uniqueUrls.slice(0, MAX_BATCH)

  console.log(`[gkg-bq] Querying BigQuery for ${batch.length} URLs...`)

  const bq = new BigQuery({ projectId })

  // Test query to verify table access and see sample URLs
  try {
    const testQuery = `
      SELECT DocumentIdentifier, SourceCommonName
      FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`
      WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 1 DAY)
      LIMIT 3
    `
    const [testJob] = await bq.createQueryJob({ query: testQuery, location: 'US' })
    const [testRows] = await testJob.getQueryResults()
    console.log(`[gkg-bq] Sample BigQuery URLs:`, testRows?.map((r: any) => r.DocumentIdentifier?.slice(0, 80)))
  } catch (testErr: any) {
    console.error(`[gkg-bq] Test query failed:`, testErr?.message)
  }

  // Optimized query: Use date filter + URL array filter for minimal scanning
  // Only select columns needed for impact score calculation
  const query = `
    SELECT
      DocumentIdentifier,
      SourceCommonName,
      V2Tone,
      V2Counts,
      V2Themes,
      V2Persons,
      DATE
    FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`
    WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 90 DAY)
      AND DocumentIdentifier IN UNNEST(@urls)
    LIMIT 500
  `

  try {
    const options = {
      query,
      params: { urls: batch },
      location: 'US'
    }

    const [job] = await bq.createQueryJob(options)

    // Wait for job and check for errors
    await job.getQueryResults()

    const status = job.metadata.status
    if (status?.errors && status.errors.length > 0) {
      console.error(`[gkg-bq] Query errors:`, status.errors)
    }

    const [rows] = await job.getQueryResults()

    console.log(`[gkg-bq] BigQuery returned ${rows?.length || 0} GKG records`)
    console.log(`[gkg-bq] Bytes processed: ${job.metadata?.statistics?.totalBytesProcessed || 'N/A'}`)

    if (!rows || rows.length === 0) {
      return new Map()
    }

    // Parse results and build map
    const resultMap = new Map<string, GKGEnrichmentResult>()

    for (const row of rows) {
      const url = row.DocumentIdentifier

      // Parse tone_value from V2Tone
      // Format: "avg_tone,avg_tone_std,avg_tone_top1,..." where avg_tone is the first value
      let tone_value: number | null = null
      try {
        const v2t = row.V2Tone || ''
        if (v2t) {
          const parts = v2t.split(',')
          // First value is the average tone (-10 to +10 scale)
          const firstVal = parseFloat(parts[0])
          if (!isNaN(firstVal)) {
            tone_value = firstVal
          }
        }
      } catch (_) {
        tone_value = null
      }

      // Parse mention_count from V2Counts
      // V2Counts format: "count1,type1,count2,type2,..." or "count1,count2,..."
      let mention_count: number | null = null
      try {
        const v2c = row.V2Counts || ''
        if (v2c) {
          // Split by comma and take the first numeric value as mention count
          const parts = v2c.split(',')
          for (const part of parts) {
            const num = parseInt(part.trim(), 10)
            if (!isNaN(num) && num > 0) {
              mention_count = num
              break  // Take the first valid count
            }
          }
        }
      } catch (_) {
        mention_count = null
      }

      resultMap.set(url, {
        document_identifier: url,
        source_common_name: row.SourceCommonName || null,
        v2_tone: row.V2Tone || null,
        tone_value: tone_value || undefined,
        mention_count: mention_count || undefined,
        v2_themes: row.V2Themes || null,
        v2_persons: row.V2Persons || null,
        date_ts: row.DATE ? String(row.DATE) : undefined
      })
    }

    // Cache results to local DB for future requests
    await cacheGKGResults(resultMap, targetDate)

    return resultMap

  } catch (err: any) {
    console.warn('[gkg-bq] BigQuery query failed:', err?.message || err)
    return new Map()
  }
}

/**
 * Cache BigQuery results to local SQLite database
 */
async function cacheGKGResults(results: Map<string, GKGEnrichmentResult>, targetDate?: string): Promise<void> {
  try {
    const db = await ensureCacheDb(targetDate)
    if (!db) return

    for (const [url, data] of results.entries()) {
      await new Promise<void>((resolve, reject) => {
        db.run(
          `INSERT OR REPLACE INTO gkg (document_identifier, source_common_name, v2_tone, tone_value, mention_count, v2_themes, v2_persons, date_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            data.document_identifier,
            data.source_common_name || null,
            data.v2_tone || null,
            data.tone_value || null,
            data.mention_count || null,
            data.v2_themes || null,
            data.v2_persons || null,
            data.date_ts || null
          ],
          (err) => err ? reject(err) : resolve()
        )
      })
    }

    db.close()
    console.log(`[gkg-cache] Cached ${results.size} results to local DB`)

  } catch (err) {
    console.warn('[gkg-cache] Failed to cache results:', err)
  }
}

// =============================================================================
// Main Enrichment Function
// =============================================================================

/**
 * Enrich articles with GKG data using optimized strategy:
 * 1. Check local cache first (fast, free)
 * 2. For missing URLs, batch query BigQuery (targeted, minimal cost)
 * 3. Cache BigQuery results locally for next time
 */
export async function enrichArticlesWithGKGOptimized(
  articles: Article[],
  targetDate?: string
): Promise<Article[]> {
  if (!articles || articles.length === 0) {
    return articles
  }

  console.log(`[gkg-enrich] Starting enrichment for ${articles.length} articles...`)

  // Step 1: Check local cache for all articles
  const dbPath = getDbPathForDate(targetDate)
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
    console.log(`[gkg-enrich] Checking local cache...`)
    const { get, close } = conn

    for (const url of urlToArticleMap.keys()) {
      try {
        const cached = await get(
          'SELECT document_identifier, source_common_name, v2_tone, tone_value, mention_count, v2_themes, v2_persons FROM gkg WHERE document_identifier = ? LIMIT 1',
          [url]
        )

        if (cached) {
          enrichedResults.set(url, {
            document_identifier: cached.document_identifier,
            source_common_name: cached.source_common_name,
            v2_tone: cached.v2_tone,
            tone_value: cached.tone_value,
            mention_count: cached.mention_count,
            v2_themes: cached.v2_themes,
            v2_persons: cached.v2_persons,
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
    console.log(`[gkg-enrich] No local cache found, will query BigQuery for all URLs`)
    missingUrls.push(...urlToArticleMap.keys())
  }

  console.log(`[gkg-enrich] Local cache hit: ${enrichedResults.size}/${urlToArticleMap.size}`)
  console.log(`[gkg-enrich] Missing: ${missingUrls.length} URLs`)

  // Step 2: Batch query BigQuery for missing URLs
  if (missingUrls.length > 0) {
    const bqResults = await batchQueryGKGForUrls(missingUrls, targetDate)

    // Merge BigQuery results
    for (const [url, data] of bqResults.entries()) {
      enrichedResults.set(url, data)
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
      _gkg_enriched: true,
      gkg: enrichment
    }
  })

  const enrichCount = finalResults.filter(a => a._gkg_enriched).length
  console.log(`[gkg-enrich] Final result: ${enrichCount}/${articles.length} articles enriched`)

  return finalResults
}

export default enrichArticlesWithGKGOptimized
