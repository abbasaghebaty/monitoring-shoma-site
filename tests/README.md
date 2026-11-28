# آزمون‌ها

## منبع Schema تست

تمام تست‌های دیتابیس از Migrationهای واقعی repository استفاده می‌کنند؛ schema fixture دستی حذف شده است.

ترتیب canonical:
1. worker/migrations/0000_baseline.sql
2. worker/migrations/0001_product_audit_log.sql
3. worker/migrations/0002_inventory_master_data.sql
4. worker/migrations/0003_attendance_and_auth_integrity.sql

## فرمان‌ها

از ریشهٔ repository:

- `npm test --prefix worker` — تست‌های Node.js با SQLite in-memory؛ helper همان Migrationها را به‌ترتیب اعمال می‌کند.
- `npm run test:d1` — تست Workers Vitest روی D1 محلی Miniflare؛ فایل‌های Migration از vitest.config.js به binding تست تزریق و از دیتابیس خالی اعمال می‌شوند.
- `npm run build` — ساخت Frontend.

## پوشش دیتابیس

- ایجاد Schema از دیتابیس خالی و اجرای دوبارهٔ baseline idempotent
- Foreign Keyها، CHECKها، generated columns و Triggerهای عملیاتی
- ایجاد محصول و ایجاد خودکار قیمت/موجودی
- ثبت فروش، کسر موجودی، ایجاد بدهی و immutable بودن فروش
- خواندن repositoryهای products, inventory, sales, debts, customers و attendance و داشبورد
- Audit create/update، JSON constraints و immutable بودن
- rollback batch و failure guard
- هم‌زمانی دو درخواست با Snapshot یکسان و پاسخ 409 برای بازنده
- محدودیت یکتای ورود باز و هم‌زمانی check-in
- ماتریس Permission نقش‌ها
- سازگاری مجموع، داده روزانه و توزیع کانال در گزارش فروش

## مرز تست

Node SQLite، SQLite واقعی است اما Cloudflare D1 نیست. Workers Vitest/Miniflare از D1 محلی و Worker runtime شبیه‌سازی‌شده استفاده می‌کند؛ این تست نیز Production یا hosted D1 را هدف نمی‌گیرد. تطبیق DDL و Triggerهای فعلی Cloudflare با Migration canonical باید read-only در Dashboard انجام شود.
