## 📊 GDELT Daily Ingest Mechanism – How Raw Data Is Stored in SQLite

This document explains how the **daily GDELT data ingestion scripts** work, based on:

- `upload/events_daily.py`
- `upload/gkg_daily.py`

These scripts are **offline utilities** that:

- Fetch **full raw data** from GDELT BigQuery tables for a single day.
- Store everything into **local SQLite databases** under `db/`.

---

## 🧱 Overview

There are two separate pipelines:

- **Events pipeline** – stores per-event data:
  - File: `upload/events_daily.py`
  - Output DB pattern: `db/events_YYYYMMDD.db`
- **GKG (Global Knowledge Graph) pipeline** – stores document-level context:
  - File: `upload/gkg_daily.py`
  - Output DB pattern: `db/gkg_YYYYMMDD.db`

Both:

- Use **Google BigQuery** as the source.
- Accept a **date** argument (`YYYY-MM-DD`).
- Use a **max records** limit (default 100,000) to bound dataset size.
- Create the SQLite schema if it doesn’t exist.
- Insert **all fetched rows** with minimal transformation.

---

## 1️⃣ Events Daily Pipeline (`events_daily.py`)

### a) Configuration & DB Path

- `PROJECT_ID`: BigQuery project (default: `gdelt-483607`, overridable via env `GOOGLE_CLOUD_PROJECT`).
- `DB_DIR`: `Path("db")` – output directory for SQLite files.

DB filename pattern:

```py
def get_db_path(target_date: str) -> Path:
    date_clean = target_date.replace('-', '')
    return DB_DIR / f"events_{date_clean}.db"
```

Example:

- Input date: `2025-01-06`
- Output DB: `db/events_20250106.db`

---

### b) EventFetcher – Getting Data from BigQuery

**Class:** `EventFetcher`

- Holds a `bigquery.Client` instance.
- Implements:

```py
def fetch(self, target_date: str, max_records: int = MAX_RECORDS) -> list:
    date_obj = datetime.strptime(target_date, '%Y-%m-%d')
    next_date = date_obj + timedelta(days=1)

    query = f"""
    SELECT
        GLOBALEVENTID,
        SQLDATE,
        MonthYear,
        Year,
        FractionDate,
        Actor1Code,
        Actor1Name,
        ...
        DATEADDED,
        SOURCEURL
    FROM `gdelt-bq.gdeltv2.events`
    WHERE
        SQLDATE >= {int(date_obj.strftime('%Y%m%d'))}
        AND SQLDATE < {int(next_date.strftime('%Y%m%d'))}
        AND Actor1Name IS NOT NULL
        LIMIT {max_records}
    """
```

**Key points:**

- Pulls **all core event fields** from `gdelt-bq.gdeltv2.events`.
- Restricts the time window to **one calendar day** based on `SQLDATE`.
- Filters out rows with `Actor1Name IS NULL` (to avoid empty actor records).
- Uses `LIMIT {max_records}` to protect against extremely large days.

Each row is converted into a Python dict with:

- Cleaned types (e.g. `int()` / `float()` where appropriate).
- Consistent keys such as:
  - `global_event_id`, `sql_date`, `year`, `actor1_name`, `actor2_name`,
  - `goldstein_scale`, `num_mentions`, `num_sources`, `num_articles`,
  - `actor1_geo_*`, `actor2_geo_*`, `action_geo_*`,
  - `date_added`, `source_url`.

---

### c) EventDatabase – Storing into SQLite

**Class:** `EventDatabase`

- Takes a `db_path`, ensures directories exist.
- Initializes the schema:

```py
CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    global_event_id TEXT UNIQUE,
    sql_date INTEGER,
    month_year INTEGER,
    year INTEGER,
    fraction_date REAL,
    actor1_code TEXT,
    actor1_name TEXT,
    ...
    quad_class INTEGER,
    goldstein_scale REAL,
    num_mentions INTEGER,
    num_sources INTEGER,
    num_articles INTEGER,
    avg_tone REAL,
    ...
    action_geo_long REAL,
    action_geo_feature_id TEXT,
    date_added TEXT,
    source_url TEXT
)
```

**Behavior:**

- Uses a **single `events` table** with one row per GDELT event.
- Sets `global_event_id` as **unique** to avoid duplications.
- Inserts each fetched record with `INSERT` statements in a loop.

---

### d) CLI Workflow for Events

Entrypoint: `main()`.

Steps:

1. Parse arguments:
   - `date` (required, `YYYY-MM-DD`).
   - `--project` / `-p` (override BigQuery project).
   - `--max` / `-m` (override max records).
2. Validate the date format.
3. Compute `db_path = get_db_path(args.date)`.
4. Print a short summary (date, output path, max records).
5. Fetch from BigQuery using `EventFetcher`.
6. Store into SQLite using `EventDatabase`.
7. Print a success summary (records count, DB file path).

**Example usage:**

```bash
python upload/events_daily.py 2025-01-06 --max 50000
```

