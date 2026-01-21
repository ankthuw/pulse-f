## 🧠 Filter, Sort & Auto-Refresh Mechanism – How the UI Behaves

This document explains how the **filtering, sorting, and auto-refresh mechanisms** on the Pulse frontend work, based on:

- `src/app/page.tsx`
- `src/components/filter-sort-bar.tsx`
- `src/lib/news-utils.ts`

It complements `REFRESH_MECHANISM_EXPLAINED.md` by focusing on **how the UI shapes and re-fetches data**, not just how refresh forces live data.

---

## 🧩 Core Concepts

The UI controls three main things:

- **API Sort** – changes how the **backend (GDELT API)** orders results.
- **Client Sort** – reorders articles **in the browser only** (no new API call).
- **Filters** – reduce the list of articles based on:
  - impact level,
  - trending level,
  - time window,
  - minimum views,
  - selected sources.
- **Auto-refresh** – periodically re-fetches latest articles automatically.

---

## 1️⃣ State & Main Fetch Function

**File:** `src/app/page.tsx`

Key state:

- `articles`: current list of articles.
- `selectedCategory`: tab-selected category (`all`, `technology`, etc.).
- `apiSort`: how the backend is asked to sort (`relevance`, `date-desc`, etc.).
- `clientSort`: additional client-side ordering (`impact-desc`, `source-asc`, etc.).
- `filters`: impact/trending/time/views/source filters.
- `autoRefreshInterval`: 0 / 60 / 300 / 900 seconds.
- `nextRefreshTime`: used to show countdown.

**Main fetch function:**

```ts
const fetchNews = async (showRefreshToast = true, forceRefresh = false) => {
  if (showRefreshToast) {
    setRefreshing(true)
  } else {
    setLoading(true)
  }

  try {
    const refreshParam = forceRefresh ? '&refresh=true' : ''
    const response = await fetch(
      `/api/news?category=${selectedCategory}&sort=${apiSort}${refreshParam}`
    )
    if (!response.ok) throw new Error('Failed to fetch news')

    const data = await response.json()
    setArticles(data.articles || [])
    setLastUpdated(new Date())

    if (showRefreshToast) {
      toast({
        title: 'News updated',
        description: 'Latest articles loaded successfully',
      })
    }
  } catch (error) {
    // error handling + toast
  } finally {
    setLoading(false)
    setRefreshing(false)
  }
}
```

**Key behaviors:**
- Adds `sort=${apiSort}` to every request.
- Adds `&refresh=true` only when `forceRefresh` is `true` (see refresh doc).
- Controls **loading vs refreshing** states for better UX.

---

## 2️⃣ When Does the UI Re-Fetch Data?

### a) Initial Load & Category / API Sort Changes

```ts
useEffect(() => {
  fetchNews(false) // no toast on initial/load-by-settings change
}, [selectedCategory, apiSort])
```

- Changing **category** (tabs) or **API sort** (dropdown in filter bar):
  - Triggers a **new API call**.
  - Uses the current `selectedCategory` + `apiSort` in the URL.
  - Does **not** force `refresh=true` (so backend controls “fresh vs cached” if implemented).

### b) Manual Refresh Button

```ts
const handleRefresh = () => {
  fetchNews(true, true) // toast + forceRefresh=true → adds &refresh=true
}
```

- Always:
  - Shows “Updating” state + spinner.
  - Adds `&refresh=true` → see `REFRESH_MECHANISM_EXPLAINED.md` for cache-bypass behavior.

### c) Auto-Refresh

`autoRefreshInterval` can be:

- `0` → **Off**
- `60` → every 1 minute
- `300` → every 5 minutes
- `900` → every 15 minutes

Mechanism:

```ts
useEffect(() => {
  // clear previous interval

  if (autoRefreshInterval > 0) {
    const intervalMs = autoRefreshInterval * 1000
    const nextRefresh = new Date(Date.now() + intervalMs)
    setNextRefreshTime(nextRefresh)

    intervalRef.current = setInterval(() => {
      fetchNews(false) // silent refresh, no toast, no refresh=true
      setNextRefreshTime(new Date(Date.now() + intervalMs))
    }, intervalMs)

    return () => { clearInterval(...) }
  } else {
    setNextRefreshTime(null)
  }
}, [autoRefreshInterval, selectedCategory, apiSort])
```

**Important:**
- **Auto-refresh uses `forceRefresh=false`** → **no `refresh=true` flag**.
- It respects the current **category + API sort** every time.
- It runs silently (no toast), just updates data and `lastUpdated`.

---

## 3️⃣ Countdown for Next Auto-Refresh

The UI shows a **live countdown** when auto-refresh is on:

```ts
const remainingSeconds = nextRefreshTime
  ? Math.max(0, Math.ceil((nextRefreshTime.getTime() - Date.now()) / 1000))
  : 0
```

There is a second `useEffect` that:

