## 🌐 GDELT News API Mechanism – How `/api/news` Works

This document explains how the **GDELT-powered news API** in Pulse works, similar in style to `REFRESH_MECHANISM_EXPLAINED.md`.

---

## ❓ Is `/api/news` using live GDELT data?

**Yes.** Each call to `/api/news` triggers a **live fetch from the GDELT GKG API**, with:

- Category → mapped to **keywords**
- Language (`lang`) → mapped to **source language filter**
- Sort (`sort`) → mapped to **GDELT sort parameters**

There is **no local cache layer** inside this route – every request hits GDELT directly (subject to GDELT availability and network).

---

## 🔄 End-to-End Flow

### 1️⃣ Frontend Calls the API

Typical request:

```text
GET /api/news?category=technology&lang=en&sort=relevance
```

**Parameters:**
- `category`: `all`, `technology`, `business`, `science`, `health`, `sports`, `entertainment`, `politics`
- `lang`: `en` or `vi`
- `sort`: `relevance`, `date-desc`, `date-asc`, `volume-desc`, `volume-asc`

These are controlled from the UI (category tabs + API sort dropdown).

---

### 2️⃣ Backend Receives Request

**File:** `src/app/api/news/route.ts`

Key logic:

```ts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const category = searchParams.get('category') || 'all'
  const lang = (searchParams.get('lang') || 'en') as 'en' | 'vi'
  const sort = searchParams.get('sort') || 'relevance'

  // 1. Fetch from GDELT (live)
  const articles = await fetchFromGDELT(category, lang, sort)

  // 2. De-duplicate by URL
  const seen = new Set<string>()
  const uniqueArticles = articles.filter(article => {
    if (seen.has(article.url)) return false
    seen.add(article.url)
    return true
  })

  // 3. Trim to 100 articles and respond
  const resultArticles = uniqueArticles.slice(0, 100)

  return NextResponse.json({
    articles: resultArticles,
    cached: false,
    count: resultArticles.length,
    source: 'gdelt',
  })
}
```

**What this means:**
- Always calls GDELT (no DB cache).
- Removes duplicate URLs.
- Returns **up to 100** articles per request.

---

### 3️⃣ Mapping UI Params → GDELT Query

**Category mapping:**

```ts
const CATEGORY_KEYWORDS: Record<string, string> = {
  technology: 'technology',
  business: 'business economy finance',
  science: 'science research',
  health: 'health medical',
  sports: 'sports',
  entertainment: 'entertainment movies music',
  politics: 'politics election government',
  all: 'news',
}
```

- `category` is translated into a **keyword query** for the GDELT GKG API.

**Sort mapping:**

```ts
const SORT_PARAMS: Record<string, string> = {
  relevance: 'HybridRel',
  'date-desc': 'DateDesc',
  'date-asc': 'DateAsc',
  'volume-desc': 'VolumeDesc',
  'volume-asc': 'VolumeAsc',
}
```

- UI `sort` option becomes the **`sort` parameter** on the GDELT API.

**Language filter:**

```ts
const languageFilter =
  lang === 'vi' ? 'sourcelang:Vietnamese' : 'sourcelang:English'
```

- `lang=en` → only English sources
- `lang=vi` → only Vietnamese sources

---

### 4️⃣ GDELT Fetch Logic

**Function:** `fetchFromGDELT(category, lang, sort)`

High-level flow:

```ts
const keyword = CATEGORY_KEYWORDS[category] || 'news'
const languageFilter = lang === 'vi' ? 'sourcelang:Vietnamese' : 'sourcelang:English'

const params = new URLSearchParams({
  mode: 'artlist',
  format: 'json',
  maxrecords: '250',
  query: `${languageFilter} ${keyword}`,
  sort: SORT_PARAMS[sort] || 'HybridRel',
})

const url = `${GDELT_GKG_API}?${params.toString()}`
const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
```

**Key points:**
- Uses `mode=artlist` and `format=json`.
- Requests up to **250** records.
- Applies a **30-second timeout** for safety.
- Logs failures and returns `[]` if:
  - HTTP status is not OK,
  - response is not JSON,
  - JSON parsing fails.

---

### 5️⃣ Transforming GDELT Articles → Pulse Articles

Each raw GDELT item is converted into an internal `NewsArticle`-like object.

**Date handling:**

- GDELT `seendate` looks like: `YYYYMMDDTHHmmssZ` (e.g. `20251228T101500Z`).
- The code parses this into a standard ISO timestamp for `publishedAt`.
- If parsing fails, it falls back to `new Date()`.

**Importance score:**

```ts
let importance = 50
if (item.tone) importance += (item.tone + 10) * 0.5
if (item.goldsteinscale) importance += Math.abs(item.goldsteinscale) * 5
importance = Math.round(Math.min(100, Math.max(0, importance)))
```

- Starts at **50** (baseline).
- Increases with:
  - **Tone**: more extreme tone → higher adjustment.
  - **GoldsteinScale**: larger magnitude (positive or negative) → higher impact.
- Clamped to **0–100** and rounded.

**Views estimate:**

```ts
views: item.seenqty
  ? Math.min(item.seenqty * 10, 2000)
  : Math.floor(Math.random() * 900) + 100
```

- If `seenqty` (how many times the article has been seen) exists:
  - Convert to a **capped view count** (max 2000).
- Otherwise:
  - Use a **randomized fallback** between 100–999 (for UI purposes).

**Final mapped structure (simplified):**

```ts
{
  id: `${category}-${index}-${item.url || index}`,
  title: item.title || 'Untitled',
  description: item.seenqty
    ? `${item.seenqty} mentions across global media`
    : null,
  url: item.url || '#',
  imageUrl: item.socialimage || null,
  publishedAt: parsedPublishedAt,
  source: item.domain || 'Unknown',
  category,
  author: null,
  importance, // 0–100
  views,      // estimated
}
```

---

## 🧹 De-duplication & Result Shaping

After fetching and mapping:

1. **Duplicates removed**:
   - A `Set` of URLs is used.
   - If a URL has been seen, that article is dropped.
2. **Limited result size**:
   - Only the **first 100 unique** articles are kept.

The final response JSON shape:

```json
{
  "articles": [/* up to 100 articles */],
  "cached": false,
  "count": 100,
  "source": "gdelt"
}
```

---

## ✅ Behavior Summary

- **Live data**: Every request hits the **GDELT GKG API** directly.
- **Category-aware**: Keyword mapping tailors the query for each category.
- **Language-aware**: `lang=en/vi` limits results by source language.
- **Sort-aware**: UI sort options are passed through to GDELT.
- **Enriched**: Each article has:
  - `importance` (0–100) based on tone and GoldsteinScale,
  - `views` (realistic estimate for trending badges),
  - normalized fields ready for the UI.
- **Safe**: Timeouts, JSON checks, and error handling prevent crashes even when GDELT misbehaves.

