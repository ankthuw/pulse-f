## 🚀 Innovation Pipeline – Cá nhân hóa & Giảm Doomscrolling cho Pulse

**Để đọc chi tiết từng phase, xem các file docs:**

- [Phase 1 – My Briefing](src/docs/innovation-pipeline/phase1-my-briefing.md)
- [Phase 2 – Doomscrolling Control](src/docs/innovation-pipeline/phase2-doomscrolling-control.md)
- [Phase 3 – Tối ưu & Mở rộng](src/docs/innovation-pipeline/phase3-optimization-extension.md)

---

**Mục tiêu:**  
Xây dựng thêm các công cụ trên nền Pulse hiện tại để:

1. Tạo **My Briefing** – bản tin cá nhân hóa 5–10 phút mỗi ngày (must-read / nice-to-know).
2. Thêm lớp **Doomscrolling Control** – stop line, gợi ý explainers/long reads, giảm tin quá tiêu cực.

Pipeline này được viết sao cho **bất kỳ AI nào** đọc cũng có thể lần lượt thực hiện được, chỉ cần tuân thủ từng bước.

---

## 0. Nguyên tắc & Kiến trúc chung

- **Không phá vỡ behavior hiện tại của Pulse**:
  - Tab/news page hiện tại (live feed từ GDELT) phải vẫn hoạt động như cũ.
- **Ưu tiên frontend-first, stateless hoặc local state**:
  - Nếu chưa có auth / backend user DB, lưu profile **local** (localStorage) là chấp nhận được ở giai đoạn đầu.
- **Tách rõ 2 lớp**:
  1. **Lớp dữ liệu** – nguồn GDELT qua `/api/news`.
  2. **Lớp trải nghiệm** – My Briefing, stop line, filters cảm xúc, chỉ là logic trên mảng `articles`.
- **Mỗi phase phải “done” độc lập**:
  - Sau mỗi phase, app vẫn build được, không lỗi TypeScript, không phá UI.

---

## 1. Phase 1 – My Briefing (Profile + Curated Feed + Progress)

### 1.1. Mục tiêu Phase 1

- Có **My Briefing tab** riêng:
  - Cho user chọn sở thích cơ bản.
  - Gọi `/api/news` dựa trên profile.
  - Chia bài thành 2 nhóm: **Must Read** và **Nice to Know**.
  - Hiển thị **progress** đọc trong ngày.

### 1.2. Bước 1 – Định nghĩa cấu trúc User Profile (FE)

**Nơi sửa:**
- Tạo file mới: `src/types/user-profile.ts`

**Yêu cầu:**

```ts
// src/types/user-profile.ts
export type ReadingMode = 'quick' | 'deep'

export interface UserProfile {
  preferredCategories: string[]    // ví dụ: ['technology', 'business']
  preferredLang: 'en' | 'vi'
  readingMode: ReadingMode         // 'quick' = ít bài, 'deep' = nhiều bài
  dailyMinutes: 5 | 10 | 20
}
```

**Tiếp theo:**
- Không được import ngược từ `src/app/...` vào đây (chỉ types).

### 1.3. Bước 2 – Layer lưu profile (localStorage helper)

**Nơi sửa:**
- Tạo file mới: `src/lib/user-profile.ts`

**Yêu cầu:**
- Export các hàm sau, không side-effect khi import (không gọi `window` ở top-level, chỉ trong function):

```ts
const STORAGE_KEY = 'pulse_user_profile_v1'

export function loadUserProfile(): UserProfile | null {
  // Nếu window không tồn tại (SSR) → return null
  // Nếu không có trong localStorage → return null
  // Nếu parse lỗi → return null
}

export function saveUserProfile(profile: UserProfile): void {
  // Ghi vào localStorage (chỉ khi có window)
}

export function getDefaultUserProfile(): UserProfile {
  return {
    preferredCategories: ['technology', 'business'],
    preferredLang: 'en',
    readingMode: 'quick',
    dailyMinutes: 10,
  }
}
```

**Constraint cho AI:**
- Không được dùng `localStorage` trong server components.
- Chỉ gọi các hàm trên **bên trong** hooks/lifecycle trên client (`useEffect` hoặc component `'use client'`).

