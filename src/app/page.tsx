'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RefreshCw, HelpCircle, Newspaper, Filter, X, ChevronDown, Flame, Zap, ArrowUpRight, TrendingUp, Activity, Clock, BookOpen } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { NewsCard } from '@/components/news-card'
import { StopLineCard } from '@/components/stop-line-card'
import { FilterAndSortBar, ApiSortOption, ClientSortOption, FilterState } from '@/components/filter-sort-bar'
import { GoogleTranslateScript, TranslateToggle } from '@/components/google-translate-widget'
import { FilterNegativeButton } from '@/components/filter-negative-button'
import { NewsArticle } from '@/types/news'
import { getImpactBadge } from '@/lib/news-utils'
import { trackStopLineBypass, trackExplainersViewed, trackExplainerClicked, getAnalyticsSummary } from '@/lib/analytics-utils'

const STOP_LINE_COUNT = 12

const CATEGORIES = [
  { id: 'all', label: 'All News', icon: Newspaper },
  { id: 'technology', label: 'Technology', icon: Zap },
  { id: 'business', label: 'Business', icon: TrendingUp },
  { id: 'science', label: 'Science', icon: Activity },
  { id: 'health', label: 'Health', icon: Activity },
  { id: 'sports', label: 'Sports', icon: Activity },
  { id: 'entertainment', label: 'Entertainment', icon: Activity },
  { id: 'politics', label: 'Politics', icon: Activity },
]

