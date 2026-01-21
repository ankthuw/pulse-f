"use client"

import React, { useEffect, useState } from "react"
import type { UserProfile } from "@/types/user-profile"
import { loadUserProfile, saveUserProfile, getDefaultUserProfile } from "@/lib/user-profile"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"

// You may want to import CATEGORIES from a shared location. For now, define fallback:
const CATEGORIES = [
  "all", "technology", "business", "science", "health", "sports", "entertainment", "politics"
]

interface MyBriefingSettingsProps {
  profile: UserProfile | null
  onChange: (profile: UserProfile) => void
}

export default function MyBriefingSettings({ profile, onChange }: MyBriefingSettingsProps) {
  const [localProfile, setLocalProfile] = useState<UserProfile>(
    profile || getDefaultUserProfile()
  )

  useEffect(() => {
    setLocalProfile(profile || getDefaultUserProfile())
  }, [profile])

  // Handle change and propagate up
  function handleChange<K extends keyof UserProfile>(key: K, value: UserProfile[K]) {
    const updated = { ...localProfile, [key]: value }
    setLocalProfile(updated)
    saveUserProfile(updated)
    onChange(updated)
  }

  // Handle category toggle
  function handleCategoryToggle(category: string) {
    let updatedCategories = localProfile.preferredCategories.includes(category)
      ? localProfile.preferredCategories.filter(c => c !== category)
      : [...localProfile.preferredCategories, category]
    handleChange("preferredCategories", updatedCategories)
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-base mb-4">Customize Your Briefing</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Adjust your preferences to get the most relevant news for you.
        </p>
      </div>

      <Separator />

      {/* Categories */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Categories</Label>
        <div className="grid grid-cols-2 gap-3">
          {CATEGORIES.filter(c => c !== "all").map(category => (
            <div key={category} className="flex items-center space-x-2">
              <Checkbox
                id={`cat-${category}`}
                checked={localProfile.preferredCategories.includes(category)}
                onCheckedChange={() => handleCategoryToggle(category)}
              />
              <label
                htmlFor={`cat-${category}`}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                {category.charAt(0).toUpperCase() + category.slice(1)}
              </label>
            </div>
          ))}
        </div>
      </div>

      <Separator />

      {/* Language */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Language</Label>
        <RadioGroup
          value={localProfile.preferredLang}
          onValueChange={(value) => handleChange("preferredLang", value as 'en' | 'vi')}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="en" id="lang-en" />
            <Label htmlFor="lang-en" className="cursor-pointer">English</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="vi" id="lang-vi" />
            <Label htmlFor="lang-vi" className="cursor-pointer">Vietnamese</Label>
          </div>
        </RadioGroup>
      </div>

      <Separator />

      {/* Reading Mode */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Reading Mode</Label>
        <RadioGroup
          value={localProfile.readingMode}
          onValueChange={(value) => handleChange("readingMode", value as 'quick' | 'deep')}
          className="flex gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="quick" id="mode-quick" />
            <Label htmlFor="mode-quick" className="cursor-pointer">Quick</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="deep" id="mode-deep" />
            <Label htmlFor="mode-deep" className="cursor-pointer">Deep</Label>
          </div>
        </RadioGroup>
        <p className="text-xs text-muted-foreground">
          Quick mode shows fewer articles, Deep mode shows more comprehensive coverage.
        </p>
      </div>

      <Separator />

      {/* Daily Minutes */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Daily Reading Time</Label>
        <RadioGroup
          value={String(localProfile.dailyMinutes)}
          onValueChange={(value) => handleChange("dailyMinutes", parseInt(value) as 5 | 10 | 20)}
          className="flex gap-4"
        >
          {[5, 10, 20].map(mins => (
            <div key={mins} className="flex items-center space-x-2">
              <RadioGroupItem value={String(mins)} id={`mins-${mins}`} />
              <Label htmlFor={`mins-${mins}`} className="cursor-pointer">{mins} min</Label>
            </div>
          ))}
        </RadioGroup>
      </div>
    </div>
  )
}
