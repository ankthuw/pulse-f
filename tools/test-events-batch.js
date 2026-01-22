#!/usr/bin/env node
/*
  tools/test-events-batch.js
  Usage:
    node tools/test-events-batch.js url1 url2 --date=2026-01-22 --project=your-project-id

  This script will:
  - take a list of document URLs
  - query BigQuery `eventmentions_partitioned` -> join `events` for matching GLOBALEVENTID
  - upsert returned events into local SQLite DB `db/events_YYYYMMDD.db` and create a mapping table `event_mentions`
  - print how many mappings/events were fetched and cached

  Requires: @google-cloud/bigquery and sqlite3 (installed in project)
*/

const {BigQuery} = require('@google-cloud/bigquery')
const sqlite3 = require('sqlite3').verbose()
const path = require('path')
const fs = require('fs')

function usage(){
  console.log('Usage: node tools/test-events-batch.js url1 url2 --date=YYYY-MM-DD --project=PROJECT_ID')
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
const dbPath = path.join(process.cwd(), 'db', `events_${dateClean}.db`)

if (!projectArg && !process.env.GOOGLE_CLOUD_PROJECT) {
  console.warn('No project specified via --project or GOOGLE_CLOUD_PROJECT; BigQuery calls will be skipped unless env is set')
}

async function run(){
  console.log('Events DB:', dbPath)

  // Open/create DB
  const exists = fs.existsSync(dbPath)
  const sqlite = new sqlite3.Database(dbPath)
  const runSql = (sql, params=[]) => new Promise((res, rej)=> sqlite.run(sql, params, function(err){ if(err) return rej(err); res(this); }))
  const get = (sql, params=[]) => new Promise((res, rej)=> sqlite.get(sql, params, (e,r)=> e?rej(e):res(r)))

  // Ensure minimal events table exists (the full ingest creates full schema, but we ensure enough columns)
  sqlite.serialize(() => {
    sqlite.run(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      global_event_id TEXT UNIQUE,
      sql_date INTEGER,
      goldstein_scale REAL,
      avg_tone REAL
    )`)

    sqlite.run(`CREATE TABLE IF NOT EXISTS event_mentions (
      document_identifier TEXT UNIQUE,
      global_event_id TEXT,
      goldstein_scale REAL,
      avg_tone REAL,
      last_seen INTEGER
    )`)
  })

  // Check which URLs are missing mapping
  const toFetch = []
  for (const url of urls) {
    try {
      const row = await get('SELECT 1 FROM event_mentions WHERE document_identifier = ? LIMIT 1', [url])
      if (!row) toFetch.push(url)
      else console.log('Mapping exists locally:', url)
    } catch (err) {
      console.warn('Local lookup failed:', err.message||err)
      toFetch.push(url)
    }
  }

  if (toFetch.length === 0) {
    console.log('All URLs already mapped locally; nothing to fetch.')
    sqlite.close()
    return
  }

  const projectId = projectArg || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT
  if (!projectId) {
    console.log('No BigQuery project configured; cannot fetch missing mappings for:', toFetch)
    sqlite.close()
    return
  }

  const bq = new BigQuery({ projectId })
  const batch = toFetch.slice(0, 500)
  console.log('Querying BigQuery eventmentions->events for', batch.length, 'urls...')

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
    const options = { query, params: { urls: batch }, location: 'US' }
    const [job] = await bq.createQueryJob(options)
    console.log(`BigQuery job ${job.id} started...`)
    const [rows] = await job.getQueryResults()
    console.log('BigQuery returned rows:', rows.length)

    if (rows.length === 0) { sqlite.close(); return }

    let fetched = 0
    for (const r of rows) {
      const doc = r.document_identifier || null
      const gid = r.globaleventid ? String(r.globaleventid) : null
      const gold = (r.goldstein_scale !== null && r.goldstein_scale !== undefined) ? Number(r.goldstein_scale) : null
      const avg = (r.avg_tone !== null && r.avg_tone !== undefined) ? Number(r.avg_tone) : null
      const now = Math.floor(Date.now()/1000)

      // Upsert minimal event record
      await runSql(`INSERT OR IGNORE INTO events (global_event_id, sql_date, goldstein_scale, avg_tone) VALUES (?,?,?,?)`, [gid || null, r.event_sql_date || null, gold, avg])
      await runSql(`UPDATE events SET goldstein_scale = COALESCE(?, goldstein_scale), avg_tone = COALESCE(?, avg_tone) WHERE global_event_id = ?`, [gold, avg, gid])

      // Upsert mapping
      await runSql(`INSERT OR REPLACE INTO event_mentions (document_identifier, global_event_id, goldstein_scale, avg_tone, last_seen) VALUES (?,?,?,?,?)`, [doc, gid, gold, avg, now])

      fetched++
    }

    console.log('Cached mappings/events:', fetched)
    sqlite.close()
  } catch (err) {
    console.error('BigQuery or DB error:', err.message || err)
    try { sqlite.close() } catch(_){}
  }
}

run().catch(e=>{ console.error(e); process.exit(1) })
