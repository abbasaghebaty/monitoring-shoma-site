# Monitoring Shoma Site — Cloudflare Worker API

این Worker لایه API بین GitHub Pages و دیتابیس D1 موجود فروشگاه است.

**نام Worker:** `monitoring-shoma-site` (باید با مقدار `name` در همین پوشه و فایل `wrangler.toml` یکسان باشد).

## اتصال D1
- D1: shop-manager
- Binding: DB
- شناسه D1 با Worker ربات فروشگاه یکسان است.
- GET /health با SELECT 1 اتصال binding را بررسی می‌کند.

هیچ Migration یا SQL تغییردهنده‌ای در این فاز اجرا نمی‌شود. جدول‌های users و attendance و تمام سوابق ورود و خروج باید حفظ شوند.

## احراز هویت
- ورود با Telegram ID و OTP پنج‌دقیقه‌ای از طریق ربات؛ کاربر باید قبلاً ربات را باز کرده و `/start` زده باشد تا Telegram اجازه ارسال پیام خصوصی بدهد.
- نشست ۱۲ ساعته با توکن تصادفی؛ hash نشست در KV ذخیره می‌شود
- Binding مستقل: SITE_AUTH_KV؛ از KV ربات استفاده نکن
- Secretهای لازم: BOT_TOKEN و OTP_PEPPER
- توکن مرورگر فقط در حافظه نگهداری می‌شود؛ پس از refresh ورود دوباره لازم است.
- نقش از جدول users خوانده می‌شود و در هر درخواست بررسی می‌شود.

## مجوزها
- owner و manager: منابع مدیریتی خواندنی
- employee: فقط سوابق attendance خودش
- API داده‌ها فقط GET است؛ هیچ عملیات نوشتنی فعال نیست.

## مسیرهای پیاده‌سازی‌شده
- GET /health
- POST /api/v1/auth/request-otp
- POST /api/v1/auth/verify-otp
- POST /api/v1/auth/logout
- GET /api/v1/auth/me
- GET /api/v1/dashboard/summary
- GET /api/v1/products
- GET /api/v1/inventory
- GET /api/v1/sales و GET /api/v1/sales/:id
- GET /api/v1/debts
- GET /api/v1/customers
- GET /api/v1/attendance
- GET /api/v1/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD

مسیرهای خرید، تأمین‌کنندگان، هزینه‌ها و فاکتور چندقلمی عمداً فعال نیستند؛ جدول متناظر در schema تأییدشده وجود ندارد.

## راه‌اندازی Cloudflare
1. یک KV Namespace جدید بساز و ID آن را در بخش SITE_AUTH_KV فایل worker/wrangler.toml ثبت کن.
2. Secret با نام BOT_TOKEN را برای Worker با نام `monitoring-shoma-site` تنظیم کن؛ مقدار آن باید توکن همان ربات فعال فروشگاه باشد که Webhook ربات اصلی از آن استفاده می‌کند.
3. Secret مستقل OTP_PEPPER را برای همان Worker تنظیم کن.
4. Worker با نام دقیق `monitoring-shoma-site` را Deploy کن؛ نام را با مقدار `name` در `wrangler.toml` تغییر نده.
5. /health را بررسی کن.

مراحل کامل و چک‌لیست آزمون: ../docs/IMPLEMENTATION_STATUS.md

## نکته امنیتی
Cloudflare KV برای مصرف OTP اتمیک تضمین نمی‌کند؛ درخواست‌های هم‌زمان ممکن است race داشته باشند. پیش از استفاده حساس، این بخش باید با Durable Object یا ذخیره‌سازی اتمیک تقویت شود. CORS و عدم استفاده از cookie، مشکل third-party cookie در GitHub Pages را دور می‌زند؛ توکن فقط در حافظه صفحه نگهداری می‌شود.
