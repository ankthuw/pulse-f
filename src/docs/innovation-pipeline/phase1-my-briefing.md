# Phase 1 – My Briefing (Profile + Curated Feed + Progress)

## 1. Mục tiêu & Triết lý

- Tạo trải nghiệm bản tin cá nhân hóa 5–10 phút/ngày, giúp người dùng cập nhật nhanh, tránh quá tải thông tin.
- Ưu tiên đơn giản, không phụ thuộc backend, dễ mở rộng về sau.
- Tách rõ giữa logic dữ liệu (lọc, phân loại) và UI/UX.

## 2. Giải thích logic & tối ưu hóa

### 2.1. User Profile
- Cho phép người dùng chọn lĩnh vực, ngôn ngữ, chế độ đọc (quick/deep), thời lượng mong muốn.
- Lưu profile ở localStorage (ưu tiên privacy, không cần đăng nhập).
- Đảm bảo không dùng localStorage ở server component (SSR safe).

### 2.2. Lọc & phân loại bài viết
- Lấy dữ liệu từ `/api/news` (có thể lấy tất cả, filter client-side để đơn giản MVP).
- Lọc theo category nếu user chọn, nếu không thì lấy tất cả.
- Sắp xếp theo `importance` giảm dần (ưu tiên bài quan trọng), nếu bằng thì theo `views`.
- Mapping số lượng bài dựa trên profile:
  - Quick: 4–6 bài/10 phút, Deep: 8–12 bài/10 phút (có thể hard-code mapping, ví dụ 1 phút ~ 0.5–1 bài).
- Chia thành 2 nhóm:
  - **Must Read**: Top N bài quan trọng nhất (ví dụ 3–5 bài).
  - **Nice to Know**: Phần còn lại trong quota.
- Lưu ý: Luôn đảm bảo tổng số bài không vượt quá quota theo thời gian user chọn.

### 2.3. Theo dõi tiến độ đọc
- Khi user đọc bài (click card hoặc nút), đánh dấu đã đọc (giữ trong state, có thể lưu localStorage nếu muốn).
- Hiển thị progress: “X/Y articles • Z%”.
- UX: Thanh tiến độ rõ ràng, động viên hoàn thành.

### 2.4. Tối ưu trải nghiệm
- Không làm chậm trang chính, không ảnh hưởng feed gốc.
- Cho phép user chỉnh profile nhanh chóng, thấy ngay kết quả.
- Tái sử dụng NewsCard, không tạo UI mới trừ khi cần.
- Đảm bảo mọi logic đều có fallback an toàn (profile lỗi, không có bài, v.v.).

## 3. Các bước thực hiện (chi tiết code ở file pipeline tổng)
1. Định nghĩa type UserProfile (src/types/user-profile.ts).
2. Viết helper load/save profile (src/lib/user-profile.ts).
3. Tạo UI chỉnh profile (src/components/my-briefing-settings.tsx).
4. Tạo route briefing (src/app/briefing/page.tsx), implement logic lọc, chia nhóm, progress.
5. Tích hợp UI hiện có, đảm bảo không phá vỡ behavior cũ.

## 4. Đề xuất cải tiến thông minh hơn
- Có thể gợi ý category dựa trên hành vi đọc (nếu tracking về sau).
- Sử dụng ML để xếp hạng bài (sau này), hiện tại ưu tiên rule-based để dễ kiểm soát.
- Cho phép user “bỏ qua” bài không thích, cá nhân hóa mạnh hơn.

---

[Quay lại tổng quan pipeline](../../../INNOVATION_PIPELINE_NEWS_PERSONALIZATION.md)
