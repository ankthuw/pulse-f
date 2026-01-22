#!/usr/bin/env node
/*
  tools/test-batch.js
  Usage:
    node tools/test-batch.js url1 url2 --date=2026-01-22 --project=your-project-id

  This script will:
  - take a list of document URLs
  - query BigQuery partitioned GKG table for matching DocumentIdentifier rows in the last 2 days
  - upsert returned rows into local SQLite DB `db/gkg_YYYYMMDD.db`
  - print how many rows were fetched and cached

  Requires: @google-cloud/bigquery and sqlite3 (installed in project)
*/

const {BigQuery} = require('@google-cloud/bigquery')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')

function usage(){
  console.log('Usage: node tools/test-batch.js url1 url2 --date=YYYY-MM-DD --project=PROJECT_ID')
  process.exit(1)
}

const argv = process.argv.slice(2)
if (argv.length === 0) usage()

let dateArg = null
let projectArg = null
const urls = []
for (const a of argv) {
  if (a.startsWith('--date=')) dateArg = a.split('=')[1]
  else if (a.startsWith('--project=')) projectArg = a.split('=')[1]
  else urls.push(a)
}

if (!dateArg) dateArg = new Date().toISOString().slice(0,10)
const dateClean = dateArg.replace(/-/g,'')
const dbPath = path.join(process.cwd(), 'db', `gkg_${dateClean}.db`)

if (!projectArg && !process.env.GOOGLE_CLOUD_PROJECT) {
  console.warn('No project specified via --project or GOOGLE_CLOUD_PROJECT; BigQuery calls will be skipped unless env is set')
}

async function run(){
  console.log('DB:', dbPath)

  // Open local DB if exists
  const hasDb = fs.existsSync(dbPath)
  if (!hasDb) console.log('Local DB not found; it will be created if BigQuery returns rows')

  // First try to find rows locally for each URL
  const sqlite = new sqlite3.Database(dbPath)
  const get = (sql, params=[]) => new Promise((res, rej)=> sqlite.get(sql, params, (e,r)=> e?rej(e):res(r)))
  const runSql = (sql, params=[]) => new Promise((res, rej)=> sqlite.run(sql, params, function(err){ if(err) return rej(err); res(this); }))

  const toFetch = []
  for (const url of urls) {
    if (!hasDb) { toFetch.push(url); continue }
    try {
      const row = await get('SELECT 1 FROM gkg WHERE document_identifier = ? LIMIT 1', [url])
      if (!row) toFetch.push(url)
      else console.log('Found locally:', url)
    } catch (err) {
      console.warn('Local lookup failed:', err.message||err)
      toFetch.push(url)
    }
  }

  if (toFetch.length === 0) {
    console.log('All URLs already present locally; nothing to fetch.')
    sqlite.close()
    return
  }

  // If no project or credentials, skip BigQuery
  const projectId = projectArg || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  if (!projectId) {
    console.log('No BigQuery project configured; cannot fetch missing rows:', toFetch)
    sqlite.close()
    return
  }

  const bq = new BigQuery({ projectId })
  const batch = toFetch.slice(0, 500)
  console.log('Querying BigQuery for', batch.length, 'urls...')

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
    WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 2 DAY)
      AND DocumentIdentifier IN UNNEST(@urls)
  `

  try {
    const options = { query, params: { urls: batch }, location: 'US' }
    const [job] = await bq.createQueryJob(options)
    console.log(`BigQuery job ${job.id} started...`)
    const [rows] = await job.getQueryResults()
    console.log('BigQuery returned rows:', rows.length)

    if (rows.length === 0) { sqlite.close(); return }

    // ensure DB has table
    sqlite.serialize(() => {
      sqlite.run(`CREATE TABLE IF NOT EXISTS gkg (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gkg_record_id TEXT,
        date INTEGER,
        date_ts TEXT,
        source_collection_id TEXT,
        source_common_name TEXT,
        document_identifier TEXT,
        counts TEXT,
        v2_counts TEXT,
        mention_count INTEGER,
        themes TEXT,
        v2_themes TEXT,
        locations TEXT,
        v2_locations TEXT,
        persons TEXT,
        v2_persons TEXT,
        organizations TEXT,
        v2_organizations TEXT,
        v2_tone TEXT,
        tone_value REAL,
        dates TEXT,
        gcam TEXT,
        sharing_image TEXT,
        related_images TEXT,
        social_image_embeds TEXT,
        social_video_embeds TEXT,
        quotations TEXT,
        all_names TEXT,
        amounts TEXT,
        translation_info TEXT,
        extras TEXT
      )`) 
    })

    // Upsert each row
    let fetched = 0
    for (const r of rows) {
      // parse tone and mention
      let tone_value = null
      try { const parts = (r.V2Tone||'').split(','); if (parts.length>1) tone_value = parseFloat(parts[1]) } catch(e){}
      let mention_count = null
      try { const m = ((r.V2Counts||'').match(/\d+/g)||[]).map(Number); if (m.length) mention_count = Math.max(...m) } catch(e){}

      // try update
      const upd = await new Promise((res) => sqlite.run(`UPDATE gkg SET source_common_name=?, v2_tone=?, tone_value=?, mention_count=?, v2_themes=?, v2_persons=?, date_ts=? WHERE document_identifier=?`, [r.SourceCommonName||null, r.V2Tone||null, tone_value, mention_count, r.V2Themes||null, r.V2Persons||null, r.date_ts||null, r.DocumentIdentifier], function(err){ if (err) { res({err}); } else { res({changes:this.changes}); }}))
      if (!upd.err && upd.changes && upd.changes>0) {
        fetched++
        continue
      }

      // insert
      const insertSql = `INSERT INTO gkg (gkg_record_id, date, date_ts, source_collection_id, source_common_name, document_identifier, counts, v2_counts, mention_count, themes, v2_themes, locations, v2_locations, persons, v2_persons, organizations, v2_organizations, v2_tone, tone_value, dates, gcam, sharing_image, related_images, social_image_embeds, social_video_embeds, quotations, all_names, amounts, translation_info, extras) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      const vals = [null, null, r.date_ts||null, null, r.SourceCommonName||null, r.DocumentIdentifier, null, r.V2Counts||null, mention_count, null, r.V2Themes||null, null, null, null, r.V2Persons||null, null, null, r.V2Tone||null, tone_value, null, null, null, null, null, null, null, null, null, null]
      await new Promise((res, rej) => sqlite.run(insertSql, vals, function(err){ if (err) return rej(err); res(this.lastID)}))
      fetched++
    }

    console.log('Cached rows:', fetched)
    sqlite.close()
  } catch (err) {
    console.error('BigQuery or DB error:', err.message || err)
    try { sqlite.close() } catch(_){}
  }
}

run().catch(e=>{ console.error(e); process.exit(1) })
