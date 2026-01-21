# 📖 Understanding Reading Mode & Explainers

## 🎯 Reading Mode - Cách hoạt động

### Tổng quan
Reading Mode là tính năng trong **My Briefing** (`/briefing`) giúp personalize số lượng và độ sâu của bài viết theo nhu cầu người dùng.

### 2 Chế độ

#### 1. Quick Mode (Chế độ Nhanh) ⚡
**Dành cho:**
- Người bận rộn
- Chỉ có 5-10 phút
- Chỉ muốn nắm tin quan trọng nhất

**Đặc điểm:**
- **Ít bài viết hơn:** 4-8 bài (tùy theo Daily Minutes)
- **Stop line sớm hơn:** Sau 6 bài
- **Tập trung:** Chỉ các bài importance cao nhất

**Công thức:**
```typescript
if (readingMode === 'quick') {
  if (dailyMinutes === 5)  → 4 articles (2 Must Read + 2 Nice to Know)
  if (dailyMinutes === 10) → 6 articles (3 Must Read + 3 Nice to Know)
  if (dailyMinutes === 20) → 8 articles (4 Must Read + 4 Nice to Know)
}
```

**Use case:**
> "Tôi chỉ có 5 phút buổi sáng để đọc tin. Cho tôi 4 bài quan trọng nhất thôi!"

---

#### 2. Deep Mode (Chế độ Sâu) 🔍
**Dành cho:**
- Người muốn hiểu rộng hơn
- Có thời gian đọc kỹ
- Quan tâm nhiều chủ đề

**Đặc điểm:**
- **Nhiều bài viết hơn:** 6-16 bài
- **Stop line muộn hơn:** Sau 10 bài
- **Đa dạng:** Coverage rộng hơn

**Công thức:**
```typescript
if (readingMode === 'deep') {
  if (dailyMinutes === 5)  → 6 articles  (3 Must Read + 3 Nice to Know)
  if (dailyMinutes === 10) → 10 articles (5 Must Read + 5 Nice to Know)
  if (dailyMinutes === 20) → 16 articles (8 Must Read + 8 Nice to Know)
}
```

**Use case:**
> "Tôi có 20 phút mỗi sáng. Muốn hiểu sâu về tech và business."

---

### Daily Minutes (Thời gian đọc mỗi ngày)

**3 options:** 5 min / 10 min / 20 min

**Ảnh hưởng:**
- Càng nhiều phút → Càng nhiều bài
- Kết hợp với Reading Mode để tính số bài chính xác

**Ví dụ tổng hợp:**

| Reading Mode | Daily Minutes | Total Articles | Must Read | Nice to Know | Stop Line After |
|--------------|---------------|----------------|-----------|--------------|-----------------|
| Quick        | 5 min         | 4              | 2         | 2            | 6 bài           |
| Quick        | 10 min        | 6              | 3         | 3            | 6 bài           |
| Quick        | 20 min        | 8              | 4         | 4            | 6 bài           |
| Deep         | 5 min         | 6              | 3         | 3            | 10 bài          |
| Deep         | 10 min        | 10             | 5         | 5            | 10 bài          |
| Deep         | 20 min        | 16             | 8         | 8            | 10 bài          |

---

### Must Read vs Nice to Know

#### Must Read (Bắt buộc đọc)
- **Top 50%** articles theo importance
- Critical/High impact stories
- Icon: ⚡ (Zap - lightning bolt)
- Color: Red gradient

#### Nice to Know (Tốt nếu biết)
- **Next 50%** articles
- Important nhưng không cấp bách
- Icon: 📈 (TrendingUp)
- Color: Blue gradient

**Phân chia logic:**
```typescript
function buildBriefing(articles, profile) {
  // 1. Filter by user's preferred categories
  // 2. Sort by importance DESC
  // 3. Calculate total target based on mode + minutes
  // 4. Split:
  const mustReadCount = Math.max(2, Math.round(totalTarget / 2))
  const mustRead = articles.slice(0, mustReadCount)
  const niceToKnow = articles.slice(mustReadCount, totalTarget)
}
```