### 1.4. Bước 3 – UI thiết lập profile (My Briefing Settings)

**Nơi sửa:**
- Tạo component mới: `src/components/my-briefing-settings.tsx`
- Đây là **client component**:

```ts
'use client'

import { UserProfile } from '@/types/user-profile'
import { loadUserProfile, saveUserProfile, getDefaultUserProfile } from '@/lib/user-profile'
```

**Chức năng:**
- Render form đơn giản:
  - Chọn categories (checkbox list từ `CATEGORIES` đã có trong `src/app/page.tsx`).
  - Chọn language: `en` / `vi`.
  - Chọn reading mode: quick / deep.
  - Chọn dailyMinutes: 5 / 10 / 20.
- Logic:
  - Khi mount: load profile từ `loadUserProfile()` hoặc `getDefaultUserProfile()`.
  - Khi user thay đổi: update state + `saveUserProfile(profile)`.

**Output:**
- Component nhận prop:

```ts
interface MyBriefingSettingsProps {
  profile: UserProfile | null
  onChange: (profile: UserProfile) => void
}
```

- Component tự **không** gọi API; chỉ điều chỉnh profile và callback `onChange`.

### 1.5. Bước 4 – Tạo trang / Tab My Briefing

**Lựa chọn kiến trúc (đơn giản nhất trước):**

- Tạo route mới: `src/app/briefing/page.tsx` (client component).
  - Ưu điểm: không động vào `src/app/page.tsx` chính, tránh rủi ro.

**Yêu cầu cho `briefing/page.tsx`:**

1. **State cơ bản:**
   - `profile: UserProfile` (load từ `loadUserProfile` trong `useEffect`, fallback default).
   - `articles: NewsArticle[]`.
   - `loading: boolean`.
   - `readArticleIds: Set<string>` (dùng `useState<string[]>` bên trong, khi render có thể convert thành `Set`).

2. **Fetch logic cho briefing:**
   - Gọi `/api/news` **ít nhất 1 lần** với:
     - category:
       - Nếu `preferredCategories` rỗng → `'all'`.
       - Nếu có nhiều category → có 2 option:
         - Cách MVP: Gọi `/api/news?category=all` → filter client.
         - Hoặc: lần lượt gọi từng category và merge; **MVP nên dùng option 1**.
     - sort: `'relevance'` (hoặc param từ UI nếu có).
     - lang: dùng `profile.preferredLang` (có thể thêm query param hoặc giữ trên client, tuỳ hiện trạng API).

3. **Curate Must Read / Nice to Know (trên client):**

   - Viết helper trong file `briefing/page.tsx`:

   ```ts
   interface BriefingBuckets {
     mustRead: NewsArticle[]
     niceToKnow: NewsArticle[]
   }

   function buildBriefing(articles: NewsArticle[], profile: UserProfile): BriefingBuckets {
     // 1. Lọc theo category nếu profile.preferredCategories không rỗng
     // 2. Sort theo importance desc, fallback views desc
     // 3. Dựa trên profile.readingMode + dailyMinutes → quyết định tổng số bài target
     //    - Quick: khoảng 4–6 bài cho 10 phút
     //    - Deep: khoảng 8–12 bài cho 10 phút (AI có thể hard-code mapping)
     // 4. Chia:
     //    - mustRead = top N1 (ví dụ 3–5)
     //    - niceToKnow = phần còn lại trong quota
   }
   ```

