import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'
import { promisify } from 'util'
import { BigQuery } from '@google-cloud/bigquery'

type Article = any

// Normalize URL for better matching: strip protocol, www, query params, anchors
function normalizeUrl(url: string): string {
  try {
    const urlObj = new URL(url)
    // Remove www, convert to lowercase
    let host = urlObj.hostname.replace(/^www\./, '').toLowerCase()
    // Remove query params and anchors, keep only path
    let path = urlObj.pathname.toLowerCase()
    // Remove trailing slash
    path = path.replace(/\/$/, '')
    return `${host}${path}`
  } catch (_) {
    return url.toLowerCase()
  }
}

// Extract article ID or slug from URL for matching syndicated content
// Example: /story/9158758/ or /article/abc-123/ or /articleshow/124960631.cms
function extractArticleId(url: string): string | null {
  try {
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
  // Lightweight promise wrappers for get/all
  const get = (sql: string, params: any[] = []) => new Promise<any>((resolve, reject) => {
    db.get(sql, params, (err: any, row: any) => err ? reject(err) : resolve(row))
  })
  const all = (sql: string, params: any[] = []) => new Promise<any[]>((resolve, reject) => {
    db.all(sql, params, (err: any, rows: any[]) => err ? reject(err) : resolve(rows))
  })
  return { db, get, all }
}

export async function enrichArticlesFromLocalGKG(articles: Article[], targetDate?: string): Promise<Article[]> {
  const dbPath = getDbPathForDate(targetDate)
  const conn = await openDb(dbPath)
  if (!conn) return articles

  const { get } = conn

  const enriched = await Promise.all(articles.map(async (a) => {
    try {
      // Try exact match by document_identifier (URL)
      let doc = await get(
        'SELECT document_identifier, source_common_name, v2_tone, tone_value, mention_count, v2_themes, v2_persons FROM gkg WHERE document_identifier = ? LIMIT 1',
        [a.url]
      )

      if (doc) {
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

      return a
    } catch (err) {
      return a
    }
  }))

  try { conn.db.close() } catch (_) {}
  
  // For articles not enriched, try advanced matching strategies
  const notEnriched = enriched.filter(a => !a._gkg_enriched)
  if (notEnriched.length > 0) {
    console.log(`[gkg-enrich] ${notEnriched.length} articles not found with exact URL match, trying advanced matching...`)

    // Re-open DB and try to enrich the remaining articles
    const conn2 = await openDb(dbPath)
    if (conn2) {
      const { get: get2 } = conn2
      const finalEnriched = await Promise.all(enriched.map(async (a) => {
        if (a._gkg_enriched) return a
        try {
          // Try exact URL match first
          let doc = await get2('SELECT document_identifier, source_common_name, v2_tone, tone_value, mention_count, v2_themes, v2_persons FROM gkg WHERE document_identifier = ? LIMIT 1', [a.url])
          
          // If no exact match, try matching by article ID (for syndicated content)
          if (!doc) {
            const articleId = extractArticleId(a.url)
            if (articleId) {
              doc = await get2('SELECT document_identifier, source_common_name, v2_tone, tone_value, mention_count, v2_themes, v2_persons FROM gkg WHERE document_identifier LIKE ? LIMIT 1', [`%/${articleId}%`])
            }
          }
          
          if (doc) {
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
        } catch (_) {}
        return a
      }))
      try { conn2.db.close() } catch (_) {}
    const allEnriched = [...alreadyEnriched, ...finalEnriched]
    const enrichCount = allEnriched.filter(a => a._gkg_enriched).length
    console.log(`[gkg-enrich] Final result: ${enrichCount}/${articles.length} articles enriched from local DB`)
    
    try { conn.db.close() } catch (_) {}
    return allEnriched
  }

  try { conn.db.close() } catch (_) {}
  return enriched
}

export async function batchQueryMissing(documentIdentifiers: string[], targetDate?: string) {
  if (!documentIdentifiers || documentIdentifiers.length === 0) return []

  // Limit to reasonable batch size
  const MAX_BATCH = 500
  const batch = documentIdentifiers.slice(0, MAX_BATCH)

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  if (!projectId) {
    console.warn('[gkg-enrich] GOOGLE_CLOUD_PROJECT not set, skipping BigQuery batch')
    return []
  }

  const bq = new BigQuery({ projectId })

  console.log(`[gkg-enrich] Starting BigQuery job for ${batch.length} URLs...`)

  // Use partitioned table and parameterized query to avoid scanning full table
  // NOTE: Using 7-day window to match event enrichment date range
  const query = `
    SELECT
      DocumentIdentifier,
      SourceCommonName,
      V2Tone,
      V2Counts,
      V2Themes,
      V2Persons,
      PARSE_TIMESTAMP('%Y%m%d%H%M%S', CAST(DATE AS STRING)) AS date_ts
    FROM \`gdelt-bq.gdeltv2.gkg_partitioned\`
    WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      AND DocumentIdentifier IN UNNEST(@urls)
  `

  try {
    const options = {
      query,
      params: { urls: batch },
      location: 'US'
    }

    const [job] = await bq.createQueryJob(options)
    const [rows] = await job.getQueryResults()
    
    console.log(`[gkg-enrich] BigQuery returned ${rows?.length || 0} GKG records`)

    if (!rows || rows.length === 0) {
      console.log('[gkg-enrich] No GKG data found in BigQuery for these URLs')
      return []
    }

    // Upsert results into local DB for today's date
    const dbPath = getDbPathForDate(targetDate)
    if (!fs.existsSync(dbPath)) {
      console.warn('[gkg-enrich] Local DB not found, cannot cache results')
      return rows
    }

    const sqlite = sqlite3.verbose()
    const db = new sqlite.Database(dbPath)
    const run = (sql: string, params: any[] = []) => new Promise<any>((resolve, reject) => {
      db.run(sql, params, function(err: any) {
        if (err) return reject(err)
        // resolve with this (statement context)
        return resolve(this)
      })
    })

    for (const r of rows) {
      // Parse mention_count and tone_value similar to ingest script
      let tone_value: number | null = null
      try {
        const v2t = r.V2Tone || ''
        const parts = v2t.split(',')
        if (parts.length > 1) tone_value = parseFloat(parts[1])
      } catch (_) {
        tone_value = null
      }

      let mention_count: number | null = null
      try {
        const v2c = r.V2Counts || ''
        const m = (v2c.match(/\d+/g) || []).map(Number)
        if (m.length) mention_count = Math.max(...m)
      } catch (_) { mention_count = null }

      // Upsert: try update, if changed rows == 0 then insert
      const updateSql = `UPDATE gkg SET source_common_name=?, v2_tone=?, tone_value=?, mention_count=?, v2_themes=?, v2_persons=?, date_ts=? WHERE document_identifier=?`
          try {
            await run(updateSql, [r.SourceCommonName || null, r.V2Tone || null, tone_value, mention_count, r.V2Themes || null, r.V2Persons || null, r.date_ts || null, r.DocumentIdentifier])
          } catch (err:any) {
            const insertSql = `INSERT INTO gkg (gkg_record_id, date, date_ts, source_collection_id, source_common_name, document_identifier, counts, v2_counts, mention_count, themes, v2_themes, locations, v2_locations, persons, v2_persons, organizations, v2_organizations, v2_tone, tone_value, dates, gcam, sharing_image, related_images, social_image_embeds, social_video_embeds, quotations, all_names, amounts, translation_info, extras) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
            const vals = [null, null, r.date_ts || null, null, r.SourceCommonName || null, r.DocumentIdentifier, null, r.V2Counts || null, mention_count, null, r.V2Themes || null, null, null, null, r.V2Persons || null, null, null, r.V2Tone || null, tone_value, null, null, null, null, null, null, null, null, null, null]
            try { await run(insertSql, vals) } catch (_) {}
          }
    }

    try { db.close() } catch (_) {}
    
    console.log(`[gkg-enrich] Cached ${rows.length} GKG records to local DB`)

    return rows
  } catch (err: any) {
    console.warn('[gkg-enrich] BigQuery batch failed:', err?.message || err)
    return []
  }
}

// Return type for type safety
interface GKGRow {
  DocumentIdentifier: string
  SourceCommonName?: string
  V2Tone?: string
  V2Counts?: string
  V2Themes?: string
  V2Persons?: string
  date_ts?: number
}

export default enrichArticlesFromLocalGKG
