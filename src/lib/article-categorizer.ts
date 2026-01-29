/**
 * Article Categorization using GDELT Themes
 *
 * Uses GDELT's GKG thematic tagging for accurate categorization.
 * Falls back to keyword-based matching if GKG data is not available.
 *
 * GDELT Theme Reference:
 * - ECON_*: Business/Economy (STOCKS, FINANCE, BANKING, TRADE, etc.)
 * - SCI_*: Science (SPACE, MEDICAL, RESEARCH, TECH, etc.)
 * - TECH_*: Technology (COMPUTER, INTERNET, SOFTWARE, etc.)
 * - HEALTH_*: Health (DISEASE, MEDICAL, PANDEMIC, etc.)
 * - SPORTS_*: Sports (FOOTBALL, BASKETBALL, OLYMPICS, etc.)
 * - ENT_*: Entertainment (MOVIES, MUSIC, BOOKS, CELEBRITY, etc.)
 * - POLITICAL: Politics (ELECTION, GOVERNMENT, LEGISLATION, etc.)
 */

export type ArticleCategory = 'technology' | 'business' | 'science' | 'health' | 'sports' | 'entertainment' | 'politics' | 'other'

interface Article {
  url: string
  title?: string
  domain?: string
  gkg?: {
    v2_themes?: string
  }
}

// GDELT theme to category mapping
const THEME_PATTERNS: Record<string, RegExp[]> = {
  technology: [
    /TECH_/,
    /TECHNOLOGY/,
    /SCI_COMPUTER/,
    /COMPUTER/,
    /INTERNET_SOCIAL/,
    /ECOMMERCE/,
    /CYBER/,
    /APP_MOBILE/,
    /ROBOT/,
    /ART_INTELLIGENCE/,
    /BIG_DATA/,
    /CLOUD_COMPUTING/,
  ],
  business: [
    /ECON_/,
    /FINANCE/,
    /BANKING/,
    /STOCK_MARKET/,
    /TRAD_ECON/,
    /TRADE/,
    /CORP_/,
    /BUSINESS/,
    /MANUFACTURING/,
    /COMMERCIAL/,
    /STARTUP/,
    /IPO/,
    /MERGER/,
    /VENTURE_CAPITAL/,
    /MARKET/,
    /MEDIA_MSM/,
    /WB_694_BROADCAST_AND_MEDIA/,
    /MEDIA/,
  ],
  science: [
    /SCI_SPACE/,
    /SCI_RESEARCH/,
    /SCI_ENVIRON/,
    /PHYSICS/,
    /CHEMISTRY/,
    /BIOLOGY/,
    /GENETIC/,
    /CLIMATE/,
    /ENVIRONMENT/,
    /ENERGY_RENEW/,
    /ASTRONOMY/,
    /ARCHAEOLOGY/,
    /PALEONTOLOGY/,
    /ECOLOGY/,
    /QUANTUM/,
  ],
  health: [
    /HEALTH_/,
    /MEDICAL/,
    /DISEASE/,
    /PANDEMIC/,
    /VIRUS/,
    /VACCINE/,
    /DOCTOR/,
    /HOSPITAL/,
    /PHARMA/,
    /DRUG/,
    /TREATMENT/,
    /WELLNESS/,
    /MENTAL_HEALTH/,
  ],
  sports: [
    /SPORTS_/,
    /FOOTBALL/,
    /BASKETBALL/,
    /BASEBALL/,
    /SOCCER/,
    /HOCKEY/,
    /TENNIS/,
    /GOLF/,
    /OLYMPICS/,
    /RACING/,
    /BOXING/,
    /MMA/,
    /ATHLETICS/,
    /NBA/,
    /NFL/,
    /MLB/,
    /NHL/,
    /CHAMPIONSHIP/,
    /LEAGUE/,
    /TOURNAMENT/,
  ],
  entertainment: [
    /ENT_/,
    /MOVIE/,
    /MUSIC/,
    /TELEVISION/,
    /TV/,
    /MEDIA_CULT/,
    /BOOK/,
    /LITERATURE/,
    /FILM/,
    /CONCERT/,
    /AWARD/,
    /CELEBRITY/,
    /FASHION/,
    /ART_VISUAL/,
    /GAMING/,
    /TAX_FNCACT_ACTOR/,  // Actors/actresses
    /TAX_FNCACT_SINGER/,  // Singers
    /TAX_FNCACT_ARTIST/,  // Artists
  ],
  politics: [
    /ELECTION/,
    /VOTE/,
    /BALLOT/,
    /POL_PARTY/,
    /DEMOCRAT/,
    /REPUBLICAN/,
    /LEGISLATURE/,
    /CONGRESS/,
    /SENATE/,
    /PARLIAMENT/,
    /DIPLOMACY/,
    /TREATY/,
    /CAMPAIGN/,
    /CANDIDATE/,
    /OPPOSITION/,
    /IDEOLOGY/,
    /GOV_ADMIN/,
    /USPEC_POLITICS/,
  ],
}

