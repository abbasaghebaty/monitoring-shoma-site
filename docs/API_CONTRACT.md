# قرارداد API نسخه ۱

پاسخ موفق پیشنهادی: `{ "ok": true, "data": ... }`
پاسخ خطا پیشنهادی: `{ "ok": false, "error": { "code": "...", "message": "..." } }`

## مسیرهای برنامه‌ریزی‌شده

- GET /health
- GET /api/v1/dashboard/summary
- GET /api/v1/products
- GET /api/v1/inventory
- GET /api/v1/sales
- GET /api/v1/purchases
- GET /api/v1/customers
- GET /api/v1/suppliers
- GET /api/v1/expenses
- GET /api/v1/invoices
- GET /api/v1/reports

در حال حاضر فقط health پیاده‌سازی شده و بقیه 501 برمی‌گردانند. هیچ صفحه‌ای نباید پاسخ 501 را به عنوان داده خالی یا صفر تفسیر کند.