- Ticks every second.
- If the scheduled time has passed, it **rolls the countdown forward** by one interval, so:
  - The countdown doesn’t freeze at 0.
  - It always shows time until the next expected background refresh.

The value is displayed inside the auto-refresh button in the header.

---

## 4️⃣ Filter & Sort Bar – How It Shapes Articles

**File:** `src/components/filter-sort-bar.tsx`

The Filter & Sort Bar is responsible for:

- Choosing **API sort** (which re-fetches data).
- Choosing **client-side sort** (local reorder only).
- Applying **filters**: impact, trending, time range, min views, sources.
- Showing **active filter count** and summary (e.g. “Showing 25 of 120 articles”).

### a) API Sort vs Client Sort

- **API Sort** (`apiSort`):
  - Options (backed by GDELT `sort`):
    - `relevance`, `date-desc`, `date-asc`, `volume-desc`, `volume-asc`.
  - Selecting a new option updates `apiSort` → triggers `fetchNews()` in `page.tsx`.
  - This changes **what the backend returns** and in which order.

- **Client Sort** (`clientSort`):
  - Options:
    - `none`, `source-asc`, `source-desc`, `impact-asc`, `impact-desc`.
  - Does **not** re-fetch from API.
  - Only reorders the **already fetched** `articles` array.

### b) Impact Level Filter (using `getImpactBadge`)

**File:** `src/lib/news-utils.ts`

```ts
export function getImpactBadge(importance: number) {
  if (importance > 75) return { level: 'critical', ... }
  if (importance > 50) return { level: 'high', ... }
  if (importance > 25) return { level: 'medium', ... }
  return { level: 'low', ... }
}
```

In `page.tsx`, impact filter logic:

```ts
if (filters.impactLevel !== 'all') {
  filtered = filtered.filter(article => {
    const impact = getImpactBadge(article.importance)
    if (filters.impactLevel === 'critical') return impact.level === 'critical'
    if (filters.impactLevel === 'high') return impact.level === 'critical' || impact.level === 'high'
    if (filters.impactLevel === 'medium') return ['critical','high','medium'].includes(impact.level)
    if (filters.impactLevel === 'low') return true
    return true
  })
}
```

**Interpretation:**
- `critical` → only the very top events (importance > 75).
- `high` → high + critical.
- `medium` → medium + high + critical.
- `low` → everything (no filter by impact).

### c) Trending Level Filter (by `views`)

Trending thresholds:

- `viral` → views ≥ 800
- `hot` → views ≥ 500
- `trending` → views ≥ 300
- `rising` → views ≥ 150

In `page.tsx`:

```ts
if (filters.trendingLevel !== 'all') {
  const trendingConfig = { viral: 800, hot: 500, trending: 300, rising: 150 }
  const minViews = trendingConfig[filters.trendingLevel]
  if (minViews) {
    filtered = filtered.filter(article => article.views >= minViews)
  }
}
```

### d) Time Range Filter

Time windows:

- `today` / `24h` → last 24 hours,
- `week` → last 7 days,
- `month` → last 30 days,
- `all` → no time filter.

Logic:

```ts
if (filters.timeRange !== 'all') {
  const hoursMap = { today: 24, '24h': 24, week: 168, month: 720 }
  const hours = hoursMap[filters.timeRange]
  if (hours) {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000)
    filtered = filtered.filter(article =>
      new Date(article.publishedAt).getTime() > cutoff
    )
  }
}
```

### e) Minimum Views & Source Filters

- **Minimum views**:

```ts
if (filters.minViews > 0) {
  filtered = filtered.filter(article => article.views >= filters.minViews)
}
```

- **Sources**:

```ts
if (filters.sources.length > 0) {
  filtered = filtered.filter(article => filters.sources.includes(article.source))
}
```

Source options are dynamically computed from the current article list.

### f) Applying Client-Side Sort

After all filters:

```ts
if (clientSort === 'none') return filtered

return [...filtered].sort((a, b) => {
  switch (clientSort) {
    case 'impact-desc': return b.importance - a.importance
    case 'impact-asc':  return a.importance - b.importance
    case 'source-asc':  return a.source.localeCompare(b.source)
    case 'source-desc': return b.source.localeCompare(a.source)
    default:            return 0
  }
})
```

---

## ✅ Behavior Summary

- **API sort**:
  - Affects **what the backend returns** (GDELT sorting).
  - Triggers a **new fetch** when changed.
- **Client sort**:
  - Affects only **order in the browser**.
  - Does **not** trigger API calls.
- **Filters**:
  - Stack together (impact + trending + time + views + sources).
  - Always applied on top of the latest fetched data.
- **Manual refresh**:
  - Uses `&refresh=true` → forces live fetch (see refresh doc).
- **Auto-refresh**:
  - Periodically re-runs `fetchNews(false)` with current category + API sort.
  - **Does not** send `refresh=true`, so backend can choose cached vs fresh per its logic.
  - Shows a live countdown in the UI for the next refresh.

