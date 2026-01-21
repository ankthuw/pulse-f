// Analytics utilities for tracking user behavior
// Uses localStorage for persistence across sessions

export interface DoomscrollingAnalytics {
  stopLineBypassCount: number
  lastBypassDate: string
  explainersViewed: number
  explainersClicked: string[] // article IDs
  sessionStartTime: number
  totalReadingTime: number
}

const ANALYTICS_KEY = 'pulse_doomscrolling_analytics_v1'

// Load analytics from localStorage
export function loadAnalytics(): DoomscrollingAnalytics {
  if (typeof window === 'undefined') {
    return getDefaultAnalytics()
  }
  
  try {
    const stored = window.localStorage.getItem(ANALYTICS_KEY)
    if (!stored) return getDefaultAnalytics()
    
    const parsed = JSON.parse(stored) as DoomscrollingAnalytics
    // Reset daily stats if it's a new day
    const lastBypass = new Date(parsed.lastBypassDate)
    const today = new Date()
    if (lastBypass.toDateString() !== today.toDateString()) {
      return {
        ...parsed,
        stopLineBypassCount: 0,
        lastBypassDate: today.toISOString(),
      }
    }
    return parsed
  } catch {
    return getDefaultAnalytics()
  }
}

// Save analytics to localStorage
export function saveAnalytics(analytics: DoomscrollingAnalytics): void {
  if (typeof window === 'undefined') return
  
  try {
    window.localStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics))
  } catch (err) {
    console.error('[Analytics] Failed to save:', err)
  }
}

// Get default analytics object
function getDefaultAnalytics(): DoomscrollingAnalytics {
  return {
    stopLineBypassCount: 0,
    lastBypassDate: new Date().toISOString(),
    explainersViewed: 0,
    explainersClicked: [],
    sessionStartTime: Date.now(),
    totalReadingTime: 0,
  }
}

// Track stop line bypass
export function trackStopLineBypass(): void {
  const analytics = loadAnalytics()
  analytics.stopLineBypassCount += 1
  analytics.lastBypassDate = new Date().toISOString()
  saveAnalytics(analytics)
  
  console.log('[Analytics] Stop line bypassed:', analytics.stopLineBypassCount, 'times today')
}

// Track explainer viewed
export function trackExplainersViewed(): void {
  const analytics = loadAnalytics()
  analytics.explainersViewed += 1
  saveAnalytics(analytics)
  
  console.log('[Analytics] Explainers section viewed:', analytics.explainersViewed, 'times')
}

// Track explainer article clicked
export function trackExplainerClicked(articleId: string): void {
  const analytics = loadAnalytics()
  
  if (!analytics.explainersClicked.includes(articleId)) {
    analytics.explainersClicked.push(articleId)
    saveAnalytics(analytics)
  }
  
  console.log('[Analytics] Explainer clicked:', articleId)
}

// Get analytics summary (for debugging or admin dashboard)
export function getAnalyticsSummary(): string {
  const analytics = loadAnalytics()
  
  return `
📊 Doomscrolling Analytics Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📅 Today: ${new Date(analytics.lastBypassDate).toDateString()}

🛑 Stop Line Bypasses: ${analytics.stopLineBypassCount}

 Explainers:
   • Viewed: ${analytics.explainersViewed} times
   • Clicked: ${analytics.explainersClicked.length} articles

⏱️ Session started: ${new Date(analytics.sessionStartTime).toLocaleTimeString()}
  `.trim()
}

// Export analytics data as JSON (for downloading)
export function exportAnalytics(): string {
  const analytics = loadAnalytics()
  return JSON.stringify(analytics, null, 2)
}