export default function NewsPage() {
  // Stop line state
  const [showBeyondStopLine, setShowBeyondStopLine] = useState(false)
  const [showExplainers, setShowExplainers] = useState(false)
  // Filter negative content
  const [filterNegative, setFilterNegative] = useState(false)
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState<0 | 60 | 300 | 900>(0) // 0=off, 60=1m, 300=5m, 900=15m
  const [nextRefreshTime, setNextRefreshTime] = useState<Date | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  // Filter and sort state
  const [apiSort, setApiSort] = useState<ApiSortOption>('relevance')
  const [clientSort, setClientSort] = useState<ClientSortOption>('none')
  const [filters, setFilters] = useState<FilterState>({
    impactLevel: 'all',
    trendingLevel: 'all',
    timeRange: 'all',
    minViews: 0,
    sources: [],
  })

  const fetchNews = async (showRefreshToast = true, forceRefresh = false) => {
    if (showRefreshToast) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    try {
      const refreshParam = forceRefresh ? '&refresh=true' : ''
      const response = await fetch(`/api/news?category=${selectedCategory}&sort=${apiSort}${refreshParam}`)
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
      console.error('Error fetching news:', error)
      toast({
        title: 'Error',
        description: 'Failed to load news. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchNews(false)
  }, [selectedCategory, apiSort])

  // Log analytics summary on mount (for debugging)
  useEffect(() => {
    console.log(getAnalyticsSummary())
  }, [])

  const handleRefresh = () => {
    fetchNews(true, true)
  }

  // Auto-refresh functionality
  useEffect(() => {
    // Clear existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (autoRefreshInterval > 0) {
      const intervalMs = autoRefreshInterval * 1000
      // Set initial next refresh time
      const nextRefresh = new Date(Date.now() + intervalMs)
      setNextRefreshTime(nextRefresh)

      // Set up interval
      intervalRef.current = setInterval(() => {
        fetchNews(false) // Refresh without toast
        // Update next refresh time
        setNextRefreshTime(new Date(Date.now() + intervalMs))
      }, intervalMs)

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    } else {
      setNextRefreshTime(null)
    }
  }, [autoRefreshInterval, selectedCategory, apiSort])

  // Countdown timer for next refresh (updates every second)
  useEffect(() => {
    if (autoRefreshInterval === 0 || !nextRefreshTime) return

    const timer = setInterval(() => {
      setNextRefreshTime(prev => {
        if (!prev) return null
        const now = Date.now()
        const intervalMs = autoRefreshInterval * 1000
        if (prev.getTime() <= now) {
          return new Date(now + intervalMs)
        }
        return prev
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [autoRefreshInterval, nextRefreshTime])

  // Calculate remaining seconds for display
  const remainingSeconds = nextRefreshTime
    ? Math.max(0, Math.ceil((nextRefreshTime.getTime() - Date.now()) / 1000))
    : 0

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))

    if (diffHours < 1) return 'Just now'
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffHours < 48) return 'Yesterday'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Store total articles before filtering for filter button
  const totalBeforeEmotionFilter = useMemo(() => {
    return selectedCategory === 'all'
      ? articles.length
      : articles.filter(article => article.category.toLowerCase() === selectedCategory.toLowerCase()).length
  }, [articles, selectedCategory])

  // Apply filters and client-side sorting, including negative filter
  const processedArticles = useMemo(() => {
    let filtered = selectedCategory === 'all'
      ? [...articles]
      : articles.filter(article => article.category.toLowerCase() === selectedCategory.toLowerCase())

    // Filter negative content (tone < -3)
    if (filterNegative) {
      filtered = filtered.filter(article => {
        const tone = article.tone
        return typeof tone !== 'number' || tone >= -3
      })
    }

    // Apply impact level filter
    if (filters.impactLevel !== 'all') {
      filtered = filtered.filter(article => {
        const impact = getImpactBadge(article.importance)
        if (filters.impactLevel === 'critical') return impact.level === 'critical'
        if (filters.impactLevel === 'high') return impact.level === 'critical' || impact.level === 'high'
        if (filters.impactLevel === 'medium') return impact.level === 'critical' || impact.level === 'high' || impact.level === 'medium'
        if (filters.impactLevel === 'low') return true // low+ means everything
        return true
      })
    }

    // Apply trending level filter
    if (filters.trendingLevel !== 'all') {
      const trendingConfig = { viral: 800, hot: 500, trending: 300, rising: 150 }
      const minViews = trendingConfig[filters.trendingLevel as keyof typeof trendingConfig]
      if (minViews) {
        filtered = filtered.filter(article => article.views >= minViews)
      }
    }

    // Apply time range filter
    if (filters.timeRange !== 'all') {
      const hoursMap = { '24h': 24, week: 168, month: 720 }
      const hours = hoursMap[filters.timeRange as keyof typeof hoursMap]
      if (hours) {
        const cutoff = Date.now() - (hours * 60 * 60 * 1000)
        filtered = filtered.filter(article => new Date(article.publishedAt).getTime() > cutoff)
      }
    }

    // Apply minimum views filter
    if (filters.minViews > 0) {
      filtered = filtered.filter(article => article.views >= filters.minViews)
    }

    // Apply source filter
    if (filters.sources.length > 0) {
      filtered = filtered.filter(article => filters.sources.includes(article.source))
    }

    // Apply client-side sorting - create a new array to avoid mutation
    if (clientSort === 'none') {
      return filtered
    }

    return [...filtered].sort((a, b) => {
      switch (clientSort) {
        case 'impact-desc':
          return b.importance - a.importance
        case 'impact-asc':
          return a.importance - b.importance
        case 'source-asc':
          return a.source.localeCompare(b.source)
        case 'source-desc':
          return b.source.localeCompare(a.source)
        default:
          return 0
      }
    })
  }, [articles, selectedCategory, filters, clientSort, filterNegative])

  // Track read articles based on clicks (not visibility)
  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(new Set())
  const [clickedArticles, setClickedArticles] = useState<Map<string, number>>(new Map()) // articleId -> timestamp
  
  // Load read articles from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('pulse_read_articles_v1')
        if (stored) {
          const parsed = JSON.parse(stored)
          const today = new Date().toDateString()
          // Only keep read articles from today
          if (parsed.date === today) {
            setReadArticleIds(new Set(parsed.ids || []))
          } else {
            // Clear old data
            localStorage.removeItem('pulse_read_articles_v1')
          }
        }
      } catch (e) {
        console.error('Failed to load read articles:', e)
      }
    }
  }, [])
  
  // Handle article click - track the timestamp
  const handleArticleClick = (articleId: string) => {
    console.log('[Click] Article clicked:', articleId)
    setClickedArticles(prev => new Map(prev).set(articleId, Date.now()))
  }
  
  // When page regains focus, check clicked articles and mark as read if enough time passed
  useEffect(() => {
    const handleFocus = () => {
      console.log('[Focus] Page regained focus, checking clicked articles...')
      const now = Date.now()
      const minTimeAway = 5000 // 5 seconds minimum on article page
      const newReadArticles = new Set(readArticleIds)
      let hasNewReads = false
      
      clickedArticles.forEach((clickTime, articleId) => {
        const timeAway = now - clickTime
        if (timeAway >= minTimeAway && !readArticleIds.has(articleId)) {
          console.log(`[Read] Article ${articleId} marked as read (away ${Math.round(timeAway/1000)}s)`)
          newReadArticles.add(articleId)
          hasNewReads = true
        }
      })
      
      if (hasNewReads) {
        setReadArticleIds(newReadArticles)
        // Save to localStorage
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('pulse_read_articles_v1', JSON.stringify({
              date: new Date().toDateString(),
              ids: Array.from(newReadArticles)
            }))
          } catch (e) {
            console.error('Failed to save read articles:', e)
          }
        }
        // Clear clicked articles that are now marked as read
        setClickedArticles(prev => {
          const next = new Map(prev)
          newReadArticles.forEach(id => next.delete(id))
          return next
        })
      }
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [clickedArticles, readArticleIds])
  
  const trackedReadCount = readArticleIds.size
  const isArticleRead = (articleId: string) => readArticleIds.has(articleId)

  // Smart Explainers: High-quality, unread articles with diverse sources
  // Prioritizes user's selected category and ensures variety
  const explainers = useMemo(() => {
    console.log('[Explainers] Starting search with', processedArticles.length, 'total articles')
    console.log('[Explainers] Already read:', readArticleIds.size, 'articles')
    console.log('[Explainers] Current category:', selectedCategory)
    
    // 1. Filter for high-quality explainer candidates (unread first)
    let candidates = processedArticles.filter(a => 
      a.importance >= 70 && 
      a.views >= 200 && 
      a.views <= 1500 &&
      !isArticleRead(a.id)
    )
    
    console.log('[Explainers] Found', candidates.length, 'unread candidates (importance ≥70, views 200-1500)')
    
    // Fallback: if no unread candidates, include read articles but lower the threshold
    if (candidates.length === 0) {
      candidates = processedArticles.filter(a => 
        a.importance >= 65 && 
        a.views >= 100 && 
        a.views <= 2000
      )
      console.log('[Explainers] Fallback: Found', candidates.length, 'candidates (relaxed criteria: importance ≥65, views 100-2000)')
    }
    
    if (candidates.length === 0) {
      console.log('[Explainers] No candidates found even with relaxed criteria')
      return []
    }
    
    // 2. Calculate smart score: importance + recency bonus + category match
    const scored = candidates.map(article => {
      let score = article.importance
      
      // Recency bonus: articles from last 12 hours get +5 points
      const hoursSincePublished = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60)
      if (hoursSincePublished < 12) score += 5
      
      // Category match bonus: if viewing specific category, boost matching articles
      if (selectedCategory !== 'all' && article.category === selectedCategory) {
        score += 10
      }
      
      return { article, score }
    })
    
    // 3. Sort by score and ensure source diversity
    const sorted = scored.sort((a, b) => b.score - a.score)
    const diversified: typeof scored = []
    const usedDomains = new Set<string>()
    
    // First pass: pick top articles with unique domains
    for (const item of sorted) {
      const domain = item.article.source.replace('www.', '')
      if (!usedDomains.has(domain) && diversified.length < 5) {
        diversified.push(item)
        usedDomains.add(domain)
      }
    }
    
    // Second pass: fill remaining slots if needed
    if (diversified.length < 5) {
      for (const item of sorted) {
        if (!diversified.includes(item) && diversified.length < 5) {
          diversified.push(item)
        }
      }
    }
    
    const result = diversified.map(item => item.article)
    console.log('[Explainers] Selected', result.length, 'articles with source diversity')
    result.forEach((a, i) => console.log(`  ${i+1}. [${a.source}] ${a.title.substring(0, 60)}... (importance: ${a.importance})`))
    return result
  }, [processedArticles, readArticleIds, selectedCategory])

  const ImpactBadge = ({ label, bg, text, border, icon: Icon }: any) => (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${bg} ${text} ${border} border shadow-sm`}>
      <Icon className="h-3 w-3.5" />
      <span className="text-xs font-semibold tracking-wide">{label}</span>
    </div>
  )

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <GoogleTranslateScript pageLang="en" />
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-primary rounded-xl flex items-center justify-center shadow-sm">
                  <Newspaper className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                    Pulse
                  </h1>
                  <p className="text-xs text-muted-foreground font-medium">Real-time news intelligence</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                asChild
                variant="outline"
                size="sm"
                className="h-9 px-3 font-medium"
              >
                <a href="/vi" className="flex items-center gap-1.5">
                  🇻🇳 Tiếng Việt
                </a>
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full hover:bg-muted">
                    <HelpCircle className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72" side="bottom" align="end">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-foreground text-sm">Understanding Insights</h3>
                      <p className="text-xs text-muted-foreground">How we analyze news impact</p>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                        <span className="text-muted-foreground">Critical: Major breaking news</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                        <span className="text-muted-foreground">High: Important stories</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-yellow-500 shrink-0" />
                        <span className="text-muted-foreground">Medium: Noteworthy articles</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-muted-foreground">Low: General interest</span>
                      </div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>

              {/* Auto-refresh dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={autoRefreshInterval > 0 ? 'default' : 'outline'}
                    size="sm"
                    className={`h-9 px-3 font-medium gap-1.5 ${
                      autoRefreshInterval > 0 ? 'bg-green-600 hover:bg-green-700 text-white' : ''
                    }`}
                  >
                    <Clock className={`h-3.5 w-3.5 ${autoRefreshInterval > 0 ? 'animate-pulse' : ''}`} />
                    {autoRefreshInterval > 0 ? (
                      <span className="tabular-nums font-medium">{remainingSeconds}s</span>
                    ) : (
                      'Auto'
                    )}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-1" align="end">
                  <div className="space-y-0.5">
                    {[
                      { value: 0, label: 'Off' },
                      { value: 60, label: '1 min' },
                      { value: 300, label: '5 mins' },
                      { value: 900, label: '15 mins' },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => setAutoRefreshInterval(option.value as 0 | 60 | 300 | 900)}
                        className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-medium transition-colors ${
                          autoRefreshInterval === option.value
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted text-foreground'
                        }`}
                      >
                        <span>{option.label}</span>
                        {autoRefreshInterval === option.value && autoRefreshInterval > 0 && (
                          <span className="tabular-nums text-[10px] opacity-70">{remainingSeconds}s</span>
                        )}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                onClick={handleRefresh}
                disabled={refreshing || loading}
                size="sm"
                className="h-9 px-3 bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm hover:shadow-md transition-all text-sm"
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'Updating' : 'Refresh'}
              </Button>
            </div>
          </div>

          {lastUpdated && (
            <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
            </div>
          )}
        </div>

        {/* Category Tabs */}
        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="w-full">
          <TabsList className="mb-6 w-full max-w-full overflow-x-auto overflow-y-hidden h-auto p-1 bg-card/50 backdrop-blur-sm border border-border/50 shadow-sm rounded-xl scrollbar-hide snap-x snap-mandatory">
            {CATEGORIES.map((category) => {
              const Icon = category.icon
              return (
                <TabsTrigger
                  key={category.id}
                  value={category.id}
                  className="relative whitespace-nowrap px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm transition-all text-xs sm:text-sm snap-start !flex-none"
                  style={{ minWidth: 'auto', flex: '0 0 auto' }}
                >
                  <Icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 mr-0.5 sm:mr-1.5 flex-shrink-0" />
                  <span className="hidden sm:inline">{category.label}</span>
                  <span className="sm:hidden text-xs">{category.label.replace(' News', '')}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>

          <TabsContent value={selectedCategory} className="mt-0 focus-visible:outline-none focus-visible:ring-0">
            {/* Filter and Sort Bar + Filter Negative Button */}
            {!loading && articles.length > 0 && (
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
                <FilterAndSortBar
                  articles={articles}
                  filters={filters}
                  setFilters={setFilters}
                  apiSort={apiSort}
                  setApiSort={setApiSort}
                  clientSort={clientSort}
                  setClientSort={setClientSort}
                  loading={loading}
                  lang="en"
                />
                <FilterNegativeButton
                  enabled={filterNegative}
                  onChange={setFilterNegative}
                  totalArticles={totalBeforeEmotionFilter}
                  filteredArticles={processedArticles.length}
                  lang="en"
                />
              </div>
            )}

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <Card key={i} className="overflow-hidden border border-border/50">
                    <Skeleton className="h-44 w-full" />
                    <CardContent className="p-4">
                      <Skeleton className="h-4 w-3/4 mb-2" />
                      <Skeleton className="h-3 w-full mb-1" />
                      <Skeleton className="h-3 w-2/3" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : processedArticles.length === 0 ? (
              <Card className="border-dashed border-border/50 bg-card/50 backdrop-blur-sm">
                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="relative mb-5">
                    <div className="absolute inset-0 bg-primary/10 blur-2xl rounded-full" />
                    <Filter className="relative h-12 w-12 text-muted-foreground/50" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No articles match your filters
                  </h3>
                  <p className="text-muted-foreground mb-5 max-w-md text-sm">
                    Try adjusting your filters to see more articles.
                  </p>
                  <div className="flex gap-2">
                    <Button onClick={handleRefresh} size="sm" variant="outline" className="gap-2">
                      <RefreshCw className="h-3.5 w-3.5" />
                      Refresh
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Feed with StopLineCard and Explainers logic */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {processedArticles.slice(0, STOP_LINE_COUNT).map((article) => (
                    <NewsCard
                      key={article.id}
                      article={{ ...article, relativeDate: formatDate(article.publishedAt) }}
                      lang="en"
                      onClick={() => handleArticleClick(article.id)}
                      read={isArticleRead(article.id)}
                    />
                  ))}
                  {/* StopLineCard - only show if user has actually read some articles */}
                  {!showBeyondStopLine && processedArticles.length > STOP_LINE_COUNT && trackedReadCount >= 3 && (
                    <div className="col-span-full">
                      <StopLineCard
                        readCount={trackedReadCount}
                        onContinue={() => {
                          setShowBeyondStopLine(true)
                          trackStopLineBypass()
                        }}
                        onShowExplainers={() => {
                          setShowExplainers(true)
                          trackExplainersViewed()
                        }}
                      />
                    </div>
                  )}
                  {/* Show rest of feed if user continues */}
                  {showBeyondStopLine && processedArticles.slice(STOP_LINE_COUNT).map((article) => (
                    <NewsCard
                      key={article.id}
                      article={{ ...article, relativeDate: formatDate(article.publishedAt) }}
                      lang="en"
                      onClick={() => handleArticleClick(article.id)}
                      read={isArticleRead(article.id)}
                    />
                  ))}
                </div>
                {/* Explainers section */}
                {showExplainers && (
                  <div className="mt-10">
                    <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 rounded-xl shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <BookOpen className="h-5 w-5 text-primary" />
                        <h2 className="text-xl font-bold">Explainers & Deep Dives</h2>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {explainers.length > 0 
                          ? `High-quality articles selected for deeper understanding • ${explainers.length} articles`
                          : 'No explainers available for current filters. Try adjusting your filters or category.'}
                      </p>
                    </div>
                    {explainers.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                        {explainers.map(article => (
                          <div 
                            key={article.id} 
                            className="relative"
                            onClick={() => trackExplainerClicked(article.id)}
                          >
                            <div className="absolute -top-2 -right-2 z-10">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground shadow-md">
                                Explainer
                              </span>
                            </div>
                            <NewsCard
                              article={{ ...article, relativeDate: formatDate(article.publishedAt) }}
                              lang="en"
                              onClick={() => {
                                handleArticleClick(article.id)
                                trackExplainerClicked(article.id)
                              }}
                              read={isArticleRead(article.id)}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Card className="p-8 text-center bg-card/50 backdrop-blur-sm">
                        <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground mb-2">
                          No high-quality explainers available right now.
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Check back after the next news refresh.
                        </p>
                      </Card>
                    )}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="relative mt-auto border-t border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-center sm:text-left">
              <p className="font-semibold text-foreground text-sm">Pulse</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Real-time news intelligence powered by GDELT-inspired analytics
              </p>
            </div>
            <div className="flex items-center gap-3">
              <TranslateToggle currentLang="en" />
              <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                <span>Built with Next.js & shadcn/ui</span>
                <span>•</span>
                <span>© 2025</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
