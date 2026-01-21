import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Hook to track actual article reading based on visibility and time spent
 * An article is considered "read" when:
 * - It's visible in viewport for at least minTimeMs (default 3s)
 * - User has scrolled past it (optional)
 */

export interface ReadTrackingOptions {
  minTimeMs?: number // Minimum time visible to count as read (default: 3000ms)
  threshold?: number // Intersection observer threshold (default: 0.5 = 50% visible)
  onRead?: (articleId: string) => void // Callback when article is read
}

export function useReadTracking(
  articleId: string,
  options: ReadTrackingOptions = {}
) {
  const { minTimeMs = 3000, threshold = 0.5, onRead } = options
  
  const elementRef = useRef<HTMLDivElement>(null)
  const [isRead, setIsRead] = useState(false)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    const element = elementRef.current
    if (!element || isRead || !onRead) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Article became visible
            if (startTimeRef.current === null) {
              startTimeRef.current = Date.now()
              console.log(`[ReadTracking] Article ${articleId} became visible`)
              
              // Set timer to mark as read after minTimeMs
              timerRef.current = setTimeout(() => {
                console.log(`[ReadTracking] ✓ Article ${articleId} marked as read (visible ${minTimeMs}ms)`)
                setIsRead(true)
                if (onRead) {
                  onRead(articleId)
                }
              }, minTimeMs)
            }
          } else {
            // Article left viewport
            if (startTimeRef.current !== null) {
              // Check if it was visible long enough
              const timeVisible = Date.now() - startTimeRef.current
              if (timeVisible < minTimeMs) {
                // Not long enough, reset
                console.log(`[ReadTracking] Article ${articleId} left viewport before ${minTimeMs}ms (${timeVisible}ms)`)
                startTimeRef.current = null
                if (timerRef.current) {
                  clearTimeout(timerRef.current)
                  timerRef.current = null
                }
              }
            }
          }
        })
      },
      { threshold }
    )

    observer.observe(element)

    return () => {
      observer.disconnect()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [articleId, minTimeMs, threshold, onRead, isRead])

  return { elementRef, isRead }
}

/**
 * Hook to track multiple articles reading in a list
 * Returns count of read articles and tracking state
 */
export function useArticleListTracking(articleIds: string[], options: ReadTrackingOptions = {}) {
  const [readArticles, setReadArticles] = useState<Set<string>>(new Set())

  const handleArticleRead = useCallback((articleId: string) => {
    setReadArticles((prev) => {
      const next = new Set(prev)
      next.add(articleId)
      return next
    })
    if (options.onRead) {
      options.onRead(articleId)
    }
  }, [options])

  const trackingOptions = {
    ...options,
    onRead: handleArticleRead,
  }

  return {
    readArticles,
    readCount: readArticles.size,
    trackingOptions,
    isArticleRead: (articleId: string) => readArticles.has(articleId),
  }
}