/**
 * Categorize article based on GDELT themes (preferred method)
 * Falls back to keyword matching if no GKG data available
 */
export function categorizeArticle(article: Article): ArticleCategory {
  // Method 1: Use GDELT themes if available (most accurate)
  if (article.gkg?.v2_themes && article.gkg.v2_themes.length > 10) {
    const categoryFromThemes = categorizeByThemes(article.gkg.v2_themes)

    // Debug: Log for Fox News articles
    if (article.title?.includes('Fox News') && article.title?.includes('Digital')) {
      console.log(`[Categorizer] Fox News article: theme-based result = ${categoryFromThemes}`)
    }

    if (categoryFromThemes !== 'other') {
      return categoryFromThemes
    }
  }

  // Method 2: Fall back to keyword matching
  const keywordResult = categorizeByKeywords(article)

  // Debug: Log for Fox News articles
  if (article.title?.includes('Fox News') && article.title?.includes('Digital')) {
    console.log(`[Categorizer] Fox News article: keyword-based result = ${keywordResult}`)
  }

  return keywordResult
}

/**
 * Categorize based on GDELT v2_themes
 */
function categorizeByThemes(themes: string): ArticleCategory {
  const themeCounts: Record<ArticleCategory, number> = {
    technology: 0,
    business: 0,
    science: 0,
    health: 0,
    sports: 0,
    entertainment: 0,
    politics: 0,
    other: 0,
  }

  // Count theme matches for each category
  for (const [category, patterns] of Object.entries(THEME_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(themes)) {
        themeCounts[category as ArticleCategory]++
      }
    }
  }

  // Debug log for unexpected categorizations
  if (themeCounts.politics >= 2 && themeCounts.sports === 0 && themeCounts.business === 0) {
    console.log(`[Categorizer] Politics themes detected but counts:`, themeCounts)
  }

  // Special handling: Business themes should take priority over generic politics
  // Many media business articles have both ECON_* and POLITICAL themes
  if (themeCounts.business >= 2) {
    return 'business'
  }

  // Technology themes should also take priority
  if (themeCounts.technology >= 2) {
    return 'technology'
  }

  // Science themes take priority
  if (themeCounts.science >= 2) {
    return 'science'
  }

  // Health themes take priority
  if (themeCounts.health >= 2) {
    return 'health'
  }

  // Entertainment themes take priority
  if (themeCounts.entertainment >= 2) {
    return 'entertainment'
  }

  // Sports themes take priority
  if (themeCounts.sports >= 2) {
    return 'sports'
  }

  // Only assign politics if we have strong political indicators (2+ matches)
  // AND no other strong category
  if (themeCounts.politics >= 2) {
    // Check if other categories also have matches (indicates mixed content)
    const otherCategories = ['technology', 'business', 'science', 'health', 'sports', 'entertainment']
    const hasOtherStrongMatches = otherCategories.some(cat => themeCounts[cat as ArticleCategory] >= 1)

    if (!hasOtherStrongMatches) {
      return 'politics'
    }
  }

  // Find category with most matches (fallback)
  let maxCount = 0
  let bestCategory: ArticleCategory = 'other'

  for (const [category, count] of Object.entries(themeCounts)) {
    if (count > maxCount) {
      maxCount = count
      bestCategory = category as ArticleCategory
    }
  }

  // Only return category if we have meaningful matches
  return maxCount > 0 ? bestCategory : 'other'
}

/**
 * Categorize based on title/domain keywords (fallback method)
 */