---

## 📚 Explainers Section - Cách truy cập & hoạt động

### Mục đích
**Explainers** là các bài viết chất lượng cao, giúp người dùng:
- Hiểu sâu hơn về chủ đề
- Tránh doomscrolling vô tận
- Chuyển từ "skim reading" sang "deep reading"

### Cách truy cập

#### Bước 1: Scroll down feed
- Main feed (`/`) hoặc My Briefing (`/briefing`)
- Đọc các bài (visible 3s+ mỗi bài)

#### Bước 2: Gặp Stop Line Card
**Khi nào xuất hiện:**
- Main feed: Sau khi đọc thực sự ≥ 3 bài (click-based tracking)
- Briefing: Sau khi đọc ≥ 3 bài (click-based tracking)

**Cách tracking:**
- Click vào article card → ghi lại timestamp
- Sau 5+ giây trên trang article → đánh dấu đã đọc
- Chỉ đếm những bài thực sự đọc (không phải scroll qua)

**Card hiển thị:**
```
┌──────────────────────────────────┐
│ ☕ You've read enough for now    │
│                                  │
│ Take a break or switch to        │
│ deeper explainers for context.   │
│                                  │
│ [📖 Show Explainers] [Continue]  │
│ Articles viewed: 3               │
└──────────────────────────────────┘
```

#### Bước 3: Click "Show Explainers"
→ Explainers section xuất hiện bên dưới

---

### Tiêu chí lọc Explainers (Smart Selection)

**Công thức mới (Enhanced):**
```typescript
// 1. Base filtering: High-quality articles only
const candidates = articles.filter(a => 
  a.importance >= 70 &&  // High quality
  a.views >= 200 &&      // Not too niche
  a.views <= 1500 &&     // Not too viral
  !isArticleRead(a.id)   // Prioritize unread
)

// 2. Smart scoring system
const scored = candidates.map(article => {
  let score = article.importance  // Base: 30-100
  
  // Recency bonus: +5 for articles < 12 hours old
  const hoursSincePublished = (now - publishedAt) / (1000 * 60 * 60)
  if (hoursSincePublished < 12) score += 5
  
  // Category match bonus: +10-15 points
  // Main feed: +10 if matches selected category filter
  // Briefing: +15 if matches user's preferred categories
  if (categoryMatch) score += bonusPoints
  
  return { article, score }
})

// 3. Source diversity: Ensure variety
const diversified = []
const usedDomains = new Set()

// First pass: unique domains only
for (item of sorted) {
  const domain = item.article.source.replace('www.', '')  // source contains domain
  if (!usedDomains.has(domain) && diversified.length < 5) {
    diversified.push(item)
    usedDomains.add(domain)
  }
}

// Second pass: fill remaining slots
// (allows duplicate domains if needed to reach 5)

// Result: Top 5 smart picks
```

**Key Improvements:**

1. **Unread Prioritization**
   - Filters out already-read articles
   - Fresh content each time you view explainers
   - No duplicate recommendations

2. **Smart Scoring System**
   - Base score: Article importance (30-100)
   - Recency bonus: Recent articles (< 12h) get +5 points
   - Category bonus: Matching user preferences get +10-15 points
   - Final score determines ranking

3. **Source Diversity**
   - Ensures variety across different publications
   - Avoids showing 5 articles from same source
   - Two-pass algorithm:
     - Pass 1: Pick highest-scored from unique domains
     - Pass 2: Fill remaining slots if < 5 articles

4. **Category-Aware**
   - **Main Feed:** Boosts articles matching current filter
   - **Briefing:** Boosts articles in user's preferred categories
   - Example: User prefers "Technology" → tech articles ranked higher

