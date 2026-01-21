# Phase 3 – Tối ưu & Mở rộng

## 1. Mục tiêu & Triết lý
- Mở rộng khả năng cá nhân hóa, đồng bộ hóa, và thông minh hóa pipeline.
- Đảm bảo mọi nâng cấp đều backward-compatible, không phá vỡ trải nghiệm cũ.

## 2. Giải thích logic & tối ưu hóa

### 2.1. Nâng cấp profile
- Lưu profile lên backend (Prisma/DB) nếu có user auth, đồng bộ đa thiết bị.
- Ưu tiên bảo mật, chỉ lưu thông tin cần thiết.
- Có thể tracking hành vi đọc để gợi ý category, tối ưu hóa cá nhân hóa.

### 2.2. Tách riêng API Briefing
- Tạo route `src/app/api/briefing/route.ts`:
  - Input: profile đơn giản (categories, minutes, mode).
  - Output: mustRead, niceToKnow, explainerCandidates.
- Cho phép backend kết hợp thêm data từ SQLite (`db/events_*.db`, `db/gkg_*.db`) để tạo briefing “smart” hơn (ví dụ: xếp hạng bằng ML, loại trừ tin trùng lặp, v.v.).
- Đảm bảo API luôn có fallback an toàn nếu thiếu dữ liệu.

### 2.3. Thêm metrics & tracking
- Đếm “completed briefings per week”, tracking tiến độ đọc để gợi ý/quảng bá tính năng.
- Thử nghiệm A/B: có stop line vs không stop line, đo lường tác động đến hành vi user.

## 3. Các bước thực hiện (chi tiết code ở file pipeline tổng)
1. Thiết kế schema profile/backend (nếu có auth).
2. Tạo API briefing, implement logic phân nhóm bài ở backend.
3. Tracking metrics, thêm dashboard đơn giản nếu cần.
4. Đảm bảo mọi thay đổi đều backward-compatible.

## 4. Đề xuất cải tiến thông minh hơn
- Sử dụng ML để xếp hạng, gợi ý bài viết, phát hiện chủ đề mới.
- Đề xuất explainers dựa trên lịch sử đọc, không chỉ dựa vào importance.
- Tự động điều chỉnh quota bài/ngày dựa trên hành vi thực tế của user.

---

[Quay lại tổng quan pipeline](../../../INNOVATION_PIPELINE_NEWS_PERSONALIZATION.md)
