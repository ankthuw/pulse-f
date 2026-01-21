// User profile localStorage helpers for client-side only
// No side effects at top-level. Only use window/localStorage inside functions.

import type { UserProfile } from '@/types/user-profile'

const STORAGE_KEY = 'pulse_user_profile_v1'

// Load user profile from localStorage. Returns null if not found or SSR.
export function loadUserProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as UserProfile
  } catch {
    return null
  }
}

// Save user profile to localStorage. Only works on client.
export function saveUserProfile(profile: UserProfile): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Ignore write errors
  }
}

// Get default user profile
export function getDefaultUserProfile(): UserProfile {
  return {
    preferredCategories: ['technology', 'business'],
    preferredLang: 'en',
    readingMode: 'quick',
    dailyMinutes: 10,
  }
}
