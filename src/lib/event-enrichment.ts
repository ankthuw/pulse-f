import fs from 'fs'
import path from 'path'
import sqlite3 from 'sqlite3'
import { BigQuery } from '@google-cloud/bigquery'

type Article = any

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
 * Enrich articles with event-level metadata (globaleventid, goldsteinscale, avg_tone).
 * Prefers local DB lookup from event_mentions table, falls back to BigQuery batch for misses.
 */
export async function enrichArticlesWithEvents(articles: Article[], targetDate?: string): Promise<Article[]> {
  const dbPath = getEventsDbPathForDate(targetDate)
  const conn = await openDb(dbPath)
  
  // If no DB, all articles are "missing" event data
  if (!conn) {
    console.log('[event-enrich] No local events DB found, will attempt BigQuery batch')
    const urls = articles.map(a => a.url).filter(Boolean)
    if (urls.length > 0) {
      await batchQueryEventsForUrls(urls, targetDate)
      // Re-attempt enrichment after caching
      return enrichArticlesWithEvents(articles, targetDate)
    }
    return articles
  }

  const { get } = conn

  const enriched = await Promise.all(articles.map(async (a) => {
    try {
      // Try exact match by document_identifier
      const mapping = await get(
        'SELECT global_event_id, goldstein_scale, avg_tone FROM event_mentions WHERE document_identifier = ? LIMIT 1',
        [a.url]
      )

      if (mapping) {
        return {
          ...a,
          _event_enriched: true,
          event: {
            globaleventid: mapping.global_event_id,
            goldsteinscale: mapping.goldstein_scale,
            avg_tone: mapping.avg_tone,
          }
        }
      }

      return a
    } catch (err) {
      return a
    }
  }))

  try { conn.db.close() } catch (_) {}

  // Fetch missing articles via BigQuery batch
  const notEnriched = enriched.filter(a => !a._event_enriched).map(a => a.url).filter(Boolean)
  if (notEnriched.length > 0) {
    console.log(`[event-enrich] ${notEnriched.length} articles missing event data, fetching from BigQuery...`)
    await batchQueryEventsForUrls(notEnriched, targetDate)

    // Re-open DB and try to enrich remaining articles
    const conn2 = await openDb(dbPath)
    if (conn2) {
      const { get: get2 } = conn2
      const finalEnriched = await Promise.all(enriched.map(async (a) => {
        if (a._event_enriched) return a
        try {
          const mapping = await get2('SELECT global_event_id, goldstein_scale, avg_tone FROM event_mentions WHERE document_identifier = ? LIMIT 1', [a.url])
          if (mapping) {
            return {
              ...a,
              _event_enriched: true,
              event: {
                globaleventid: mapping.global_event_id,
                goldsteinscale: mapping.goldstein_scale,
                avg_tone: mapping.avg_tone,
              }
            }
          }
        } catch (_) {}
        return a
      }))
      try { conn2.db.close() } catch (_) {}
      return finalEnriched
    }
  }

  return enriched
}

/**
 * Query BigQuery eventmentions_partitioned -> join events for missing DocumentIdentifier URLs.
 * Cache results into local events_YYYYMMDD.db (event_mentions and events tables).
 */
