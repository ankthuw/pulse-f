'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { SlidersHorizontal, Filter, X, ChevronDown, Flame, Activity, Eye, Clock, Newspaper, TrendingUp, Zap, ArrowUpRight, ArrowUpDown, TrendingDown } from 'lucide-react'
import { useMemo } from 'react'
import { getImpactBadge } from '@/lib/news-utils'
import { NewsArticle } from '@/types/news'

type ApiSortOption = 'relevance' | 'date-desc' | 'date-asc' | 'volume-desc' | 'volume-asc'
type ClientSortOption = 'none' | 'source-asc' | 'source-desc' | 'impact-asc' | 'impact-desc'
type ImpactLevel = 'all' | 'critical' | 'high' | 'medium' | 'low'
type TrendingLevel = 'all' | 'viral' | 'hot' | 'trending' | 'rising'
type TimeRange = 'all' | '24h' | 'week' | 'month'

interface FilterState {
  impactLevel: ImpactLevel
  trendingLevel: TrendingLevel
  timeRange: TimeRange
  minViews: number
  sources: string[]
}

interface FilterAndSortBarProps {
  articles: NewsArticle[]
  filters: FilterState
  setFilters: (filters: FilterState) => void
  apiSort: ApiSortOption
  setApiSort: (sort: ApiSortOption) => void
  clientSort: ClientSortOption
  setClientSort: (sort: ClientSortOption) => void
  loading: boolean
  lang: 'en' | 'vi'
}

// Language strings
const STRINGS = {
  en: {
    filters: 'Filters',
    resetAll: 'Reset all',
    impactLevel: 'Impact Level',
    trendingLevel: 'Trending',
    timeRange: 'Time Range',
    sources: 'Sources',
    showResults: 'Show Results',
    apiSort: 'API Sort (Re-fetch)',
    localSort: 'Local Sort (No re-fetch)',
    relevance: 'Relevance',
    mostMentioned: 'Most Mentioned',
    leastMentioned: 'Least Mentioned',
    newest: 'Newest',
    oldest: 'Oldest',
    none: 'None',
    sourceAZ: 'Source (A-Z)',
    sourceZA: 'Source (Z-A)',
    impactHighLow: 'Impact (High - Low)',
    impactLowHigh: 'Impact (Low - High)',
    gdeltRelevance: 'GDELT relevance score',
    byVolume: 'By GDELT volume',
    newestFirst: 'Newest articles first',
    oldestFirst: 'Oldest articles first',
    useApiOrder: 'Use API order only',
    bySourceName: 'Sort by source name',
    byCalculatedImpact: 'By calculated impact',
    showing: 'Showing',
    of: 'of',
    articles: 'articles',
    allLevels: 'All',
    criticalOnly: 'Critical (80+)',
    highCritical: 'High (60+)',
    mediumPlus: 'Medium (40+)',
    lowPlus: 'All Articles',
    all: 'All',
    viralOnly: 'Viral (800+)',
    hotPlus: 'Hot (500+)',
    trendingPlus: 'Trending (300+)',
    risingPlus: 'Rising (150+)',
    allTime: 'All Time',
    last24h: 'Last 24h',
    thisWeek: 'This Week',
    thisMonth: 'This Month',
    source: 'source',
    impact: 'Impact',
  },
  vi: {
    filters: 'Bộ lọc',
    resetAll: 'Đặt lại',
    impactLevel: 'Mức độ',
    trendingLevel: 'Xu hướng',
    timeRange: 'Thời gian',
    sources: 'Nguồn',
    showResults: 'Hiển thị',
    apiSort: 'Sắp xếp API (Tải lại)',
    localSort: 'Sắp xếp nội bộ',
    relevance: 'Liên quan',
    mostMentioned: 'Nhiều nhất',
    leastMentioned: 'Ít nhất',
    newest: 'Mới nhất',
    oldest: 'Cũ nhất',
    none: 'Không',
    sourceAZ: 'Nguồn (A-Z)',
    sourceZA: 'Nguồn (Z-A)',
    impactHighLow: 'Mức độ (Cao - Thấp)',
    impactLowHigh: 'Mức độ (Thấp - Cao)',
    gdeltRelevance: 'Điểm liên quan GDELT',
    byVolume: 'Theo lượt nhắc',
    newestFirst: 'Bài mới nhất trước',
    oldestFirst: 'Bài cũ nhất trước',
    useApiOrder: 'Dùng thứ tự API',
    bySourceName: 'Theo tên nguồn',
    byCalculatedImpact: 'Theo mức độ',
    showing: 'Đang hiển thị',
    of: 'của',
    articles: 'bài viết',
    allLevels: 'Tất cả',
    criticalOnly: 'Quan trọng (80+)',
    highCritical: 'Cao (60+)',
    mediumPlus: 'Trung bình (40+)',
    lowPlus: 'Tất cả',
    all: 'Tất cả',
    viralOnly: 'Viral (800+)',
    hotPlus: 'Hot (500+)',
    trendingPlus: 'Xu hướng (300+)',
    risingPlus: 'Đang lên (150+)',
    allTime: 'Mọi lúc',
    last24h: '24h qua',
    thisWeek: 'Tuần này',
    thisMonth: 'Tháng này',
    source: 'Nguồn',
    impact: 'Mức độ',
  },
} as const

