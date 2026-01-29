# Enrichment System Architecture

## Overview

Pulse uses a **targeted BigQuery enrichment strategy** to calculate accurate impact scores while minimizing data scanned. This system fetches enrichment data (tone, mentions, Goldstein scale) only for the specific URLs returned by the GDELT Doc API.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ 1. GDELT Doc API Request                                    │
│    → Returns 250 articles with basic metadata (url, title) │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Check Local Cache (SQLite)                               │
│    → Fast lookup for previously enriched URLs               │
│    → Cache hit: Return immediately                          │
│    → Cache miss: Add to BigQuery batch                      │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Batch Query BigQuery (missing URLs only)                │
│    WHERE DocumentIdentifier IN UNNEST(@urls)                │
│    AND _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), │
│                                       INTERVAL 7 DAY)        │
│    → Only scans ~100-500 KB per query                      │
└────────────────────────┬────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Cache Results Locally                                   │
│    → Next request for same URL = instant cache hit         │
└─────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|------|---------|
| `src/lib/gdelt-enrichment-optimized.ts` | GKG enrichment (tone, mentions, themes) |
| `src/lib/event-enrichment-optimized.ts` | Events enrichment (Goldstein scale, event linkage) |
| `src/app/api/news/route.ts` | Main orchestration |

## Cost Analysis

| Metric | Value |
|--------|-------|
| Data per query | ~100-500 KB |
| Daily usage (1000 req) | ~100-500 MB |
| Monthly cost | ~$0.01 (well under 1TB limit) |
| Cache hit rate (after warmup) | ~50-70% |

## Enrichment Flow

### Step 1: GKG Enrichment (`enrichArticlesWithGKGOptimized`)

**Purpose**: Fetch tone, mentions, themes, persons data

**Source**: `gdelt-bq.gdeltv2.gkg_partitioned`

**Query**:
```sql
SELECT
  DocumentIdentifier,
  SourceCommonName,
  V2Tone,
  V2Themes,
  V2Persons
FROM `gdelt-bq.gdeltv2.gkg_partitioned`
WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND DocumentIdentifier IN UNNEST(@urls)
```

**Caches to**: `db/gkg_YYYYMMDD.db`

### Step 2: Events Enrichment (`enrichArticlesWithEventsOptimized`)

**Purpose**: Fetch Goldstein scale, event linkage

**Source**: `gdelt-bq.gdeltv2.eventmentions_partitioned` + `events`

**Query**:
```sql
SELECT
  em.MentionIdentifier AS document_identifier,
  e.GLOBALEVENTID AS global_event_id,
  e.GoldsteinScale AS goldstein_scale,
  e.AvgTone AS avg_tone,
  e.NumMentions AS num_mentions
FROM `gdelt-bq.gdeltv2.eventmentions_partitioned` em
INNER JOIN `gdelt-bq.gdeltv2.events` e ON em.GLOBALEVENTID = e.GLOBALEVENTID
WHERE em._PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
  AND em.MentionIdentifier IN UNNEST(@urls)
LIMIT 1000
```

**Caches to**: `db/events_YYYYMMDD.db`

### Step 3: Calculate Impact Score (`calculateProvisionalScore`)

See [Scoring](./SCORING.md) for details.

## Environment Variables

```bash
# .env
GOOGLE_CLOUD_PROJECT=gdelt-485102
GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
```

## Database Schema

### GKG Cache (`db/gkg_YYYYMMDD.db`)

```sql
CREATE TABLE gkg (
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
CREATE INDEX idx_gkg_doc_id ON gkg(document_identifier);
```

### Events Cache (`db/events_YYYYMMDD.db`)

```sql
CREATE TABLE event_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_identifier TEXT UNIQUE,
  global_event_id TEXT,
  goldstein_scale REAL,
  avg_tone REAL,
  num_mentions INTEGER,
  event_time_date INTEGER,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_events_doc_id ON event_mentions(document_identifier);
```

## API Integration

### Main Route: `src/app/api/news/route.ts`

```typescript
// 1. Fetch from GDELT Doc API
const articles = await fetchFromGDELT(category, lang, sort)

// 2. Enrich with GKG metadata (tone, mentions)
const gkgEnriched = await enrichArticlesWithGKGOptimized(articles)

// 3. Enrich with Events metadata (Goldstein scale)
const eventEnriched = await enrichArticlesWithEventsOptimized(gkgEnriched)

// 4. Calculate impact scores
const withScores = eventEnriched.map(article => {
  const { score, provisional } = calculateProvisionalScore(article)
  return {
    ...article,
    importance: score,
    impact_score: score,
    score_provisional: provisional,
  }
})

return NextResponse.json({ articles: withScores })
```

## Monitoring

### Check BigQuery Usage

```bash
# GCP Console → BigQuery → Job History
# Filter by: projectId = gdelt-485102
# Check: Total bytes processed per query
```

### Expected Logs

```
[gkg-bq] Bytes processed: 125.6 MB
[gkg-cache] Cached 45 results to local DB
[gkg-enrich] Final result: 45/100 articles enriched

[events-bq] Bytes processed: 245.3 MB
[events-cache] Cached 35 results to local DB
[events-enrich] Final result: 35/100 articles enriched

[API] Impact scores: 35 full, 65 provisional
```

## Troubleshooting

### Low Enrichment Rate (<30%)

**Cause**: Articles older than 7 days, or syndicated content mismatch

**Solutions**:
1. Increase partition window: `INTERVAL 14 DAY` instead of `7 DAY`
2. Check article dates in Doc API response
3. Verify BigQuery credentials are valid

### High BigQuery Usage (>5GB/day)

**Cause**: Too many unique URLs, cache not being used

**Solutions**:
1. Check cache hit rate in logs
2. Reduce article count per request (100 → 50)
3. Increase partition window to reduce repeated queries

### Slow API Responses (>10s)

**Cause**: BigQuery queries timing out

**Solutions**:
1. Reduce batch size (500 → 250 URLs)
2. Run GKG and Events queries in parallel
3. Add response caching at API level (5-10 min TTL)

## Setup Requirements

1. **Google Cloud Project** with BigQuery API enabled
2. **Service account credentials** with BigQuery read access
3. **Node.js dependencies**:
   ```bash
   npm install @google-cloud/bigquery sqlite3
   ```

No manual database setup required - cache databases are auto-created on first use.

---

**Last Updated**: January 26, 2026
