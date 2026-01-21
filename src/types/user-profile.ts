// User profile types for My Briefing and personalization features
// Do not import from src/app/... here. Only type definitions.

export type ReadingMode = 'quick' | 'deep'

export interface UserProfile {
  preferredCategories: string[] // e.g. ['technology', 'business']
  preferredLang: 'en' | 'vi'
  readingMode: ReadingMode // 'quick' = fewer articles, 'deep' = more articles
  dailyMinutes: 5 | 10 | 20
}