// API sort options (affects data fetching)
const API_SORT_OPTIONS = [
  { value: 'relevance' as const, label: 'relevance', icon: Flame, description: 'gdeltRelevance' },
  { value: 'date-desc' as const, label: 'newest', icon: Clock, description: 'newestFirst' },
  { value: 'date-asc' as const, label: 'oldest', icon: Clock, description: 'oldestFirst' },
  { value: 'volume-desc' as const, label: 'mostMentioned', icon: Eye, description: 'byVolume' },
  { value: 'volume-asc' as const, label: 'leastMentioned', icon: Eye, description: 'byVolume' },
]

// Client sort options (re-orders fetched data)
const CLIENT_SORT_OPTIONS = [
  { value: 'none' as const, label: 'none', icon: Activity, description: 'useApiOrder' },
  { value: 'source-asc' as const, label: 'sourceAZ', icon: Newspaper, description: 'bySourceName' },
  { value: 'source-desc' as const, label: 'sourceZA', icon: Newspaper, description: 'bySourceName' },
  { value: 'impact-desc' as const, label: 'impactHighLow', icon: TrendingDown, description: 'byCalculatedImpact' },
  { value: 'impact-asc' as const, label: 'impactLowHigh', icon: TrendingUp, description: 'byCalculatedImpact' },

]