function categorizeByKeywords(article: Article): ArticleCategory {
  const title = (article.title || '').toLowerCase()
  const domain = (article.domain || '').toLowerCase()

  // Technology keywords
  const techKeywords = [
    'software', 'artificial intelligence', 'machine learning', 'programming', 'developer',
    'cybersecurity', 'encryption', 'startup', 'apple', 'google', 'microsoft', 'meta', 'tesla',
    'spacex', 'amazon', 'netflix', 'twitter', 'linkedin', 'instagram', 'tiktok', 'telegram',
    'cloud computing', 'server', 'chip', 'processor', 'semiconductor', 'virtual reality',
    'augmented reality', 'robot', 'automation', '5g', 'broadband', 'hack', 'cyberattack',
    'data breach', 'malware', 'ransomware', 'coding', 'api', 'database', 'algorithm',
    'blockchain', 'crypto', 'nft', 'web3', 'metaverse', 'chatgpt', 'openai', 'deep learning',
    'gaming', 'playstation', 'xbox', 'ps5', 'ps4', 'nintendo', 'steam', 'dlc'
  ]

  // Business keywords
  const businessKeywords = [
    'stock market', 'wall street', 'nasdaq', 'dow jones', 's&p 500', 'ip', 'ipo', 'merger',
    'acquisition', 'ceo', 'cto', 'cfo', 'venture capital', 'funding', 'investment', 'investor',
    'revenue', 'profit', 'earnings', 'dividend', 'shareholder', 'economic', 'inflation',
    'recession', 'gdp', 'monetary', 'fiscal', 'trade war', 'tariff', 'bankruptcy', 'layoff',
    'unemployment', 'corporate', 'entrepreneur', 'finance', 'financial', 'trading',
    'media company', 'news network', 'broadcast', 'publisher', 'bank', 'wells fargo',
    'news media', 'media', 'top 10 companies', 'biggest companies', 'companies'
  ]

  // Science keywords
  const scienceKeywords = [
    'research', 'study', 'scientific', 'scientist', 'discovery', 'space', 'nasa', 'physics',
    'chemistry', 'biology', 'gene', 'genetic', 'laboratory', 'experiment', 'clinical trial',
    'climate change', 'environment', 'energy', 'renewable', 'solar', 'wind', 'battery',
    'quantum', 'particle', 'atom', 'molecule', 'nanotechnology', 'robotics', 'evolution',
    'paleontology', 'archaeology', 'astronomy', 'cosmology', 'ecology', 'carbon emission',
    'sustainable', 'biochemistry', 'neuroscience', 'aurora', 'northern lights', 'comet',
    'sky', 'solar system', 'planet', 'star', 'galaxy'
  ]

  // Health keywords
  const healthKeywords = [
    'hospital', 'doctor', 'nurse', 'patient', 'clinic', 'disease', 'virus', 'bacteria',
    'infection', 'covid', 'coronavirus', 'pandemic', 'epidemic', 'outbreak', 'vaccine',
    'vaccination', 'treatment', 'therapy', 'surgery', 'drug', 'pharmaceutical', 'fda',
    'wellness', 'fitness', 'mental health', 'depression', 'anxiety', 'symptom', 'diagnosis',
    'cure', 'recovery', 'rehab', 'medical', 'medicine', 'healthcare', 'nutrition', 'exercise'
  ]

  // Sports keywords
  const sportsKeywords = [
    'football', 'soccer', 'basketball', 'baseball', 'tennis', 'golf', 'hockey', 'cricket',
    'rugby', 'formula 1', 'racing', 'olympics', 'championship', 'league', 'match', 'tournament',
    'nfl', 'nba', 'mlb', 'nhl', 'ufc', 'mma', 'boxing', 'wwe', 'athlete', 'athletics',
    'world cup', 'super bowl', 'premier league', 'la liga', 'serie a', 'bundesliga',
    'messi', 'ronaldo', 'neymar', 'mbappe', 'coach', 'referee', 'score', 'goal', 'touchdown'
  ]

  // Sports negative keywords (words that disqualify sports category)
  const sportsNegative = [
    'news', 'anchor', 'chartbeat', 'ratings', 'digital', 'media', 'broadcast', 'journalism',
    'politics', 'election', 'government', 'congress', 'senate', 'president', 'trump', 'biden'
  ]

  // Entertainment keywords
  const entertainmentKeywords = [
    'movie', 'film', 'cinema', 'music', 'concert', 'band', 'artist', 'singer', 'actor', 'actress',
    'celebrity', 'hollywood', 'bollywood', 'streaming', 'disney+', 'hulu', 'hbo max', 'album',
    'song', 'trailer', 'youtube', 'viral', 'award', 'grammy', 'oscar', 'emmy', 'golden globe',
    'red carpet', 'premiere', 'gossip', 'cast', 'director', 'producer', 'screenplay', 'sequel',
    'marvel', 'dc', 'anime', 'manga', 'concert tour', 'album release', 'net worth', 'pregnancy',
    'breakups', 'tour', 'celebrates', 'birthday', 'wedding', 'divorce', 'relationship', 'dating',
    'kelly osbourne', 'kardashian', 'jenner', 'swift', 'bieber', 'drake', 'mile', 'taylor',
    'weight loss', 'slims', 'diet', 'body', 'look'
  ]

  // Politics keywords
  const politicsKeywords = [
    'election', 'vote', 'voting', 'ballot', 'poll', 'president', 'presidential', 'congress',
    'senate', 'house', 'representative', 'senator', 'governor', 'mayor', 'legislation', 'bill',
    'policy', 'diplomat', 'diplomacy', 'treaty', 'summit', 'campaign', 'candidate', 'cabinet',
    'administration', 'regulation', 'ruling', 'decision', 'court', 'judge', 'justice', 'minister',
    'parliament', 'democrat', 'republican', 'liberal', 'conservative', 'partisan', 'bipartisan', 'federal'
  ]

  // Negative keywords (words that disqualify a category)
  const techNegative = ['celebrity', 'gossip', 'weight loss', 'diet', 'plane crash', 'shooting', 'murder']
  const businessNegative = ['celebrity', 'gossip', 'weight loss', 'movie', 'concert', 'sports']
  const scienceNegative = ['politics', 'election', 'government', 'celebrity', 'stock', 'market']
  const healthNegative = ['politics', 'election', 'stock', 'market', 'celebrity', 'gossip']
  // sportsNegative is already defined above with comprehensive keywords
  const entertainmentNegative = ['politics', 'election', 'stock', 'market', 'sports']
  const politicsNegative = ['celebrity', 'gossip', 'movie', 'music', 'concert', 'sports']

  // Score each category (title gets 3x weight, domain gets 1x)
  function scoreCategory(keywords: string[], negative: string[]): number {
    let score = 0

    // Check title (3x weight)
    for (const keyword of keywords) {
      if (title.includes(keyword)) {
        score += 3
      }
    }

    // Check negative keywords in title (-5 penalty)
    for (const neg of negative) {
      if (title.includes(neg)) {
        score -= 5
      }
    }

    // Check domain (1x weight)
    for (const keyword of keywords) {
      if (domain.includes(keyword)) {
        score += 1
      }
    }

    return Math.max(0, score)
  }

  const scores: Record<ArticleCategory, number> = {
    technology: scoreCategory(techKeywords, techNegative),
    business: scoreCategory(businessKeywords, businessNegative),
    science: scoreCategory(scienceKeywords, scienceNegative),
    health: scoreCategory(healthKeywords, healthNegative),
    sports: scoreCategory(sportsKeywords, sportsNegative),
    entertainment: scoreCategory(entertainmentKeywords, entertainmentNegative),
    politics: scoreCategory(politicsKeywords, politicsNegative),
    other: 0,
  }

  // Find category with highest score
  let maxScore = 0
  let bestCategory: ArticleCategory = 'other'

  for (const [category, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score
      bestCategory = category as ArticleCategory
    }
  }

  // Only assign category if we have meaningful matches (score >= 1)
  // Lowered from 2 to 1 to catch more articles when themes are not available
  return maxScore >= 1 ? bestCategory : 'other'
}

/**
 * Recategorize articles after enrichment
 * This should be called after GKG enrichment is complete
 */
export function recategorizeArticles(articles: Article[]): Article[] {
  return articles.map(article => {
    const newCategory = categorizeArticle(article)

    // Debug: Log sports categorizations to understand why
    if (newCategory === 'sports' && article.category !== 'sports') {
      console.log(`[Recategorize] "${(article.title || '').slice(0, 50)}..." → ${article.category} → ${newCategory}`)
      console.log(`[Recategorize] Has GKG: ${!!article.gkg}, Has themes: ${!!article.gkg?.v2_themes}`)
    }

    // Update category if it changed (even if it's 'other')
    // This ensures articles with uncertain categorization are marked as 'other'
    if (article.category !== newCategory) {
      // Update ID and category
      return {
        ...article,
        category: newCategory,
        id: article.id.replace(/^[^-]+/, newCategory),
      }
    }

    return article
  })
}