4. **Progress đọc:**

   - `totalTarget = mustRead.length + niceToKnow.length`.
   - `completed = số bài trong hai nhóm mà id nằm trong `readArticleIds`.
   - `progressPercent = totalTarget === 0 ? 0 : Math.round((completed / totalTarget) * 100)`.
   - UI:
     - Thanh progress + text: “X/Y articles • Z%”.

5. **Đánh dấu đã đọc:**

   - Khi user click vào card (NewsCard) hoặc nút “Read article”:
     - Gọi `onMarkRead(article.id)`.
     - `setReadArticleIds(prev => [...new Set([...prev, article.id])])`.
   - (Tuỳ chọn) lưu `readArticleIds` vào localStorage, nhưng **MVP có thể chỉ giữ trong session**.

### 1.6. Bước 5 – Tích hợp UI hiện có (NewsCard / Filter)

**Yêu cầu:**
- Tái sử dụng `NewsCard` từ `src/components/news-card.tsx` trong trang `/briefing`.
- Không cần dùng `FilterAndSortBar` tại Briefing ở Phase 1 (giữ UX đơn giản).

**Layout gợi ý cho `/briefing`:**
- Header:
  - Title: “My Briefing”.
  - Subtitle: “Your personalized X-min daily news”.
  - Progress bar.
- 2 section:
  - “Must Read” – 1 cột / 2 cột card lớn.
  - “Nice to Know” – lưới card bình thường.
- Sidebar hoặc block bên trên:
  - Chunk `MyBriefingSettings` ở dạng collapsible / modal.

---

## 2. Phase 2 – Doomscrolling Control (Stop Line + Explainers + Emotion Filter)

### 2.1. Mục tiêu Phase 2

- Trên **feed dạng list/infinite** (page chính hoặc `/briefing`), thêm:
  - **Stop line** sau một số bài.
  - Gợi ý chuyển sang **Explainers / Long reads**.
  - **Emotion filter** đơn giản dựa trên `tone` / `importance`.

### 2.2. Bước 1 – Thêm “Emotion Level” helper

**Nơi sửa:**
- Tạo hoặc mở file mới: `src/lib/emotion-utils.ts`

**Yêu cầu (tuỳ nguồn dữ liệu hiện có từ GDELT):**

```ts
export type EmotionLevel = 'negative' | 'balanced' | 'neutral' | 'positive'

