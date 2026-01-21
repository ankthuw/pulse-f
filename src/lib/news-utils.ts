import { Flame, TrendingUp, Zap, ArrowUpRight } from 'lucide-react'

export function getImpactBadge(importance: number) {
  if (importance >= 80) {
    return {
      level: 'critical',
      label: 'Critical',
      bg: 'bg-red-500/15',
      text: 'text-red-700 dark:text-red-400',
      border: 'border-red-500/25',
      icon: Flame,
      barColor: 'bg-red-500',
    }
  }
  if (importance >= 60) {
    return {
      level: 'high',
      label: 'High',
      bg: 'bg-orange-500/15',
      text: 'text-orange-700 dark:text-orange-400',
      border: 'border-orange-500/25',
      icon: Zap,
      barColor: 'bg-orange-500',
    }
  }
  if (importance >= 40) {
    return {
      level: 'medium',
      label: 'Medium',
      bg: 'bg-yellow-500/15',
      text: 'text-yellow-700 dark:text-yellow-400',
      border: 'border-yellow-500/25',
      icon: ArrowUpRight,
      barColor: 'bg-yellow-500',
    }
  }
  return {
    level: 'low',
    label: 'Low',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-400',
    border: 'border-emerald-500/25',
    icon: TrendingUp,
    barColor: 'bg-emerald-500',
  }
}

export function getTrendingBadge(views: number) {
  if (views > 800) return { level: 'viral', label: 'Viral', color: 'text-red-600 dark:text-red-400' }
  if (views > 500) return { level: 'hot', label: 'Hot', color: 'text-orange-600 dark:text-orange-400' }
  if (views > 300) return { level: 'trending', label: 'Trending', color: 'text-violet-600 dark:text-violet-400' }
  if (views > 150) return { level: 'rising', label: 'Rising', color: 'text-blue-600 dark:text-blue-400' }
  return null
}
