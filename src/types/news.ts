export interface NewsArticle {
  id: string
  title: string
  description: string | null
  url: string
  imageUrl: string | null
  source: string
  category: string
  author: string | null
  publishedAt: string
  relativeDate?: string
  importance: number
  views: number
  tone?: number | null
  goldsteinScale?: number | null
}