**Original Simple Criteria (for reference):**
```typescript
// Old method (basic filtering only)
const explainers = articles.filter(a => 
  a.importance >= 70 &&
  a.views >= 200 &&
  a.views <= 1500
)
.sort((a, b) => b.importance - a.importance)
.slice(0, 5)
```

---

### Why These Thresholds?

1. **`importance >= 70`**
   - Chỉ bài chất lượng cao
   - Critical hoặc gần Critical (threshold: Critical ≥80, High ≥60)
   - Worth spending time reading deeply
   - Calculated: 30 base + tone(0-30) + mentions(0-40)

2. **`views >= 200`**
   - Có đủ engagement
   - Không quá niche
   - Proven to be relevant

3. **`views <= 1500`**
   - Không quá viral/mainstream
   - Tránh clickbait
   - Focus on substance over hype

4. **`!isArticleRead(a.id)`**
   - Only unread articles
   - Fresh recommendations
   - Better user experience

5. **Recency Bonus (+5 points)**
   - Articles published within last 12 hours
   - Keeps explainers current
   - Breaking news context

6. **Category Match (+10-15 points)**
   - Matches user's interests
   - Personalized recommendations
   - Higher relevance

7. **Source Diversity**
   - Variety of perspectives
   - Avoids echo chambers
   - Better overall picture

8. **Top 5 Only**
   - Không overwhelm user
   - Chất lượng > Số lượng
   - Encourage focused reading

---

### UI của Explainers Section

```
┌─────────────────────────────────────────────┐
│ 📖 Explainers & Deep Dives                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ High-quality articles selected for deeper   │
│ understanding • 5 articles                  │
└─────────────────────────────────────────────┘

┌────────────────┐  ┌────────────────┐  ┌────────────────┐
│ [Explainer]    │  │ [Explainer]    │  │ [Explainer]    │
│                │  │                │  │                │
│ Article Card 1 │  │ Article Card 2 │  │ Article Card 3 │
└────────────────┘  └────────────────┘  └────────────────┘

┌────────────────┐  ┌────────────────┐
│ [Explainer]    │  │ [Explainer]    │
│                │  │                │
│ Article Card 4 │  │ Article Card 5 │
└────────────────┘  └────────────────┘
```

**Đặc điểm:**
- Gradient background header (primary color)
- Badge "Explainer" trên mỗi card
- Grid layout (3 columns on desktop)
- Click tracking cho analytics

---

## 🎮 Interactive Examples

### Example 1: Quick Reader
**Profile:**
- Reading Mode: Quick
- Daily Minutes: 10 min
- Categories: Technology, Business

**Journey:**
1. Open `/briefing` at 8:00 AM
2. See 6 articles (3 Must Read + 3 Nice to Know)
3. Read first 3 carefully (each visible 3s+)
4. Progress bar: 50% (3/6 read)
5. Stop Line appears after 6th article
6. Click "Show Explainers"
7. See 5 high-quality tech/business explainers
8. Read 2 explainers deeply
9. Done! Total time: ~10 minutes

### Example 2: Deep Reader
**Profile:**
- Reading Mode: Deep
- Daily Minutes: 20 min
- Categories: All

**Journey:**
1. Open `/briefing` at morning coffee
2. See 16 articles (8 Must Read + 8 Nice to Know)
3. Read through all Must Read section
4. Progress bar: 50% (8/16 read)
5. Continue to Nice to Know
6. Stop Line appears after 10th article
7. Click "Continue" (wants to finish all 16)
8. Finish all articles
9. Progress bar: 100%
10. Completion celebration card appears 🎉
11. Browse Explainers for extra depth
12. Total time: ~25 minutes

### Example 3: Main Feed Browser
**Journey:**
1. Open `/` (main feed)
2. Scroll casually, reading interesting titles
3. Click on 3 articles that catch attention
4. Each opens in new tab/page
5. Spend 5+ seconds reading each
6. Return to main feed
7. Read count: 3 (marked automatically via click tracking)
8. Stop Line appears: "You've read enough for now"
9. Choice:
   - Click "Show Explainers" → See 5 quality articles (unread, from diverse sources, matching current category filter)
   - Click "Continue" → Keep scrolling feed

