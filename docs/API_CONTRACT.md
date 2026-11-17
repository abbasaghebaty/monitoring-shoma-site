# قرارداد API نسخه ۱

## قالب پاسخ

موفق:
`{ "ok": true, "data": ... }`

خطا:
`{ "ok": false, "error": { "code": "...", "message": "..." } }`

همه مسیرهای خصوصی باید پس از پیاده‌سازی احراز هویت، نشست معتبر و مجوز مناسب را بررسی کنند.

## مسیر تشخیصی موقت

- GET /health
- GET /api/v1/admin/schema — فقط metadata جدول‌ها/ستون‌ها/indexها/triggerها؛ نیازمند secret موقت و باید پس از مستندسازی schema حذف شود.

## مسیرهای داده برنامه‌ریزی‌شده

- GET /api/v1/dashboard/summary
- GET /api/v1/products
- GET /api/v1/inventory
- GET /api/v1/sales
- GET /api/v1/sales/:id
- GET /api/v1/purchases
- GET /api/v1/customers
- GET /api/v1/debts
- GET /api/v1/shortages
- GET /api/v1/attendance
- GET /api/v1/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&channel=...

گزارش‌ها از رویدادهای خام در زمان درخواست محاسبه می‌شوند؛ summaryها به‌عنوان داده مستقل در D1 ذخیره نمی‌شوند.

## عملیات نوشتن آینده

- POST/PATCH /api/v1/products
- POST /api/v1/sales
- POST /api/v1/purchases
- POST /api/v1/customers
- POST /api/v1/attendance

این مسیرها تا زمان طراحی احراز هویت، مجوز، idempotency، تراکنش اتمیک و سازگاری با ربات فعال نخواهند شد.
