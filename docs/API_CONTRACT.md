# قرارداد API نسخه ۱

## پاسخ‌ها
موفق: { "ok": true, "data": ... }
خطا: { "ok": false, "error": { "code": "...", "message": "..." } }

همه پاسخ‌های خصوصی Cache-Control: no-store دارند. مرورگر نشست را در Authorization: Bearer <token> می‌فرستد.

## احراز هویت
- POST /api/v1/auth/request-otp — body: { "telegramId": "..." }
- POST /api/v1/auth/verify-otp — body: { "telegramId": "...", "code": "000000" }
- POST /api/v1/auth/logout
- GET /api/v1/auth/me

کد OTP پنج دقیقه اعتبار دارد و پس از پنج تلاش ناموفق حذف می‌شود. نشست حداکثر ۱۲ ساعت اعتبار دارد. نقش در هر درخواست از رکورد فعال users دوباره بررسی می‌شود.

## منابع خواندنی
- GET /health
- GET /api/v1/dashboard/summary
- GET /api/v1/products?q=&limit=&offset=
- GET /api/v1/inventory?q=&limit=&offset=
- GET /api/v1/sales?from=&to=&channel=&limit=&offset=
- GET /api/v1/sales/:id
- GET /api/v1/debts?status=open|settled&limit=&offset=
- GET /api/v1/customers?q=&limit=&offset=
- GET /api/v1/attendance?from=&to=&limit=&offset=
- GET /api/v1/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&channel=

## مجوز
- owner و manager: منابع مدیریتی خواندنی
- employee: فقط attendance خودش
- هر مسیر داده بدون نشست معتبر رد می‌شود.
- نقش یا شناسه کاربر از Frontend برای تعیین مجوز پذیرفته نمی‌شود.

## موارد خارج از schema
API خرید، تأمین‌کننده، هزینه، invoice چندقلمی، ledger پرداخت و تاریخچه پرداخت بدهی در این نسخه وجود ندارد. جدول‌های متناظر در schema تأییدشده نیستند؛ نباید داده‌ای جعل شود.

## اصول داده
- محصولات از products و join با product_prices و inventory خوانده می‌شوند.
- فروش از sales و بدهی از debts.sale_id خوانده می‌شود.
- attendance فقط SELECT است و هیچ write endpoint برای آن وجود ندارد.
- هیچ migration یا تغییر D1 در این شاخه انجام نمی‌شود.
