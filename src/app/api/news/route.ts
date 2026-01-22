import { NextRequest, NextResponse } from 'next/server'
import { enrichArticlesFromLocalGKG } from '@/lib/gdelt-enrichment-v2'
import { enrichArticlesWithEvents, calculateProvisionalScore } from '@/lib/event-enrichment-v2'

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
      maxrecords: '250',
      query: queryParts.join(' '),
      sort: SORT_PARAMS[sort] || 'HybridRel'
    })

    const url = `${GDELT_DOC_API}?${params.toString()}`
    console.log(`[GDELT] Fetching: ${url}`)

    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
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

      // Calculate importance based on multiple GDELT metrics (0-100 scale)
      let importance = 30 // Base score
      
      // Tone contribution (max +30 points): positive tone = higher importance
      if (typeof tone === 'number') {
        importance += Math.round((tone + 10) * 1.5) // -10 to +10 → 0 to 30 points
      }
      
      // Mentions/visibility contribution (max +40 points)
      if (item.seenqty) {
        const mentionScore = Math.min(item.seenqty / 10, 40) // Cap at 40 points
        importance += Math.round(mentionScore)
      }
      
      // Clamp to 0-100 range
      importance = Math.round(Math.min(100, Math.max(0, importance)))

      // Enrich: Try to infer real category for each article if category === 'all'
      let realCategory = category
      if (category === 'all') {
        // Try to match keywords in title/URL/domain to assign a more specific category
        const titleText = (item.title || '').toLowerCase()
        const domainText = (item.domain || '').toLowerCase()
        const urlText = (item.url || '').toLowerCase()
        const combinedText = `${titleText} ${domainText} ${urlText}`
        
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
        
        // Enhanced keyword patterns for better categorization
        const categoryPatterns: Record<string, string[]> = {
          technology: ['tech', 'software', 'ai', 'computer', 'digital', 'cyber', 'startup', 'app', 'data', 'code', 'programming', 'innovation', 'internet', 'web', 'mobile', 'gadget', 'device', 'phone', 'apple', 'google', 'microsoft', 'meta', 'tesla', 'spacex', 'amazon'],
          business: ['business', 'economy', 'finance', 'market', 'stock', 'trade', 'company', 'corporate', 'investment', 'bank', 'revenue', 'profit', 'entrepreneur', 'ceo', 'investor', 'wall street', 'nasdaq', 'economic', 'financial'],
          science: ['science', 'research', 'study', 'scientist', 'discovery', 'space', 'nasa', 'physics', 'chemistry', 'biology', 'climate', 'environment', 'energy', 'renewable', 'solar', 'experiment', 'laboratory'],
          health: ['health', 'medical', 'hospital', 'doctor', 'patient', 'medicine', 'disease', 'treatment', 'vaccine', 'drug', 'wellness', 'fitness', 'mental health', 'healthcare', 'pharmaceutical', 'clinic'],
          sports: ['sports', 'football', 'basketball', 'baseball', 'soccer', 'tennis', 'golf', 'olympics', 'championship', 'team', 'player', 'coach', 'game', 'match', 'tournament', 'league', 'nfl', 'nba', 'fifa'],
          entertainment: ['entertainment', 'movie', 'film', 'music', 'concert', 'actor', 'actress', 'celebrity', 'hollywood', 'netflix', 'disney', 'streaming', 'show', 'series', 'album', 'song', 'artist', 'award', 'grammy', 'oscar'],
          politics: ['politics', 'political', 'government', 'election', 'president', 'congress', 'senate', 'vote', 'law', 'policy', 'minister', 'parliament', 'democrat', 'republican', 'campaign', 'white house', 'legislation'],
        }
        
        // Calculate scores
        for (const [cat, keywords] of Object.entries(categoryPatterns)) {
          for (const keyword of keywords) {
            if (combinedText.includes(keyword)) {
              categoryScores[cat] += 1
            }
          }
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
        
        realCategory = bestCategory
      }
      return {
        id: `${realCategory}-${index}-${item.url || index}`,
        title: item.title || 'Untitled',
        description: item.seenqty ? `${item.seenqty} mentions across global media` : null,
        url: item.url || '#',
        imageUrl: item.socialimage || null,
        publishedAt: publishedAt.toISOString(),
        source: item.domain || 'Unknown',
        category: realCategory,
        author: null,
        importance,
        views: item.seenqty ? Math.min(item.seenqty * 10, 2000) : Math.floor(Math.random() * 900) + 100,
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

    const resultArticles = uniqueArticles.slice(0, 100)

    console.log(`[API] Starting enrichment for ${resultArticles.length} articles...`)
    
    // Log article date range for debugging
    const dates = resultArticles.map(a => a.seendate).filter(Boolean).sort()
    if (dates.length > 0) {
      console.log(`[API] Article date range: ${dates[0]} to ${dates[dates.length - 1]}`)
      const now = new Date()
      const oldestDate = new Date(dates[0])
      const daysOld = Math.floor((now.getTime() - oldestDate.getTime()) / (1000 * 60 * 60 * 24))
      console.log(`[API] Oldest article is ${daysOld} days old`)
    }

    // Enrich from local daily GKG DB (fast, optional)
    const gkgEnriched = await enrichArticlesFromLocalGKG(resultArticles)
    const gkgCount = gkgEnriched.filter(a => a._gkg_enriched).length
    console.log(`[API] GKG enrichment complete: ${gkgCount}/${resultArticles.length} articles enriched`)
    
    // Enrich with event-level metadata (globaleventid, goldsteinscale, avg_tone)
    const eventEnriched = await enrichArticlesWithEvents(gkgEnriched)
    const eventCount = eventEnriched.filter(a => a._event_enriched).length
    console.log(`[API] Event enrichment complete: ${eventCount}/${resultArticles.length} articles enriched`)
    
    // Calculate impact scores (full or provisional) and REPLACE old importance field
    const withScores = eventEnriched.map(article => {
      const { score, provisional } = calculateProvisionalScore(article)
      return {
        ...article,
        importance: score,  // Replace old importance with calculated impact score
        impact_score: score,  // Also keep as impact_score for backward compatibility
        score_provisional: provisional,
      }
    })
    
    // Debug: log a sample enriched article to see what data we have
    const sampleEnriched = withScores.find(a => a._gkg_enriched)
    if (sampleEnriched) {
      console.log('[API] Sample GKG enriched article:', {
        url: sampleEnriched.url?.slice(0, 60),
        gkg: sampleEnriched.gkg,
        score: sampleEnriched.impact_score
      })
    }
    
    const provisionalCount = withScores.filter(a => a.score_provisional).length
    const fullScoreCount = withScores.length - provisionalCount
    console.log(`[API] Impact scores: ${fullScoreCount} full, ${provisionalCount} provisional`)

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