Result:

- Creates (or updates) `db/events_20250106.db` with up to 50,000 event rows.

---

## 2️⃣ GKG Daily Pipeline (`gkg_daily.py`)

### a) Configuration & DB Path

Same pattern as events:

- `PROJECT_ID`: default `gdelt-483607`, overridable.
- `DB_DIR`: `db`.

DB filename pattern:

```py
def get_db_path(target_date: str) -> Path:
    date_clean = target_date.replace('-', '')
    return DB_DIR / f"gkg_{date_clean}.db"
```

Example:

- Date `2025-01-06` → `db/gkg_20250106.db`.

---

### b) GKGFetcher – Getting GKG Data

**Class:** `GKGFetcher`

- Uses `bigquery.Client`.
- Fetches from `gdelt-bq.gdeltv2.gkg_partitioned`:

```py
query = f"""
SELECT
    GKGRECORDID,
    DATE,
    SourceCollectionIdentifier,
    SourceCommonName,
    DocumentIdentifier,
    Counts,
    V2Counts,
    Themes,
    V2Themes,
    Locations,
    V2Locations,
    Persons,
    V2Persons,
    Organizations,
    V2Organizations,
    V2Tone,
    Dates,
    GCAM,
    SharingImage,
    RelatedImages,
    SocialImageEmbeds,
    SocialVideoEmbeds,
    Quotations,
    AllNames,
    Amounts,
    TranslationInfo,
    Extras,
    PARSE_TIMESTAMP('%Y%m%d%H%M%S', CAST(DATE AS STRING)) as date_ts
FROM `gdelt-bq.gdeltv2.gkg_partitioned`
WHERE
    _PARTITIONTIME >= TIMESTAMP('{target_date}')
    AND _PARTITIONTIME < TIMESTAMP('{next_date}')
    AND DocumentIdentifier IS NOT NULL
LIMIT {max_records}
"""
```

**Key points:**

- Uses partition time (`_PARTITIONTIME`) to select a **single day**.
- Ensures `DocumentIdentifier` is present (documents with identifiable URLs/docs).
- Extracts a parsed timestamp `date_ts` from the raw `DATE` field.

Each record is converted into a dict with keys:

- `gkg_record_id`, `date`, `date_ts`,
- `source_collection_id`, `source_common_name`, `document_identifier`,
- `counts`, `v2_counts`,
- `themes`, `v2_themes`,
- `locations`, `v2_locations`,
- `persons`, `v2_persons`,
- `organizations`, `v2_organizations`,
- `v2_tone`, `dates`, `gcam`,
- `sharing_image`, `related_images`,
- `social_image_embeds`, `social_video_embeds`,
- `quotations`, `all_names`, `amounts`,
- `translation_info`, `extras`.

---

### c) GKGDatabase – Storing into SQLite

**Class:** `GKGDatabase`

- Creates `gkg` table if not present:

```py
CREATE TABLE IF NOT EXISTS gkg (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gkg_record_id TEXT,
    date INTEGER,
    date_ts TEXT,
    source_collection_id TEXT,
    source_common_name TEXT,
    document_identifier TEXT,
    counts TEXT,
    v2_counts TEXT,
    themes TEXT,
    v2_themes TEXT,
    locations TEXT,
    v2_locations TEXT,
    persons TEXT,
    v2_persons TEXT,
    organizations TEXT,
    v2_organizations TEXT,
    v2_tone TEXT,
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
)
```

- Adds indexes for performance:
  - `idx_gkg_date` on `date`
  - `idx_gkg_source` on `source_common_name`
  - `idx_gkg_record_id` on `gkg_record_id`

**Store step:**

- Iterates all records and does `INSERT INTO gkg (...) VALUES (...)`.
- Commits once at the end.

---

### d) CLI Workflow for GKG

Entrypoint: `main()`.

Steps:

1. Parse arguments:
   - `date` (`YYYY-MM-DD`),
   - `--project` / `-p`,
   - `--max` / `-m`.
2. Validate date string.
3. Compute `db_path = get_db_path(args.date)`.
4. Print overview (date, output DB, max records).
5. Fetch with `GKGFetcher`.
6. Store with `GKGDatabase`.
7. Print final summary.

**Example usage:**

```bash
python upload/gkg_daily.py 2025-01-06
```

Result:

- Creates/updates `db/gkg_20250106.db` with full GKG records for that day.

---

## ✅ How These Pipelines Fit Into the System

- **Purpose**:
  - Provide a **rich local data lake** of GDELT **events** and **GKG** for advanced analysis, dashboards, or additional features.
- **Separation**:
  - **Daily ingest scripts** (Python + BigQuery + SQLite) are **independent** from the **live `/api/news` endpoint** (Next.js + GDELT HTTP API).
- **Benefits**:
  - You can run heavy offline analytics on SQLite files without hammering GDELT or BigQuery in real time.
  - Each day’s data is isolated → easy backup / archiving / reprocessing.

