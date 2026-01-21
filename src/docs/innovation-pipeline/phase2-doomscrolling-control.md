# Phase 2 – Doomscrolling Control (Stop Line + Explainers + Emotion Filter)

## 1. Mục tiêu & Triết lý
- Giảm nguy cơ doomscrolling, giúp người dùng kiểm soát lượng tin tiêu cực, chuyển hướng sang nội dung sâu/chất lượng hơn.
- Đảm bảo mọi thay đổi đều không phá vỡ trải nghiệm feed gốc.

## 2. Giải thích logic & tối ưu hóa

### 2.1. Emotion Level & Filter
- Định nghĩa hàm getEmotionLevel dựa trên `tone`:
  - tone < -5 → 'negative'
  - -5 <= tone <= 3 → 'balanced'
  - 3 < tone < 8 → 'neutral'
  - tone >= 8 → 'positive'
- Filter bài viết theo cảm xúc:
  - 'all': không lọc
  - 'balanced': chỉ giữ balanced/neutral/positive
  - 'low-negativity': chỉ giữ neutral/positive
- UX: Dropdown/toggle đơn giản, feedback rõ ràng khi filter làm giảm số bài.

### 2.2. Stop Line
- Sau N bài (tuỳ readingMode/dailyMinutes, mặc định 12), chèn StopLineCard:
  - Nhắc user dừng lại, gợi ý chuyển sang Explainers.
  - Hai nút: “Keep Browsing” (hiện tiếp feed), “Show Explainers” (hiện section explainers).
- UX: Card nổi bật, không gây khó chịu, cho phép user kiểm soát tiếp tục hay không.

### 2.3. Explainers/Long Reads
- Lọc các bài có importance cao, views trung bình, nguồn chính thống (có thể hard-code rule cho MVP).
- Khi user chọn “Show Explainers”, hiện section riêng với các bài này, gắn nhãn “Explainer”.
- UX: Section rõ ràng, dễ phân biệt với feed thường.

## 3. Các bước thực hiện (chi tiết code ở file pipeline tổng)
1. Viết helper getEmotionLevel (src/lib/emotion-utils.ts).
2. Thêm state emotionFilter, filter bài trước khi render (src/app/page.tsx hoặc /briefing).
3. Tạo component StopLineCard (src/components/stop-line-card.tsx).
4. Chèn StopLineCard vào feed, xử lý logic showBeyondStopLine/showExplainers.
5. Lọc và render Explainers section khi cần.

## 4. Đề xuất cải tiến thông minh hơn
- Có thể cá nhân hóa ngưỡng stop line dựa trên profile/hành vi đọc.
- Gợi ý explainers dựa trên chủ đề user quan tâm, không chỉ dựa vào importance.
- Tracking số lần user vượt stop line để tối ưu UX về sau.

---

[Quay lại tổng quan pipeline](../../../INNOVATION_PIPELINE_NEWS_PERSONALIZATION.md)
