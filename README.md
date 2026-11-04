# Inventory Cloud MVP

Ứng dụng quản lý kho cơ bản:
- React + TypeScript + Vite frontend
- FastAPI + SQLAlchemy backend
- PostgreSQL khi triển khai cloud (SQLite được hỗ trợ cho local development)
- Nhập/xuất kho, danh mục hàng, đối tác, thanh toán/công nợ, xuất Excel

## Cảnh báo trước khi dùng thật
Đây là bộ khung MVP để phát triển tiếp, chưa phải hệ thống kế toán/kho đã được kiểm toán.
Trước khi dùng dữ liệu thật:
1. Đổi `SECRET_KEY`, đặt mật khẩu mạnh và cấu hình HTTPS.
2. Thêm đăng nhập/ủy quyền đầy đủ, giới hạn truy cập API.
3. Thiết lập backup PostgreSQL tự động và kiểm thử phục hồi.
4. Thêm migration (Alembic), test nghiệp vụ, nhật ký kiểm toán, chống sửa/xóa phiếu đã chốt.
5. Dùng dịch vụ PostgreSQL managed hoặc persistent volume; không lưu database trên filesystem tạm của container.
6. Không đặt SQLite trên ổ mạng hoặc thư mục chia sẻ để nhiều thiết bị cùng ghi.

## Chạy local bằng Docker
Yêu cầu: Docker Desktop.

```bash
cp .env.example .env
docker compose up --build
```

Mở:
- Frontend: http://localhost:5173
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

Frontend hiện gọi API ở `VITE_API_URL` (mặc định `http://localhost:8000`).

## Cấu trúc
- `backend/app/main.py`: API routes và nghiệp vụ MVP
- `frontend/src/App.tsx`: giao diện demo
- `docker-compose.yml`: môi trường local

## Deploy cloud
1. Đưa repo lên GitHub.
2. Tạo dịch vụ web/container cho backend và frontend trên nhà cung cấp cloud.
3. Tạo PostgreSQL managed, lấy connection URL.
4. Set `DATABASE_URL`, `SECRET_KEY`, `CORS_ORIGINS` ở environment variables.
5. Deploy frontend static site với `VITE_API_URL` trỏ tới backend HTTPS.
6. Cấu hình custom domain + HTTPS và backup database.
7. Không dùng `.env` trong Git; chỉ commit `.env.example`.

Cloud provider cụ thể có thể là Render, Railway, Fly.io, Azure, AWS hoặc dịch vụ tương đương. Chi phí, cấu hình và chính sách lưu trữ cần kiểm tra tại thời điểm triển khai.

## Quy tắc tồn kho / công nợ
- Chỉ phiếu ở trạng thái `posted` mới ảnh hưởng tồn kho.
- Phiếu nhập làm tăng tồn; phiếu xuất làm giảm tồn.
- Không cho xuất vượt tồn khả dụng.
- Công nợ phát sinh từ phiếu mua/bán đã chốt, trừ các thanh toán gắn với phiếu.
- Mỗi dòng thanh toán được gắn một phiếu để đơn giản hóa MVP. Muốn thanh toán gộp nhiều phiếu cần thêm bảng phân bổ thanh toán.
- Mẫu hiện tại dùng một kho, một loại tiền tệ (VND), không quản lý lô/hạn dùng/serial.
