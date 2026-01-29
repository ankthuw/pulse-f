# Pulse Documentation

Welcome to the Pulse news analytics platform documentation.

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture](./ARCHITECTURE.md) | BigQuery enrichment system, caching strategy, cost analysis |
| [GDELT API](./GDELT_API.md) | How GDELT Doc API integration works |
| [Scoring](./SCORING.md) | Impact score calculation formula and examples |

## System Overview

Pulse is a real-time news analytics platform that:

1. **Fetches** articles from GDELT Doc API (250 articles per request)
2. **Enriches** with BigQuery data (tone, mentions, Goldstein scale)
3. **Calculates** impact scores (1-100) using weighted components
4. **Caches** results locally for instant repeat lookups

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
echo 'GOOGLE_CLOUD_PROJECT=your-project-id' > .env
echo 'GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"' >> .env

# Run development server
npm run dev

# Build for production
npm run build
npm start
```

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   GDELT     │────▶│    Cache    │────▶│  BigQuery   │
│  Doc API    │     │   (SQLite)  │     │  (Targeted) │
└─────────────┘     └─────────────┘     └─────────────┘
                            │
                            ▼
                     ┌─────────────┐
                     │   Score     │
                     │ Calculation │
                     └─────────────┘
```

## Key Components

### Enrichment System
- **GKG Enrichment**: Fetches tone, mentions, themes from BigQuery
- **Events Enrichment**: Fetches Goldstein scale for accurate scoring
- **Local Caching**: SQLite databases store results for fast repeat lookups
- **Targeted Queries**: Only fetches data for specific URLs (not entire days)

### Impact Score
- **Full Score** (GKG + Events): Goldstein (40%) + Tone (25%) + Mentions (25%) + Time (10%)
- **Provisional Score** (GKG only): Base (30) + Tone (40%) + Mentions (40%)
- Range: 1-100
- See [Scoring System](./IMPACT_SCORE_CALCULATION.md) for details

## Cost & Performance

| Metric | Value |
|--------|-------|
| Data per query | ~100-500 KB |
| Daily usage (1000 req) | ~100-500 MB |
| Monthly cost | ~$0.01 (under 1TB limit) |
| Cache hit rate | ~50-70% (after warmup) |

## Environment Variables

```bash
GOOGLE_CLOUD_PROJECT=gdelt-485102
GOOGLE_APPLICATION_CREDENTIALS="/path/to/credentials.json"
DATABASE_URL="file:./dev.db"
```

## File Structure

```
src/
├── app/
│   ├── api/news/route.ts          # Main API endpoint
│   └── page.tsx                   # Frontend UI
├── lib/
│   ├── gdelt-enrichment-optimized.ts    # GKG enrichment
│   └── event-enrichment-optimized.ts    # Events + scoring
└── types/
    └── news.ts                    # TypeScript types
```

## Monitoring

### Check BigQuery Usage
1. Go to: GCP Console → BigQuery → Job History
2. Filter by project: `gdelt-485102`
3. Check "Total bytes processed" per query

### Expected Logs
```
[gkg-bq] Bytes processed: 125.6 MB
[events-bq] Bytes processed: 245.3 MB
[API] Impact scores: 35 full, 65 provisional
```

## Troubleshooting

### Low enrichment rate (<30%)
- Check if articles are older than 7 days
- Verify BigQuery credentials are valid
- Increase partition window to 14 days

### High BigQuery usage (>5GB/day)
- Check cache hit rate in logs
- Reduce article count per request
- Implement response caching

### Slow API responses (>10s)
- Reduce batch size (500 → 250 URLs)
- Run GKG and Events queries in parallel
- Add API-level caching (5-10 min TTL)

## See Also

- [README.md](../README.md) - Project overview
- [SETUP.md](../SETUP.md) - Setup instructions

---

**Last Updated**: January 26, 2026
