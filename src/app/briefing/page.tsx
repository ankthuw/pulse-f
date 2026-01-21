"use client"

import React, { useEffect, useState, useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Settings, Coffee, BookOpen, Zap, TrendingUp, RefreshCw } from "lucide-react"
import MyBriefingSettings from "@/components/my-briefing-settings"
import { loadUserProfile, getDefaultUserProfile } from "@/lib/user-profile"
import type { UserProfile } from "@/types/user-profile"
import type { NewsArticle } from "@/types/news"
import { NewsCard } from "@/components/news-card"
import { StopLineCard } from "@/components/stop-line-card"
import { FilterNegativeButton } from "@/components/filter-negative-button"
import { trackStopLineBypass, trackExplainersViewed, trackExplainerClicked } from "@/lib/analytics-utils"

// Helper: build briefing buckets
interface BriefingBuckets {
  mustRead: NewsArticle[]
  niceToKnow: NewsArticle[]
}

function buildBriefing(articles: NewsArticle[], profile: UserProfile): BriefingBuckets {
  // Filter by preferredCategories if not empty
  let filtered = profile.preferredCategories.length > 0 && !profile.preferredCategories.includes("all")
    ? articles.filter(a => profile.preferredCategories.includes(a.category))
    : articles
  // Sort by importance desc, fallback views desc
  filtered = [...filtered].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance
    return (b.views || 0) - (a.views || 0)
  })
  // Determine quota
  let totalTarget = 6
  if (profile.readingMode === "quick") {
    if (profile.dailyMinutes === 5) totalTarget = 4
    if (profile.dailyMinutes === 10) totalTarget = 6
    if (profile.dailyMinutes === 20) totalTarget = 8
  } else {
    if (profile.dailyMinutes === 5) totalTarget = 6
    if (profile.dailyMinutes === 10) totalTarget = 10
    if (profile.dailyMinutes === 20) totalTarget = 16
  }
  const mustReadCount = Math.max(2, Math.round(totalTarget / 2))
  const mustRead = filtered.slice(0, mustReadCount)
  const niceToKnow = filtered.slice(mustReadCount, totalTarget)
  return { mustRead, niceToKnow }
}