const IMPACT_LEVELS = [
  { value: 'all' as const, label: 'allLevels', color: 'bg-muted' },
  { value: 'critical' as const, label: 'criticalOnly', color: 'bg-red-500/20 text-red-700 dark:text-red-400' },
  { value: 'high' as const, label: 'highCritical', color: 'bg-orange-500/20 text-orange-700 dark:text-orange-400' },
  { value: 'medium' as const, label: 'mediumPlus', color: 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' },
  { value: 'low' as const, label: 'lowPlus', color: 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-400' },
]

const TRENDING_LEVELS = [
  { value: 'all' as const, label: 'all', minViews: 0 },
  { value: 'viral' as const, label: 'viralOnly', minViews: 800 },
  { value: 'hot' as const, label: 'hotPlus', minViews: 500 },
  { value: 'trending' as const, label: 'trendingPlus', minViews: 300 },
  { value: 'rising' as const, label: 'risingPlus', minViews: 150 },
]

const TIME_RANGES = [
  { value: 'all' as const, label: 'allTime', hours: 0 },
  { value: '24h' as const, label: 'last24h', hours: 24 },
  { value: 'week' as const, label: 'thisWeek', hours: 168 },
  { value: 'month' as const, label: 'thisMonth', hours: 720 },
]

export function FilterAndSortBar({
  articles,
  filters,
  setFilters,
  apiSort,
  setApiSort,
  clientSort,
  setClientSort,
  loading,
  lang,
}: FilterAndSortBarProps) {
  const t = STRINGS[lang]

  // Get available sources from articles
  const availableSources = useMemo(() => {
    const sources = new Set(articles.map(a => a.source))
    return Array.from(sources).sort()
  }, [articles])

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.impactLevel !== 'all') count++
    if (filters.trendingLevel !== 'all') count++
    if (filters.timeRange !== 'all') count++
    if (filters.minViews > 0) count++
    if (filters.sources.length > 0) count++
    return count
  }, [filters])

  // Reset filters
  const resetFilters = () => {
    setFilters({
      impactLevel: 'all',
      trendingLevel: 'all',
      timeRange: 'all',
      minViews: 0,
      sources: [],
    })
  }

  return (
    <div className="mb-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {/* API Sort Dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={loading}>
              <Flame className="h-3.5 w-3.5 text-primary" />
              {t[API_SORT_OPTIONS.find(s => s.value === apiSort)!.label]}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <div className="p-2 pb-1 border-b border-border/50">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t.apiSort}</p>
            </div>
            <div className="p-1.5 pt-1 space-y-0.5">
              {API_SORT_OPTIONS.map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.value}
                    onClick={() => setApiSort(option.value)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors text-left ${
                      apiSort === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{t[option.label]}</div>
                      <div className="text-[10px] opacity-70 truncate">{t[option.description]}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Client Sort Dropdown */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={loading}>
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
              {t[CLIENT_SORT_OPTIONS.find(s => s.value === clientSort)!.label]}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-0" align="start">
            <div className="p-2 pb-1 border-b border-border/50">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t.localSort}</p>
            </div>
            <div className="p-1.5 pt-1 space-y-0.5">
              {CLIENT_SORT_OPTIONS.map((option) => {
                const Icon = option.icon
                return (
                  <button
                    key={option.value}
                    onClick={() => setClientSort(option.value)}
                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-xs transition-colors text-left ${
                      clientSort === option.value
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-foreground'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{t[option.label]}</div>
                      <div className="text-[10px] opacity-70 truncate">{t[option.description]}</div>
                    </div>
                  </button>
                )
              })}
            </div>
          </PopoverContent>
        </Popover>

        {/* Filter Button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs relative" disabled={loading}>
              <Filter className="h-3.5 w-3.5" />
              {t.filters}
              {activeFilterCount > 0 && (
                <Badge className="h-4 px-1 text-[10px] min-w-[16px] flex items-center justify-center bg-primary text-primary-foreground">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-4" align="start" side="bottom">
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{t.filters}</h3>
                {activeFilterCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetFilters}
                    className="h-7 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {t.resetAll}
                  </Button>
                )}
              </div>

              {/* Impact Level Filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t.impactLevel}</label>
                <div className="flex flex-wrap gap-1.5">
                  {IMPACT_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      onClick={() => setFilters({ ...filters, impactLevel: level.value })}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        filters.impactLevel === level.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {t[level.label]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Trending Level Filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t.trendingLevel}</label>
                <div className="flex flex-wrap gap-1.5">
                  {TRENDING_LEVELS.map((level) => (
                    <button
                      key={level.value}
                      onClick={() => setFilters({ ...filters, trendingLevel: level.value })}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        filters.trendingLevel === level.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {t[level.label]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Range Filter */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">{t.timeRange}</label>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_RANGES.map((range) => (
                    <button
                      key={range.value}
                      onClick={() => setFilters({ ...filters, timeRange: range.value })}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        filters.timeRange === range.value
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {t[range.label]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Source Filter */}
              {availableSources.length > 0 && (
                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">{t.sources}</label>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                    {availableSources.map((source) => (
                      <button
                        key={source}
                        onClick={() => {
                          setFilters({
                            ...filters,
                            sources: filters.sources.includes(source)
                              ? filters.sources.filter((s) => s !== source)
                              : [...filters.sources, source]
                          })
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                          filters.sources.includes(source)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        }`}
                      >
                        {source}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Active Filters Display */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {filters.impactLevel !== 'all' && (
              <Badge variant="secondary" className="h-6 gap-1 text-xs">
                {t.impact}: {t[IMPACT_LEVELS.find(l => l.value === filters.impactLevel)!.label]}
                <X className="h-3 w-3 cursor-pointer hover:text-foreground" onClick={() => setFilters({ ...filters, impactLevel: 'all' })} />
              </Badge>
            )}
            {filters.trendingLevel !== 'all' && (
              <Badge variant="secondary" className="h-6 gap-1 text-xs">
                {t[TRENDING_LEVELS.find(l => l.value === filters.trendingLevel)!.label]}
                <X className="h-3 w-3 cursor-pointer hover:text-foreground" onClick={() => setFilters({ ...filters, trendingLevel: 'all' })} />
              </Badge>
            )}
            {filters.timeRange !== 'all' && (
              <Badge variant="secondary" className="h-6 gap-1 text-xs">
                {t[TIME_RANGES.find(r => r.value === filters.timeRange)!.label]}
                <X className="h-3 w-3 cursor-pointer hover:text-foreground" onClick={() => setFilters({ ...filters, timeRange: 'all' })} />
              </Badge>
            )}
            {filters.sources.length > 0 && (
              <Badge variant="secondary" className="h-6 gap-1 text-xs">
                {filters.sources.length} {t.source}
                <X className="h-3 w-3 cursor-pointer hover:text-foreground" onClick={() => setFilters({ ...filters, sources: [] })} />
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Results Count */}
      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <span>
          {t.showing} <span className="font-semibold text-foreground">{articles.length}</span> {t.articles}
        </span>
      </div>
    </div>
  )
}

// Re-export types for use in pages
export type { ApiSortOption, ClientSortOption, FilterState }
