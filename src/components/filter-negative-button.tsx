'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Shield, ShieldOff } from 'lucide-react'
import { useEffect, useState } from 'react'

interface FilterNegativeButtonProps {
  enabled: boolean
  onChange: (enabled: boolean) => void
  totalArticles: number
  filteredArticles: number
  lang?: 'en' | 'vi'
}

const STRINGS = {
  en: {
    filterOn: 'Filter Negative',
    filterOff: 'Show All',
    filtered: 'filtered',
    showing: 'Showing',
    of: 'of',
    tooltip: 'Hide very negative articles',
  },
  vi: {
    filterOn: 'Lọc tiêu cực',
    filterOff: 'Hiện tất cả',
    filtered: 'đã lọc',
    showing: 'Hiển thị',
    of: 'của',
    tooltip: 'Ẩn bài rất tiêu cực',
  },
}

export function FilterNegativeButton({
  enabled,
  onChange,
  totalArticles,
  filteredArticles,
  lang = 'en',
}: FilterNegativeButtonProps) {
  const t = STRINGS[lang]
  const [showFeedback, setShowFeedback] = useState(false)
  const articlesHidden = totalArticles - filteredArticles

  // Show feedback when filter is enabled and hides articles
  useEffect(() => {
    if (articlesHidden > 0 && enabled) {
      setShowFeedback(true)
      const timer = setTimeout(() => setShowFeedback(false), 3000)
      return () => clearTimeout(timer)
    }
  }, [articlesHidden, enabled])

  return (
    <div className="flex items-center gap-2">
      <Button
        onClick={() => onChange(!enabled)}
        variant={enabled ? 'default' : 'outline'}
        size="sm"
        className={`h-9 gap-2 transition-all ${
          enabled
            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm'
            : 'hover:bg-muted'
        }`}
        title={t.tooltip}
      >
        {enabled ? (
          <>
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">{t.filterOn}</span>
            <span className="sm:hidden">Filter</span>
          </>
        ) : (
          <>
            <ShieldOff className="h-4 w-4" />
            <span className="hidden sm:inline">{t.filterOff}</span>
            <span className="sm:hidden">All</span>
          </>
        )}
      </Button>

      {/* Visual Feedback */}
      {showFeedback && articlesHidden > 0 && (
        <Badge
          variant="secondary"
          className="animate-in fade-in duration-300 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800"
        >
          {articlesHidden} {t.filtered}
        </Badge>
      )}

      {/* Article Count */}
      {enabled && (
        <span className="text-xs text-muted-foreground whitespace-nowrap hidden md:inline">
          {t.showing} {filteredArticles} {t.of} {totalArticles}
        </span>
      )}
    </div>
  )
}
