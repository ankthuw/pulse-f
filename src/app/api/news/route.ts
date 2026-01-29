import { NextRequest, NextResponse } from 'next/server'
import { enrichArticlesWithGKGOptimized } from '@/lib/gdelt-enrichment-optimized'
import { enrichArticlesWithEventsOptimized, calculateProvisionalScore } from '@/lib/event-enrichment-optimized'
import { recategorizeArticles } from '@/lib/article-categorizer'

// GDELT doc API endpoint
const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc'

// Category to GDELT keyword mapping
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

// GDELT sort parameter mapping
const SORT_PARAMS: Record<string, string> = {
  relevance: 'HybridRel',
  'date-desc': 'DateDesc',
  'date-asc': 'DateAsc',
  'volume-desc': 'VolumeDesc',
  'volume-asc': 'VolumeAsc',
}

async function fetchFromGDELT(category: string, lang: string = 'en', sort: string = 'relevance', toneFilter?: string, toneAbsFilter?: string): Promise<any[]> {
  try {
    // Use a general query to get recent articles
    const keyword = CATEGORY_KEYWORDS[category] || 'news'
    const languageFilter = lang === 'vi' ? 'sourcelang:Vietnamese' : 'sourcelang:English'
    let queryParts = [`${languageFilter} ${keyword}`]
    // Note: tone is parsed from response (tonechart field), not a query parameter
    if (toneFilter) queryParts.push(toneFilter)
    if (toneAbsFilter) queryParts.push(toneAbsFilter)
    const params = new URLSearchParams({
      mode: 'artlist',
      format: 'json',
      maxrecords: '100',  // Reduced from 250 for faster responses
      query: queryParts.join(' '),
      sort: SORT_PARAMS[sort] || 'HybridRel'
    })

    const url = `${GDELT_DOC_API}?${params.toString()}`
    console.log(`[GDELT] Fetching: ${url}`)

    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),  // Reduced from 30s to 15s
    })

    if (!response.ok) {
      console.log(`[GDELT] Failed: ${response.status}`)
      return []
    }

    const text = await response.text()

    // Check if response is JSON (GDELT sometimes returns error text)
    if (!text.trim().startsWith('{')) {
      console.log(`[GDELT] Response is not JSON: ${text.slice(0, 100)}`)
      return []
    }

    let data
    try {
      data = JSON.parse(text)
    } catch {
      console.log(`[GDELT] Failed to parse JSON: ${text.slice(0, 100)}`)
      return []
    }

    const articles = data.articles || []
    console.log(`[GDELT] Got ${articles.length} articles`)

    // GDELT DOC API doesn't return tone data, so we estimate it from title
    function estimateTone(title: string): number {
      if (!title) return 0
      
      const text = title.toLowerCase()
      
      // Negative keywords (score -1 each)
      const negativeWords = [
        // Violence & Crime
        'death', 'died', 'kill', 'murder', 'war', 'attack', 'terror', 'assault',
        'violence', 'destroy', 'victim', 'arrest', 'criminal', 'crime', 'abuse',
        'shooting', 'explosion', 'bomb', 'hostage', 'kidnap', 'theft', 'robbery',
        
        // Disasters & Accidents
        'disaster', 'crash', 'collapse', 'emergency', 'danger', 'fatal', 'tragedy',
        'earthquake', 'flood', 'fire', 'hurricane', 'tornado', 'accident', 'injured',
        
        // Economic & Financial
        'crisis', 'recession', 'unemployment', 'layoff', 'bankrupt', 'debt', 'deficit',
        'loss', 'cut', 'slash', 'decline', 'plunge', 'slump', 'downturn', 'collapse',
        
        // Health & Medical
        'disease', 'pandemic', 'epidemic', 'outbreak', 'infection', 'virus', 'cancer',
        'illness', 'sick', 'hospital', 'critical', 'severe', 'deadly', 'fatal',
        
        // Conflict & Political
        'conflict', 'protest', 'riot', 'strike', 'scandal', 'corruption', 'controversy',
        'impeach', 'resign', 'investigate', 'lawsuit', 'sue', 'penalty', 'sanction',
        
        // Negative Emotions & States
        'fail', 'failure', 'defeat', 'threat', 'fear', 'worry', 'concern', 'angry',
        'frustrated', 'disappointed', 'regret', 'blame', 'accuse', 'condemn', 'criticize',
        'warning', 'alert', 'urgent', 'desperate', 'chaos', 'turmoil', 'uncertain'
      ]
      
      // Positive keywords (score +1 each)
      const positiveWords = [
        // Success & Achievement
        'success', 'successful', 'win', 'victory', 'triumph', 'achieve', 'achievement',
        'breakthrough', 'milestone', 'record', 'historic', 'champion', 'leader', 'best',
        
        // Growth & Progress
        'growth', 'gain', 'rise', 'surge', 'boom', 'prosper', 'thrive', 'flourish',
        'expand', 'increase', 'progress', 'advance', 'develop', 'evolve', 'upgrade',
        
        // Innovation & Launch
        'innovate', 'innovation', 'revolutionary', 'pioneer', 'launch', 'unveil',
        'introduce', 'debut', 'discover', 'invention', 'breakthrough', 'cutting-edge',
        
        // Improvement & Solution
        'improve', 'improvement', 'enhance', 'better', 'optimize', 'solution', 'solve',
        'fix', 'resolve', 'overcome', 'transform', 'modernize', 'reform', 'upgrade',
        
        // Recognition & Honor
        'award', 'prize', 'honor', 'recognize', 'celebrate', 'praise', 'applaud',
        'commend', 'appreciate', 'distinguished', 'prestigious', 'acclaimed', 'renowned',
        
        // Health & Recovery
        'recover', 'recovery', 'heal', 'cure', 'healthy', 'wellness', 'survive',
        'save', 'rescue', 'prevent', 'protect', 'safe', 'secure', 'stable',
        
        // Positive Actions & Support
        'help', 'assist', 'support', 'aid', 'donate', 'contribute', 'volunteer',
        'benefit', 'advantage', 'opportunity', 'promise', 'potential', 'hope',
        'inspire', 'motivate', 'empower', 'unite', 'collaborate', 'cooperate'
      ]
      
      let score = 0
      
      // Count negative words
      for (const word of negativeWords) {
        if (text.includes(word)) score -= 1
      }
      
      // Count positive words
      for (const word of positiveWords) {
        if (text.includes(word)) score += 1
      }
      
      // Normalize to range -10 to +10
      return Math.max(-10, Math.min(10, score * 2))
    }

    return articles.map((item: any, index: number) => {
      // Parse GDELT date format: YYYYMMDDTHHmmssZ
      let publishedAt = new Date()
      if (item.seendate) {
        try {
          // GDELT returns dates like "20251228T101500Z"
          const dateStr = item.seendate.replace('T', ' ').replace('Z', '')
          const year = dateStr.slice(0, 4)
          const month = dateStr.slice(4, 6)
          const day = dateStr.slice(6, 8)
          const hour = dateStr.slice(9, 11)
          const minute = dateStr.slice(11, 13)
          const second = dateStr.slice(13, 15)
          publishedAt = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`)
        } catch {
          publishedAt = new Date()
        }
      }

      // Estimate tone from title (GDELT DOC API doesn't provide tone data)
      const tone = estimateTone(item.title || '')

      // Debug: log tone estimation for first few articles
      if (index < 3) {
        console.log(`[GDELT] Article ${index}: "${(item.title || '').slice(0, 60)}" → tone=${tone}`)
      }

      // Base importance score (will be replaced by enrichment-based scoring)
      // This is just a fallback if enrichment fails
      const importance = 30

      // Enrich: Try to infer real category for each article if category === 'all'
      let realCategory = category
      if (category === 'all') {
        // Try to match keywords in title/URL/domain to assign a more specific category
        const titleText = (item.title || '').toLowerCase()
        const domainText = (item.domain || '').toLowerCase()
        const urlText = (item.url || '').toLowerCase()

        // Score each category based on keyword matches
        const categoryScores: Record<string, number> = {
          technology: 0,
          business: 0,
          science: 0,
          health: 0,
          sports: 0,
          entertainment: 0,
          politics: 0,
        }

        // Refined keyword patterns - more specific, fewer generic words
        const categoryPatterns: Record<string, { keywords: string[], negative: string[] }> = {
          technology: {
            keywords: [
              'software', 'artificial intelligence', 'machine learning', 'programming', 'developer',
              'cybersecurity', 'encryption', 'startup', 'apple', 'google', 'microsoft', 'meta', 'tesla',
              'spacex', 'amazon', 'netflix', 'twitter', 'linkedin', 'instagram', 'tiktok', 'telegram',
              'cloud computing', 'server', 'chip', 'processor', 'semiconductor', 'virtual reality',
              'augmented reality', 'robot', 'automation', '5g', 'broadband', 'hack', 'cyberattack',
              'data breach', 'malware', 'ransomware', 'coding', 'api', 'database', 'algorithm',
              'blockchain', 'crypto', 'nft', 'web3', 'metaverse', 'chatgpt', 'openai', 'deep learning',
              'gaming', 'playstation', 'xbox', 'ps5', 'ps4', 'nintendo', 'steam', 'dlc', 'game'
            ],
            negative: ['celebrity', 'gossip', 'weight loss', 'diet', 'plane crash', 'shooting', 'murder']
          },
          business: {
            keywords: [
              'stock market', 'wall street', 'nasdaq', 'dow jones', 's&p 500', 'ip', 'ipo', 'merger',
              'acquisition', 'ceo', 'cto', 'cfo', 'venture capital', 'funding', 'investment', 'investor',
              'revenue', 'profit', 'earnings', 'dividend', 'shareholder', 'economic', 'inflation',
              'recession', 'gdp', 'monetary', 'fiscal', 'trade war', 'tariff', 'bankruptcy', 'layoff',
              'unemployment', 'corporate', 'startup', 'entrepreneur', 'finance', 'financial', 'trading',
              'commodity', 'forex', 'cryptocurrency', 'bitcoin', 'ethereum', 'market share',
              'media company', 'news network', 'broadcast', 'publisher', 'media'
            ],
            negative: ['celebrity', 'gossip', 'weight loss', 'movie', 'concert', 'sports', 'game']
          },
          science: {
            keywords: [
              'research', 'study', 'scientific', 'scientist', 'discovery', 'space', 'nasa', 'physics',
              'chemistry', 'biology', 'gene', 'genetic', 'laboratory', 'experiment', 'clinical trial',
              'climate change', 'environment', 'energy', 'renewable', 'solar', 'wind', 'battery',
              'quantum', 'particle', 'atom', 'molecule', 'nanotechnology', 'robotics', 'evolution',
              'paleontology', 'archaeology', 'astronomy', 'cosmology', 'ecology', 'carbon emission',
              'sustainable', 'materials science', 'chemistry', 'biochemistry', 'neuroscience',
              'aurora', 'northern lights', 'comet', 'sky', 'solar system', 'planet', 'star', 'galaxy'
            ],
            negative: ['politics', 'election', 'government', 'celebrity', 'stock', 'market']
          },
          health: {
            keywords: [
              'hospital', 'doctor', 'nurse', 'patient', 'clinic', 'disease', 'virus', 'bacteria',
              'infection', 'covid', 'coronavirus', 'pandemic', 'epidemic', 'outbreak', 'vaccine',
              'vaccination', 'treatment', 'therapy', 'surgery', 'drug', 'pharmaceutical', 'fda',
              'wellness', 'fitness', 'mental health', 'depression', 'anxiety', 'symptom', 'diagnosis',
              'cure', 'recovery', 'rehab', 'medical', 'medicine', 'healthcare', 'nutrition', 'exercise'
            ],
            negative: ['politics', 'election', 'stock', 'market', 'celebrity', 'gossip']
          },
          sports: {
            keywords: [
              'football', 'soccer', 'basketball', 'baseball', 'tennis', 'golf', 'hockey', 'cricket',
              'rugby', 'formula 1', 'racing', 'olympics', 'championship', 'league', 'match', 'tournament',
              'nfl', 'nba', 'mlb', 'nhl', 'ufc', 'mma', 'boxing', 'wwe', 'athlete', 'athletics',
              'world cup', 'super bowl', 'premier league', 'la liga', 'serie a', 'bundesliga', 'messi',
              'ronaldo', 'neymar', 'mbappe', 'coach', 'referee', 'score', 'goal', 'touchdown'
            ],
            negative: ['politics', 'celebrity', 'movie', 'music', 'concert']
          },
          entertainment: {
            keywords: [
              'movie', 'film', 'cinema', 'music', 'concert', 'band', 'artist', 'singer', 'actor', 'actress',
              'celebrity', 'hollywood', 'bollywood', 'streaming', 'disney+', 'hulu', 'hbo max', 'album',
              'song', 'trailer', 'youtube', 'viral', 'award', 'grammy', 'oscar', 'emmy', 'golden globe',
              'red carpet', 'premiere', 'gossip', 'cast', 'director', 'producer', 'screenplay', 'sequel',
              'marvel', 'dc', 'anime', 'manga', 'concert tour', 'album release', 'net worth', 'pregnancy',
              'breakups', 'tour', 'celebrates', 'birthday', 'wedding', 'divorce', 'relationship', 'dating'
            ],
            negative: ['politics', 'election', 'stock', 'market', 'sports', 'game']
          },
          politics: {
            keywords: [
              'election', 'vote', 'voting', 'ballot', 'poll', 'president', 'presidential', 'congress',
              'senate', 'house', 'representative', 'senator', 'governor', 'mayor', 'legislation', 'bill',
              'policy', 'diplomat', 'diplomacy', 'treaty', 'summit', 'campaign', 'candidate', 'cabinet',
              'administration', 'regulation', 'ruling', 'court', 'judge', 'justice', 'minister', 'parliament',
              'democrat', 'republican', 'liberal', 'conservative', 'partisan', 'bipartisan', 'federal'
            ],
            negative: ['celebrity', 'gossip', 'movie', 'music', 'concert', 'sports']
          },
        }

        // Calculate scores with weighted matching
        for (const [cat, patterns] of Object.entries(categoryPatterns)) {
          let score = 0

          // Check title (3x weight - most important)
          for (const keyword of patterns.keywords) {
            if (titleText.includes(keyword)) {
              score += 3
            }
          }

          // Check negative keywords in title (disqualify if present)
          for (const negKeyword of patterns.negative) {
            if (titleText.includes(negKeyword)) {
              score -= 5  // Heavy penalty for negative matches
            }
          }

          // Check domain (1x weight - less reliable)
          for (const keyword of patterns.keywords) {
            if (domainText.includes(keyword)) {
              score += 1
            }
          }

          categoryScores[cat] = Math.max(0, score)  // Don't allow negative scores
        }

        // Find category with highest score
        let maxScore = 0
        let bestCategory = 'other' // Default to 'other' if no matches
        for (const [cat, score] of Object.entries(categoryScores)) {
          if (score > maxScore) {
            maxScore = score
            bestCategory = cat
          }
        }

        // Only assign category if we have meaningful matches (score >= 2)
        // This allows articles with 1 strong keyword match (3 points from title) to be categorized
        if (maxScore < 2) {
          bestCategory = 'other'
        }

        // Debug: Log first few categorizations
        if (index < 5) {
          console.log(`[GDELT] Article "${(item.title || '').slice(0, 50)}..." → category: ${bestCategory} (scores:`, categoryScores, ')')
        }

        realCategory = bestCategory
      }
      return {
        id: `${realCategory}-${index}-${item.url || index}`,
        title: item.title || 'Untitled',
        description: null,
        url: item.url || '#',
        imageUrl: item.socialimage || null,
        publishedAt: publishedAt.toISOString(),
        source: item.domain || 'Unknown',
        category: realCategory,
        author: null,
        importance,
        views: 0,  // Will be populated by enrichment
        tone,
      }
    })
  } catch (error: any) {
    console.log(`[GDELT] Error:`, error)
    if (error instanceof Error) {
      console.log('Error message:', error.message)
      if (error.stack) console.log('Stack:', error.stack)
    }
    return []
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const category = searchParams.get('category') || 'all'
    const lang = (searchParams.get('lang') || 'en') as 'en' | 'vi'
    const sort = searchParams.get('sort') || 'relevance'
    // New: support tone and toneabs filter via query params
    const toneFilter = searchParams.get('toneFilter') || undefined // e.g. 'tone<-5' or 'tone>5'
    const toneAbsFilter = searchParams.get('toneAbsFilter') || undefined // e.g. 'toneabs>10'

    console.log(`[API] Fetching GDELT news - category: ${category}, lang: ${lang}, sort: ${sort}, tone: ${toneFilter}, toneabs: ${toneAbsFilter}`)

    // Fetch from GDELT
    const articles = await fetchFromGDELT(category, lang, sort, toneFilter, toneAbsFilter)

    // Remove duplicates by URL
    const seen = new Set<string>()
    const uniqueArticles = articles.filter(article => {
      if (seen.has(article.url)) return false
      seen.add(article.url)
      return true
    })

    const resultArticles = uniqueArticles.slice(0, 75)  // Reduce for faster processing

    // Debug: Log category distribution
    const categoryCounts = resultArticles.reduce((acc, article) => {
      acc[article.category] = (acc[article.category] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    console.log(`[API] Category distribution:`, categoryCounts)

    // Enrich with GKG and Events metadata in parallel (major speedup!)
    // Since they're independent operations, run them concurrently
    console.log(`[API] Starting parallel enrichment for ${resultArticles.length} articles...`)

    const [gkgEnriched, eventEnriched] = await Promise.all([
      enrichArticlesWithGKGOptimized(resultArticles),
      enrichArticlesWithEventsOptimized(resultArticles)
    ])

    const gkgCount = gkgEnriched.filter(a => a._gkg_enriched).length
    const eventCount = eventEnriched.filter(a => a._event_enriched).length
    console.log(`[API] Parallel enrichment complete: GKG=${gkgCount}, Events=${eventCount}`)

    // Merge both enrichment sources into single articles
    const withEnrichment = resultArticles.map(article => {
      const gkgData = gkgEnriched.find(a => a.url === article.url)?._gkg_enriched ? gkgEnriched.find(a => a.url === article.url).gkg : null
      const eventData = eventEnriched.find(a => a.url === article.url)?._event_enriched ? eventEnriched.find(a => a.url === article.url).events : null

      return {
        ...article,
        ...(gkgData && { _gkg_enriched: true, gkg: gkgData }),
        ...(eventData && { _event_enriched: true, events: eventData })
      }
    })

    // Recategorize articles using GDELT themes (more accurate than keyword matching)
    const recategorizedArticles = recategorizeArticles(withEnrichment)

    // Log recategorized distribution
    const recategorizedCounts = recategorizedArticles.reduce((acc, article) => {
      acc[article.category] = (acc[article.category] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    console.log(`[API] Category distribution after recategorization:`, recategorizedCounts)

    // Calculate impact scores (full or provisional) and REPLACE old importance field
    const withScores = recategorizedArticles.map(article => {
      const { score, provisional } = calculateProvisionalScore(article)

      // Use num_articles from events for views, otherwise estimate
      const estimatedViews = article.events?.num_articles
        ? Math.min(article.events.num_articles * 15, 5000)
        : Math.floor(Math.random() * 900) + 100

      return {
        ...article,
        importance: score,  // Replace old importance with calculated impact score
        impact_score: score,  // Also keep as impact_score for backward compatibility
        score_provisional: provisional,
        views: estimatedViews,
      }
    })

    const provisionalCount = withScores.filter(a => a.score_provisional).length
    const fullScoreCount = withScores.length - provisionalCount
    console.log(`[API] Impact scores: ${fullScoreCount} full, ${provisionalCount} provisional`)

    // Log score distribution
    const scores = withScores.map(a => a.impact_score)
    const minScore = Math.min(...scores)
    const maxScore = Math.max(...scores)
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    console.log(`[API] Score distribution: min=${minScore}, max=${maxScore}, avg=${avgScore}`)

    console.log(`[API] Returning ${withScores.length} articles`)

    return NextResponse.json({
      articles: withScores,
      cached: false,
      count: withScores.length,
      source: 'gdelt',
    })
  } catch (error) {
    console.error('[API] Error:', error)

    return NextResponse.json({
      articles: [],
      cached: false,
      count: 0,
      source: 'error',
      error: 'Failed to fetch articles',
    })
  }
}