---

## 🎮 Smart Explainers in Action

### Scenario 1: Technology Enthusiast
**Setup:**
- User viewing "Technology" category on main feed
- Already read 3 tech articles today
- Current time: 10:00 AM

**What happens:**
1. Stop line triggers after 3 reads
2. Click "Show Explainers"
3. System finds:
   - 15 candidates (importance ≥70, views 200-1500, unread)
   - Scores them:
     - Base: 70-100 (importance)
     - +10 for technology category match
     - +5 for articles published after 10 PM yesterday
   - Ensures source diversity (TechCrunch, Ars Technica, Wired, The Verge, MIT Tech Review)
4. Shows: 5 diverse, high-quality tech articles you haven't read
5. All are recent (last 12 hours) and highly relevant

### Scenario 2: Briefing Power User
**Setup:**
- User profile: Technology + Business, Deep mode, 20 min
- Morning briefing at 8:00 AM
- Already read 3 must-read articles

**What happens:**
1. Stop line triggers
2. Click "Show Explainers"
3. System finds:
   - Candidates matching user's preferred categories
   - Scores with +15 bonus for Technology and Business
   - +5 bonus for overnight articles (published after 8 PM yesterday)
4. Shows: 5 articles perfectly aligned with user interests
   - 3 from Technology
   - 2 from Business
   - All from different sources
   - All unread and highly relevant

### Scenario 3: Diverse Source Discovery
**Setup:**
- User has been reading mostly from TechCrunch
- Explainers triggered

**What happens:**
1. System identifies 10 high-quality candidates
2. Top 3 are all from TechCrunch (importance 85, 82, 80)
3. Diversity algorithm:
   - Pick #1 from TechCrunch (highest score: 85)
   - Skip #2, #3 (same domain)
   - Pick #4 from Ars Technica (score: 78)
   - Pick #5 from Wired (score: 76)
   - Pick #6 from The Verge (score: 75)
   - Pick #7 from MIT Tech Review (score: 73)
4. Result: 5 articles from 5 different sources
5. User discovers new quality publications

---

## 🧪 Testing Reading Mode & Smart Explainers

### Test Case 1: Change Reading Mode
1. Go to `/briefing`
2. Click "Settings"
3. Change: Quick → Deep
4. Change: 10 min → 20 min
5. Refresh page
6. **Expected:**
   - More articles appear
   - Stop line position doesn't change (still 3 reads)

### Test Case 2: Must Read vs Nice to Know
1. Check Must Read section
2. **Expected:** Higher importance articles
3. Check Nice to Know section
4. **Expected:** Lower (but still good) importance

### Test Case 3: Click-based Read Tracking
1. Click on an article
2. Stay on article page for 5+ seconds
3. Return to main feed
4. **Expected:** 
   - Article has blue border and faded style
   - Progress bar updated
   - Read count incremented

### Test Case 4: Smart Explainers - Unread Only
1. Read 3 articles (click + 5s minimum)
2. Stop line appears
3. Click "Show Explainers"
4. Note the 5 explainers shown
5. Click and read 2 of them
6. Return and trigger explainers again
7. **Expected:**
   - The 2 you read are NOT shown again
   - New articles fill those slots
   - Still get 5 total explainers

### Test Case 5: Smart Explainers - Category Match
1. On main feed, select "Technology" category
2. Read 3 articles
3. Click "Show Explainers"
4. **Expected:**
   - Most/all explainers are Technology articles
   - They have higher scores due to category match

### Test Case 6: Smart Explainers - Source Diversity
1. Trigger explainers
2. Look at the source URLs of 5 articles
3. **Expected:**
   - Ideally 5 different domains
   - No more than 2 from same source (if pool is limited)