export async function batchQueryEventsForUrls(documentIdentifiers: string[], targetDate?: string) {
  if (!documentIdentifiers || documentIdentifiers.length === 0) return []

  const MAX_BATCH = 500
  const batch = documentIdentifiers.slice(0, MAX_BATCH)

  const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  if (!projectId) {
    console.warn('[event-enrich] GOOGLE_CLOUD_PROJECT not set, skipping BigQuery batch')
    return []
  }

  const bq = new BigQuery({ projectId })

  // Query eventmentions_partitioned using MentionIdentifier (URL), join to events for Goldstein/tone
  const query = `
    SELECT
      em.MentionIdentifier AS document_identifier,
      em.GLOBALEVENTID AS globaleventid,
      e.GoldsteinScale AS goldstein_scale,
      e.AvgTone AS avg_tone,
      e.SQLDATE AS event_sql_date
    FROM \`gdelt-bq.gdeltv2.eventmentions_partitioned\` em
    LEFT JOIN \`gdelt-bq.gdeltv2.events\` e
      ON em.GLOBALEVENTID = e.GLOBALEVENTID
    WHERE em._PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
      AND em.MentionIdentifier IN UNNEST(@urls)
    LIMIT 1000
  `

  try {
    const options = {
      query,
      params: { urls: batch },
      location: 'US'
    }

    console.log(`[event-enrich] Starting BigQuery job for ${batch.length} URLs...`)
    const [job] = await bq.createQueryJob(options)
    const [rows] = await job.getQueryResults()
    console.log(`[event-enrich] BigQuery returned ${rows.length} event mappings`)

    if (!rows || rows.length === 0) return []

    // Upsert into local DB
    const dbPath = getEventsDbPathForDate(targetDate)
    const sqlite = sqlite3.verbose()
    const db = new sqlite.Database(dbPath)

    // Ensure tables exist
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        global_event_id TEXT UNIQUE,
        sql_date INTEGER,
        goldstein_scale REAL,
        avg_tone REAL
      )`)

      db.run(`CREATE TABLE IF NOT EXISTS event_mentions (
        document_identifier TEXT UNIQUE,
        global_event_id TEXT,
        goldstein_scale REAL,
        avg_tone REAL,
        last_seen INTEGER
      )`)
    })

    const run = (sql: string, params: any[] = []) => new Promise<any>((resolve, reject) => {
      db.run(sql, params, function(err: any) {
        if (err) return reject(err)
        resolve(this)
      })
    })

    let cached = 0
    for (const r of rows) {
      const doc = r.document_identifier || null
      const gid = r.globaleventid ? String(r.globaleventid) : null
      const gold = (r.goldstein_scale !== null && r.goldstein_scale !== undefined) ? Number(r.goldstein_scale) : null
      const avg = (r.avg_tone !== null && r.avg_tone !== undefined) ? Number(r.avg_tone) : null
      const now = Math.floor(Date.now() / 1000)

      try {
        // Upsert minimal event record
        await run(`INSERT OR IGNORE INTO events (global_event_id, sql_date, goldstein_scale, avg_tone) VALUES (?,?,?,?)`, 
          [gid || null, r.event_sql_date || null, gold, avg])
        await run(`UPDATE events SET goldstein_scale = COALESCE(?, goldstein_scale), avg_tone = COALESCE(?, avg_tone) WHERE global_event_id = ?`, 
          [gold, avg, gid])

        // Upsert mapping
        await run(`INSERT OR REPLACE INTO event_mentions (document_identifier, global_event_id, goldstein_scale, avg_tone, last_seen) VALUES (?,?,?,?,?)`, 
          [doc, gid, gold, avg, now])

        cached++
      } catch (err) {
        console.warn('[event-enrich] Failed to upsert:', err)
      }
    }

    try { db.close() } catch (_) {}
    console.log(`[event-enrich] Cached ${cached} event mappings`)

    return rows
  } catch (err: any) {
    console.error('[event-enrich] BigQuery batch failed:', err?.message || err)
    return []
  }
}

/**
 * Calculate a provisional impact score using available GKG metadata when event data is missing.
 * Formula: score = f(tone_value, mention_count)
 * Returns a score between 0-100, with "provisional" flag.
 */
export function calculateProvisionalScore(article: Article): { score: number; provisional: boolean } {
  // If we have event data, calculate full score
  if (article._event_enriched && article.event) {
    const gold = article.event.goldsteinscale || 0
    const tone = article.event.avg_tone || 0
    const mentions = article.gkg?.mention_count || 1
    
    // Full impact score formula: weighted combination of Goldstein scale, tone, and mentions
    // Goldstein ranges from -10 (most negative) to +10 (most positive)
    // Tone ranges from -100 to +100
    // Higher absolute values = higher impact
    const goldsteinImpact = Math.abs(gold) * 5 // Scale 0-50
    const toneImpact = Math.abs(tone) * 0.25 // Scale 0-25
    const mentionImpact = Math.min(mentions / 100 * 25, 25) // Scale 0-25, cap at 25
    
    const score = Math.min(Math.round(goldsteinImpact + toneImpact + mentionImpact), 100)
    return { score, provisional: false }
  }

  // Provisional score using only GKG data
  if (article._gkg_enriched && article.gkg) {
    const tone = article.gkg.tone_value || 0
    const mentions = article.gkg.mention_count || 0
    
    // Provisional formula: tone + mentions (no Goldstein)
    const toneImpact = Math.abs(tone) * 0.5 // Scale 0-50
    const mentionImpact = mentions > 0 ? Math.min(mentions / 100 * 50, 50) : 0 // Scale 0-50
    
    let score = Math.round(toneImpact + mentionImpact)
    
    // If mention_count is missing but we have tone, give it a base score
    if (mentions === 0 && tone !== 0) {
      // Use tone-based scoring with a higher multiplier when mentions are unavailable
      score = Math.round(Math.abs(tone) * 3.5) // Scale: tone of 10 = score of 35
    }
    
    // If still very low but we have GKG data, use a minimum score
    if (score < 10 && (tone !== 0 || mentions > 0)) {
      score = Math.round(30 + Math.abs(tone) * 2) // Base 30 + tone bonus
    }
    
    return { score: Math.min(Math.max(score, 1), 100), provisional: true }
  }

  // Fallback: use old importance/tone fields if available
  if (article.importance && article.importance > 0) {
    // Use the pre-calculated importance from fetchFromGDELT
    return { score: article.importance, provisional: true }
  }

  // No enrichment data, return minimal provisional score
  return { score: 0, provisional: true }
}

export default enrichArticlesWithEvents