// input có thể là tone hoặc combination của tone + goldsteinScale
export function getEmotionLevel(tone?: number | null, goldsteinScale?: number | null): EmotionLevel {
  // MVP:
  // - tone < -5 → 'negative'
  // - -5 <= tone <= 3 → 'balanced'
  // - 3 < tone < 8 → 'neutral'
  // - tone >= 8 → 'positive'
}
```

**Lưu ý cho AI:**
- Nếu `tone` không có, trả về `'balanced'`.
- Chỉ dùng logic đơn giản, không ML.

### 2.3. Bước 2 – Emotion Filter (Balanced / Low negativity)

**Nơi sửa:**
- `src/app/page.tsx` (live feed) **hoặc** `/briefing` nếu muốn thử nghiệm trước.

**Yêu cầu:**
- Thêm một state filter mới, ví dụ:

```ts
type EmotionFilter = 'all' | 'balanced' | 'low-negativity'
const [emotionFilter, setEmotionFilter] = useState<EmotionFilter>('all')
```

- Trước khi tính `processedArticles`, chèn thêm logic:

```ts
if (emotionFilter !== 'all') {
  filtered = filtered.filter(article => {
    const level = getEmotionLevel(article.tone, article.goldsteinScale)
    if (emotionFilter === 'balanced') {
      return level === 'balanced' || level === 'neutral' || level === 'positive'
    }
    if (emotionFilter === 'low-negativity') {
      return level === 'neutral' || level === 'positive'
    }
    return true
  })
}
```

- UI:
  - Thêm một dropdown / toggle đơn giản gần Filter bar:
    - All / Balanced / Low negativity.

### 2.4. Bước 3 – Stop Line Component

**Nơi sửa:**
- Tạo component mới: `src/components/stop-line-card.tsx`

**Yêu cầu:**
- Card đơn giản:
  - Title: “You’ve read enough for now”.
  - Text: “Take a break or switch to deeper explainers”.
  - Hai nút:
    - “Keep Browsing” – đơn giản là callback `onContinue()`.
    - “Show Explainers” – callback `onShowExplainers()`.

Props đề xuất:

```ts
interface StopLineCardProps {
  readCount: number
  onContinue: () => void
  onShowExplainers: () => void
}
```

### 2.5. Bước 4 – Chèn Stop Line vào Feed

**Nơi sửa:**
- `src/app/page.tsx` (trong đoạn map `processedArticles` ra `NewsCard`).

**Chiến lược đơn giản:**
- Định nghĩa:

```ts
const STOP_LINE_THRESHOLD = 12 // hoặc tuỳ theo readingMode/dailyMinutes
const [showBeyondStopLine, setShowBeyondStopLine] = useState(false)
const [showExplainers, setShowExplainers] = useState(false)
```

- Khi render list:
  - Nếu `!showBeyondStopLine`:
    - Render các bài `processedArticles.slice(0, STOP_LINE_THRESHOLD)`.
    - Ngay sau đó render `<StopLineCard ... />`.
  - Nếu `showBeyondStopLine`:
    - Render toàn bộ list (hoặc thêm một stop line lần nữa tuỳ ý).

**Callback:**
- `onContinue` → `setShowBeyondStopLine(true)`.
- `onShowExplainers` → `setShowExplainers(true)` (xem tiếp mục Explainers).

### 2.6. Bước 5 – Explainers / Long Reads Section

**Yêu cầu logic (MVP, chỉ client-side):**
- Từ `articles` hiện tại, chọn ra subset gọi là “explainer candidates”:

```ts
function getExplainers(articles: NewsArticle[]): NewsArticle[] {
  // Ví dụ:
  // - importance >= 60
  // - views trong khoảng trung bình (không quá viral)
  // - ưu tiên nguồn "chính thống"
  // AI có thể hard-code: filter + sort theo importance desc, slice top 5
}
```

- Nếu `showExplainers === true`:
  - Render một section dưới Stop line:
    - Title: “Explainers & Deep Dives”.
    - Dùng `NewsCard` nhưng có nhãn nhỏ “Explainer”.

**Optional (sau này):**
- Tạo tag riêng trên article (vd `article.isExplainer`) nếu muốn.

---

## 3. Phase 3 – Tối ưu & Mở rộng

Sau khi Phase 1 & 2 chạy ổn, AI có thể:

1. **Nâng cấp profile:**
   - Thêm lưu profile lên backend (Prisma / DB) nếu hệ thống có user auth.
   - Đồng bộ giữa nhiều thiết bị.
2. **Tách riêng API Briefing:**
   - Tạo route `src/app/api/briefing/route.ts`:
     - Input: profile đơn giản (categories, minutes, mode).
     - Output: `mustRead`, `niceToKnow`, `explainerCandidates`.
   - Cho phép backend kết hợp thêm data từ SQLite (`db/events_*.db`, `db/gkg_*.db`) để tạo briefing “smart” hơn.
3. **Thêm metrics & tracking:**
   - Đếm “completed briefings per week”.
   - Thử nghiệm A/B: có stop line vs không stop line.

---

## 4. Checklist cho AI trước khi kết thúc mỗi Phase

**Mọi AI thực thi pipeline này phải đảm bảo:**

- **Build không lỗi**:
  - `bun dev` / `next build` chạy được.
  - Không thêm lỗi TypeScript rõ ràng (nếu chưa giải được phải comment rõ).
- **Không phá vỡ behavior cũ**:
  - Trang Pulse gốc vẫn fetch và hiển thị news như trước.
- **Code sạch, tách file rõ ràng:**
  - Types trong `src/types`.
  - Helpers logic trong `src/lib`.
  - UI trong `src/components` hoặc `src/app/...`.
- **Đã test tối thiểu bằng tay:**
  - My Briefing:
    - Thay đổi profile → reload page → profile được giữ lại (nếu đã dùng localStorage).
    - Must Read / Nice to Know hiển thị đúng số lượng dự kiến.
  - Stop line:
    - Thấy stop line sau N bài.
    - Nút “Keep browsing” hoạt động.
    - Nút “Show explainers” hiển thị section explainers.
  - Emotion filter:
    - Chuyển All → Balanced / Low negativity → số bài giảm, nhưng UI không lỗi.

Nếu AI khác tiếp tục làm, hãy bắt đầu từ Phase chưa hoàn thành, đọc lại các file `.md` giải thích (bao gồm file này và `REFRESH_MECHANISM_EXPLAINED.md`, `FILTER_SORT_AND_AUTO_REFRESH_MECHANISM_EXPLAINED.md`, `GDELT_API_MECHANISM_EXPLAINED.md`) trước khi chỉnh sửa mã.