### Test Case 7: Smart Explainers - Recency Bonus
1. Check explainers at 10:00 AM
2. Note: Recent articles (published after 10 PM yesterday) ranked higher
3. Check console logs for score calculations
4. **Expected:**
   - Recent articles appear despite slightly lower base importance
   - Example: 75 importance + 5 recency = 80 beats 78 importance article

### Test Case 8: Briefing - Preference Match
1. Set preferences: Technology + Business
2. Go to `/briefing`
3. Trigger explainers
4. **Expected:**
   - Most explainers from Technology or Business
   - Higher scores for preference matches (visible in console)
   - Diverse sources within those categories

---

## 🔧 Customization Guide

### Adjust Explainer Scoring Weights

In `src/app/page.tsx` and `src/app/briefing/page.tsx`:
```typescript
const scored = candidates.map(article => {
  let score = article.importance  // Base: 30-100
  
  // Customize recency bonus (currently +5 for < 12 hours)
  const hoursSincePublished = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60)
  if (hoursSincePublished < 12) score += 5  // Change: 5 → 10 for stronger recency
  
  // Customize category match bonus
  // Main feed: +10 for current category
  if (selectedCategory !== 'all' && article.category === selectedCategory) {
    score += 10  // Change: 10 → 15 for stronger category preference
  }
  
  // Briefing: +15 for user preferences
  if (profile.preferredCategories.includes(article.category)) {
    score += 15  // Change: 15 → 20 for stronger personalization
  }
  
  return { article, score }
})
```

### Adjust Explainer Base Criteria

```typescript
const candidates = processedArticles.filter(a => 
  a.importance >= 70 &&  // Change: 70 → 60 for more results (includes "High" impact)
  a.views >= 200 &&      // Change: 200 → 100 for more niche articles
  a.views <= 1500 &&     // Change: 1500 → 2000 for more viral articles
  !isArticleRead(a.id)   // Keep: essential for smart recommendations
)
```

### Adjust Explainer Count

```typescript
// Change from top 5 to top 10
if (diversified.length < 5) {  // Change: 5 → 10
  // ...
}

// Or dynamic based on reading mode
const explainerCount = profile?.readingMode === 'deep' ? 10 : 5
if (diversified.length < explainerCount) {
  // ...
}
```

### Adjust Source Diversity Strictness

```typescript
// Current: Requires unique domains first
// Option 1: Allow up to 2 articles per domain
const domainCount = new Map()
for (const item of sorted) {
  const domain = extractDomain(item.article.sourceUrl)
  const count = domainCount.get(domain) || 0
  if (count < 2 && diversified.length < 5) {  // Allow 2 per domain
    diversified.push(item)
    domainCount.set(domain, count + 1)
  }
}

// Option 2: Disable diversity (pure score-based)
const diversified = sorted.slice(0, 5)  // Just take top 5 by score
```

### Adjust Stop Line Trigger

In `src/app/page.tsx` and `src/app/briefing/page.tsx`:
```typescript
// Current: 3 read articles
const shouldShowStopLine = trackedReadCount >= 3

// Change: Make it configurable
const stopLineThreshold = 5  // Require 5 reads before showing
const shouldShowStopLine = trackedReadCount >= stopLineThreshold

// Or: Based on reading mode
const stopLineThreshold = profile?.readingMode === 'quick' ? 3 : 5
```

---

## 📊 Analytics Insights

### Metrics to Track

1. **Reading Mode Usage:**
   - % Quick vs Deep users
   - Average daily minutes selected

2. **Must Read Completion:**
   - % users who finish Must Read section
   - Average time spent

3. **Smart Explainer Performance:**
   - % users who click "Show Explainers"
   - Average explainers read per session
   - Which explainers get most clicks
   - **New:** Score distribution analysis
   - **New:** Category match effectiveness
   - **New:** Recency bonus impact
   - **New:** Source diversity metrics

4. **Stop Line Behavior:**
   - % users who "Continue" vs "Show Explainers"
   - At which article count does stop line trigger (now: 3 reads)