export default function BriefingPage() {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [articles, setArticles] = useState<NewsArticle[]>([])
  const [loading, setLoading] = useState(false)
  const [readArticleIds, setReadArticleIds] = useState<string[]>([])
  
  // Phase 2: Filter negative, stop line, explainers
  const [filterNegative, setFilterNegative] = useState(false)
  const [showBeyondStopLine, setShowBeyondStopLine] = useState(false)
  const [showExplainers, setShowExplainers] = useState(false)

  // Load profile and read articles on mount
  useEffect(() => {
    const loadedProfile = loadUserProfile() || getDefaultUserProfile()
    setProfile(loadedProfile)
    // Load read articles from localStorage
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem('pulse_briefing_read_articles_v1')
        if (stored) {
          const parsed = JSON.parse(stored)
          // Only keep read articles from today
          const today = new Date().toDateString()
          if (parsed.date === today) {
            setReadArticleIds(parsed.ids || [])
          } else {
            // Reset for new day
            window.localStorage.removeItem('pulse_briefing_read_articles_v1')
          }
        }
      } catch {
        // Ignore parse errors
      }
    }
  }, [])

  // Fetch news when profile changes
  useEffect(() => {
    if (!profile) return
    setLoading(true)
    const cats = profile.preferredCategories.filter(c => c !== 'all')
    // If no category or only 'all', fetch all
    if (cats.length === 0) {
      fetch(`/api/news?category=all&lang=${profile.preferredLang}&sort=relevance`)
        .then(res => res.json())
        .then(data => setArticles(data.articles || []))
        .finally(() => setLoading(false))
      return
    }
    // If only one category, fetch that
    if (cats.length === 1) {
      fetch(`/api/news?category=${cats[0]}&lang=${profile.preferredLang}&sort=relevance`)
        .then(res => res.json())
        .then(data => setArticles(data.articles || []))
        .finally(() => setLoading(false))
      return
    }
    // If multiple categories, fetch all and merge
    Promise.all(
      cats.map(cat =>
        fetch(`/api/news?category=${cat}&lang=${profile.preferredLang}&sort=relevance`)
          .then(res => res.json())
          .then(data => data.articles || []) // Don't override category, API already set it correctly
      )
    )
      .then(results => {
        // Flatten and deduplicate by url
        const merged: NewsArticle[] = []
        const seen = new Set<string>()
        for (const arr of results) {
          for (const art of arr) {
            if (!seen.has(art.url)) {
              merged.push(art)
              seen.add(art.url)
            }
          }
        }
        setArticles(merged)
      })
      .finally(() => setLoading(false))
  }, [profile])

  // Mark article as read
  function onMarkRead(id: string) {
    setReadArticleIds(prev => {
      const updated = Array.from(new Set([...prev, id]))
      // Persist to localStorage
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem('pulse_briefing_read_articles_v1', JSON.stringify({
            date: new Date().toDateString(),
            ids: updated
          }))
        } catch {
          // Ignore write errors
        }
      }
      return updated
    })
  }

  // Apply negative filter to articles (Phase 2)
  const filteredArticles = useMemo(() => {
    if (!filterNegative) return articles
    
    return articles.filter(article => {
      const tone = article.tone
      return typeof tone !== 'number' || tone >= -3
    })
  }, [articles, filterNegative])

  // Build buckets from filtered articles
  const { mustRead, niceToKnow } = buildBriefing(filteredArticles, profile || getDefaultUserProfile())
  
  // Calculate stop line position (default 8 for briefing, adjustable by profile)
  const stopLineCount = useMemo(() => {
    if (!profile) return 8
    // Quick mode: shorter stop line, Deep mode: longer
    return profile.readingMode === 'quick' ? 6 : 10
  }, [profile])
  
  // Helper to check if article is read
  const isArticleRead = (articleId: string) => readArticleIds.includes(articleId)
  
  // Smart Explainers: High-quality articles matching user preferences
  // Prioritizes user's preferred categories and ensures diversity
  const explainers = useMemo(() => {
    if (!profile) return []
    
    console.log('[Explainers] Starting search with', filteredArticles.length, 'total articles')
    console.log('[Explainers] Already read:', readArticleIds.length, 'articles')
    
    // 1. Filter for high-quality explainer candidates (unread firsdt)
    let candidates = filteredArticles.filter(a => 
      a.importance >= 70 && 
      a.views >= 200 && 
      a.views <= 1500 &&
      !isArticleRead(a.id)
    )
    
    console.log('[Explainers] Found', candidates.length, 'unread candidates (importance ≥70, views 200-1500)')
    
    // Fallback: if no unread candidates, include read articles but lower the threshold
    if (candidates.length === 0) {
      candidates = filteredArticles.filter(a => 
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
    
    // 2. Calculate smart score: importance + category match + recency
    const scored = candidates.map(article => {
      let score = article.importance
      
      // Category preference bonus: boost articles in user's preferred categories
      if (profile.preferredCategories.includes(article.category)) {
        score += 15
      }
      
      // Recency bonus: articles from last 12 hours get +5 points
      const hoursSincePublished = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60)
      if (hoursSincePublished < 12) score += 5
      
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
  }, [filteredArticles, profile, readArticleIds])
  
  // Track clicked articles
  const [clickedArticles, setClickedArticles] = useState<Map<string, number>>(new Map())
  
  // Handle article click
  const handleArticleClick = (articleId: string) => {
    console.log('[Click] Article clicked:', articleId)
    setClickedArticles(prev => new Map(prev).set(articleId, Date.now()))
  }
  
  // When page regains focus, check clicked articles and mark as read if enough time passed
  useEffect(() => {
    const handleFocus = () => {
      console.log('[Focus] Page regained focus, checking clicked articles...')
      const now = Date.now()
      const minTimeAway = 5000 // 5 seconds minimum
      let hasNewReads = false
      
      clickedArticles.forEach((clickTime, articleId) => {
        const timeAway = now - clickTime
        if (timeAway >= minTimeAway && !readArticleIds.includes(articleId)) {
          console.log(`[Read] Article ${articleId} marked as read (away ${Math.round(timeAway/1000)}s)`)
          onMarkRead(articleId)
          hasNewReads = true
        }
      })
      
      if (hasNewReads) {
        // Clear clicked articles that are now marked as read
        setClickedArticles(prev => {
          const next = new Map(prev)
          readArticleIds.forEach(id => next.delete(id))
          return next
        })
      }
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [clickedArticles, readArticleIds])
  
  const trackedReadCount = readArticleIds.length
  
  const totalTarget = mustRead.length + niceToKnow.length
  const completed = readArticleIds.length
  const progressPercent = totalTarget === 0 ? 0 : Math.round((completed / totalTarget) * 100)

  // Format time based on reading mode
  const estimatedTime = profile?.dailyMinutes || 10
  // Completion popup state
  const [showCompletePopup, setShowCompletePopup] = useState(false);
  useEffect(() => {
    if (progressPercent === 100) {
      setTimeout(() => setShowCompletePopup(true), 800);
    } else {
      setShowCompletePopup(false);
    }
  }, [progressPercent]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Hero Header (smaller, themed) */}
      <div className="relative overflow-hidden border-b border-border/50 bg-primary">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-lg bg-primary-foreground/10">
                <Coffee className="h-6 w-6 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold text-primary-foreground tracking-tight">
                My Briefing
              </h1>
            </div>
            {/* Settings Button */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="bg-background hover:bg-muted text-primary border-border"
                >
                  <Settings className="h-4 w-4 mr-1" />
                  Settings
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-96" align="end">
                <MyBriefingSettings
                  profile={profile}
                  onChange={setProfile}
                />
              </PopoverContent>
            </Popover>
          </div>
          <p className="text-primary-foreground/80 text-sm mt-2">
            Your personalized {estimatedTime}-minute daily digest
          </p>
        </div>
      </div>

      {/* Completion Popup */}
      {showCompletePopup && (
        <div className="fixed top-6 left-1/2 z-50 -translate-x-1/2 bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg flex items-center gap-3 animate-in fade-in duration-700">
          <Coffee className="h-5 w-5" />
          <span className="font-medium">Your {estimatedTime}-minute briefing is complete!</span>
          <Button 
            size="sm" 
            variant="secondary" 
            onClick={() => {
              setReadArticleIds([])
              if (typeof window !== 'undefined') {
                window.localStorage.removeItem('pulse_briefing_read_articles_v1')
              }
              window.location.reload()
            }}
            className="ml-2"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Load More
          </Button>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-10">
          {/* Filter Negative Button */}
          {!loading && articles.length > 0 && (
            <div className="flex justify-end">
              <FilterNegativeButton
                enabled={filterNegative}
                onChange={setFilterNegative}
                totalArticles={articles.length}
                filteredArticles={filteredArticles.length}
                lang={profile?.preferredLang || 'en'}
              />
            </div>
          )}

          {/* Compact Progress Bar */}
          {totalTarget > 0 && (
            <div className="bg-card/50 backdrop-blur-sm border border-border/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 text-sm">
                  <BookOpen className="h-4 w-4 text-primary" />
                  <span className="font-medium">{completed}/{totalTarget}</span>
                  <span className="text-muted-foreground hidden sm:inline">articles read</span>
                </div>
                <span className="text-xs font-semibold text-primary">{progressPercent}%</span>
              </div>
              <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-primary transition-all duration-500 ease-out rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}


        {/* Must Read Section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-red-500/10 dark:bg-red-500/20">
              <Zap className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                Must Read
              </h2>
              <p className="text-sm text-muted-foreground">
                High-priority stories you shouldn't miss • {mustRead.length} articles
              </p>
            </div>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="h-64 animate-pulse bg-muted" />
              ))}
            </div>
          ) : mustRead.length === 0 ? (
            <Card className="p-12 text-center bg-card/50 backdrop-blur-sm">
              <Coffee className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No articles found. Try adjusting your preferences or emotion filter.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {mustRead.slice(0, stopLineCount).map(article => (
                <NewsCard 
                  key={article.id}
                  article={article}
                  onClick={() => handleArticleClick(article.id)}
                  read={readArticleIds.includes(article.id)}
                />
              ))}
              
              {/* Stop Line in Must Read - only show if user has read some articles */}
              {!showBeyondStopLine && mustRead.length > stopLineCount && trackedReadCount >= 3 && (
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
              
              {showBeyondStopLine && mustRead.slice(stopLineCount).map(article => (
                <NewsCard
                  key={article.id}
                  article={article}
                  onClick={() => handleArticleClick(article.id)}
                  read={readArticleIds.includes(article.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Nice to Know Section */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-blue-500/10 dark:bg-blue-500/20">
              <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">
                Nice to Know
              </h2>
              <p className="text-sm text-muted-foreground">
                Interesting stories worth exploring
              </p>
            </div>
          </div>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="h-64 animate-pulse bg-muted" />
              ))}
            </div>
          ) : niceToKnow.length === 0 ? (
            <Card className="p-12 text-center bg-card/50 backdrop-blur-sm">
              <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">
                No additional articles available.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {niceToKnow.map(article => (
                <NewsCard
                  key={article.id}
                  article={article}
                  onClick={() => handleArticleClick(article.id)}
                  read={readArticleIds.includes(article.id)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Explainers Section (Phase 2) */}
        {showExplainers && (
          <section>
            <div className="mb-6 p-4 bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 rounded-xl shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-bold">Explainers & Deep Dives</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {explainers.length > 0 
                  ? `High-quality articles selected for deeper understanding • ${explainers.length} articles`
                  : 'Looking for quality explainer content...'}
              </p>
            </div>
            {explainers.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {explainers.map(article => (
                  <div 
                    key={article.id} 
                    className="relative"
                  >
                    <div className="absolute -top-2 -right-2 z-10">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-primary text-primary-foreground shadow-md">
                        Explainer
                      </span>
                    </div>
                    <NewsCard
                      article={article}
                      onClick={() => {
                        handleArticleClick(article.id)
                        trackExplainerClicked(article.id)
                      }}
                      read={readArticleIds.includes(article.id)}
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
                  Check back after the next news refresh or try different category preferences.
                </p>
              </Card>
            )}
          </section>
        )}
        </div>
      </main>
    </div>
  )
}