5. **Personalization Effectiveness:**
   - **New:** User satisfaction with category-matched explainers
   - **New:** Unread vs total explainer pool ratio
   - **New:** Average score improvement from bonuses

### Console Logging

**Current logs:**
```javascript
// Check browser console for:
'[Explainers] Found: 5 smart picks (unread, diverse, recent)'  // Main feed
'[Explainers] Found: 5 smart picks for user preferences'       // Briefing
'[Click] Article clicked: article-id-123'
'[Focus] Page regained focus, checking clicked articles...'
'[Read] Marked as read: article-id-123 (time away: 7.5s)'
```

**Enhanced logging (for debugging):**
```typescript
// Add to see scoring details:
console.log('[Explainer Score]', {
  id: article.id,
  title: article.title,
  baseScore: article.importance,
  recencyBonus: recencyBonus,
  categoryBonus: categoryBonus,
  finalScore: score,
  domain: domain,
  hoursOld: hoursSincePublished
})
```

---

## ✅ Summary

### Reading Mode
- **Purpose:** Personalize article count and depth
- **2 modes:** Quick (fast) vs Deep (comprehensive)
- **3 time options:** 5 / 10 / 20 minutes
- **Result:** 4-16 articles, split into Must Read / Nice to Know

### Smart Explainers (Enhanced)
- **Purpose:** Encourage deep reading with intelligent recommendations
- **Access:** Via Stop Line card (triggers after 3 reads) → "Show Explainers" button
- **Base Criteria:** 
  - High importance (≥70)
  - Moderate views (200-1500)
  - Unread only
- **Smart Features:**
  - **Scoring system:** Importance + recency bonus + category match
  - **Source diversity:** Variety of publications
  - **Category-aware:** Matches user interests
  - **Recency bonus:** Recent articles ranked higher
  - **Unread filter:** No duplicate recommendations
- **Count:** Top 5 articles (configurable)
- **UI:** Separate section with badges and gradient header

### Key Improvements Over Basic Version
1. ✅ **Unread prioritization** - Never show same explainer twice
2. ✅ **Smart scoring** - Not just importance, considers recency & relevance
3. ✅ **Source diversity** - Variety of perspectives
4. ✅ **Category awareness** - Personalized to user interests
5. ✅ **Recency bonus** - Fresh content weighted higher
6. ✅ **Two-pass algorithm** - Ensures quality + diversity balance

---

## 🎯 Implementation Architecture

### Data Flow

```
User Action (Read Articles)
    ↓
Click Tracking (localStorage)
    ↓
Read Count ≥ 3
    ↓
Stop Line Appears
    ↓
User Clicks "Show Explainers"
    ↓
Smart Explainer Algorithm:
    1. Filter candidates (importance ≥70, views 200-1500, unread)
    2. Score articles (base + recency + category match)
    3. Diversify sources (unique domains prioritized)
    4. Return top 5
    ↓
Display Explainer Section
    ↓
Track explainer views & clicks
```

### Code Structure

**Main Feed (`/src/app/page.tsx`):**
- Uses `selectedCategory` for category match bonus
- +10 points for matching current filter
- Console log: "smart picks (unread, diverse, recent)"

**Briefing Page (`/src/app/briefing/page.tsx`):**
- Uses `profile.preferredCategories` for category match
- +15 points for matching user preferences (stronger personalization)
- Console log: "smart picks for user preferences"

**Shared Logic:**
- Both use same scoring algorithm
- Both ensure source diversity
- Both filter unread articles
- Both apply recency bonus

### Performance Considerations

- **useMemo:** Prevents unnecessary recalculations
- **Early filtering:** Reduces candidates before scoring
- **Efficient domain tracking:** Set-based deduplication
- **Two-pass maximum:** Fast algorithm (O(n) complexity)

---

*Last Updated: January 20, 2026*
*This document explains the enhanced Smart Explainers system with intelligent scoring, source diversity, and personalization.*
