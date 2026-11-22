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
- ورود با Telegram ID و OTP پنج‌دقیقه‌ای از طریق Telegram Bot API؛ کاربر باید قبلاً ربات را باز کرده و `/start` زده باشد.
- نشست ۱۲ ساعته با توکن تصادفی؛ hash نشست در KV ذخیره می‌شود.
- Binding مستقل: SITE_AUTH_KV؛ از KV ربات استفاده نکن.
- Secretهای لازم: BOT_TOKEN و OTP_PEPPER.
- توکن مرورگر فقط در حافظه نگهداری می‌شود؛ پس از refresh ورود دوباره لازم است.
- نقش از جدول users خوانده می‌شود و در هر درخواست بررسی می‌شود.

## مجوزها
- owner و manager: منابع مدیریتی خواندنی
- employee: فقط سوابق attendance خودش
- منابع عملیاتی به‌صورت پیش‌فرض فقط خواندنی‌اند؛ تنها استثنا، ایجاد و ویرایش محدود کالا برای owner/manager است.
- کارمند اجازه ایجاد یا ویرایش کالا ندارد.

## مسیرهای پیاده‌سازی‌شده
- GET /health
- POST /api/v1/auth/request-otp
- POST /api/v1/auth/verify-otp
- POST /api/v1/auth/logout
- GET /api/v1/auth/me
- GET /api/v1/dashboard/summary
- GET /api/v1/products?q=&stock=&limit=&offset=
- POST /api/v1/products (owner/manager)
- PATCH /api/v1/products/:productId (owner/manager)
- GET /api/v1/inventory
- GET /api/v1/sales و GET /api/v1/sales/:id
- GET /api/v1/debts
- GET /api/v1/customers
- GET /api/v1/attendance
- GET /api/v1/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD

مسیرهای خرید، تأمین‌کنندگان، هزینه‌ها و فاکتور چندقلمی عمداً فعال نیستند؛ جدول متناظر در schema تأییدشده وجود ندارد. حذف کالا، وضعیت فعال/غیرفعال و تغییر موجودی نیز تا طراحی schema سازگار و قابل حسابرسی فعال نمی‌شوند.

## راه‌اندازی Cloudflare
1. یک KV Namespace مستقل بساز و ID آن را در بخش SITE_AUTH_KV فایل worker/wrangler.toml ثبت کن.
2. Secret با نام BOT_TOKEN را برای Worker با نام `monitoring-shoma-site` تنظیم کن؛ مقدار آن باید توکن همان ربات فعال فروشگاه باشد که Webhook ربات اصلی از آن استفاده می‌کند.
3. Secret مستقل OTP_PEPPER را برای همان Worker تنظیم کن.
4. Worker با نام دقیق `monitoring-shoma-site` را Deploy کن؛ نام را با مقدار `name` در `wrangler.toml` تغییر نده.
5. /health را بررسی کن.

مراحل کامل و چک‌لیست آزمون: ../docs/IMPLEMENTATION_STATUS.md

## تشخیص خطا و پیگیری درخواست

- برای هر درخواست، Worker یک `requestId` تولید می‌کند؛ در JSON و هدر `X-Request-ID` برمی‌گرداند.
- اگر Cloudflare Ray ID موجود باشد، در `meta.rayId` و هدر `X-CF-Ray` درج می‌شود.
- لاگ‌ها ساختاریافته‌اند و timestamp، requestId، rayId و stage دارند.
- برای خطای OTP در Cloudflare Dashboard به **Workers & Pages → monitoring-shoma-site → Logs → Live** برو و با requestId همان درخواست را دنبال کن.
- برای خطای تلگرام، رویدادهای `AUTH_DIAGNOSTIC_FAILURE`، `AUTH_DIAGNOSTIC_DETAILS` و `OTP_DELIVERY_FAILED` را بررسی کن. فیلدهای کنترل‌شدهٔ تلگرام `httpStatus`، `telegramErrorCode`، `telegramDescription` و `retryAfter` هستند.
- `httpStatus: null` معمولاً یعنی Fetch پیش از دریافت پاسخ HTTP شکست خورده؛ status عددی همراه کد خطای تلگرام نشان می‌دهد API پاسخ داده است.
- برای `CONFIG_001`، رویداد `AUTH_CONFIG_MISSING` فقط نام تنظیمات مفقود را ثبت می‌کند.
- OTP، Session Token، BOT_TOKEN، OTP_PEPPER، hashها و اطلاعات شخصی کاربران وارد لاگ نمی‌شوند.

**ضد کشف حساب:** برای شناسهٔ ناشناخته، غیرفعال، محدودشده و خطای ارسال، request-otp پاسخ عمومی یکسان HTTP 202 با `status: unconfirmed` می‌دهد و موفقیت ارسال را اعلام نمی‌کند. تشخیص دقیق فقط در لاگ داخلی انجام می‌شود.

مرجع کامل کدهای خطا، مراحل و روش عیب‌یابی: [../docs/AUTH_DIAGNOSTICS.md](../docs/AUTH_DIAGNOSTICS.md)

## نکته امنیتی
Cloudflare KV برای مصرف OTP اتمیک تضمین نمی‌کند؛ درخواست‌های هم‌زمان ممکن است race داشته باشند. پیش از استفاده حساس، این بخش باید با Durable Object یا ذخیره‌سازی اتمیک تقویت شود. CORS و عدم استفاده از cookie، مشکل third-party cookie در GitHub Pages را دور می‌زند؛ توکن فقط در حافظه صفحه نگهداری می‌شود.

## نقش‌ها، ویرایش هم‌زمان و Audit کالا

- نقش‌های معتبر: `owner`، `manager` و `employee`. نقش خارج از این فهرست در OTP رد می‌شود و middleware نشست نیز مستقلاً نقش جاری دیتابیس و نشست را بررسی می‌کند.
- ویرایش کالا فقط فیلدهای واقعاً تغییرکرده را می‌نویسد. Snapshot کامل پایه و قیمت‌ها به‌عنوان optimistic concurrency token استفاده می‌شود؛ درخواست stale پاسخ 409 می‌گیرد.
- Audit کالا با عملیات محصول در یک D1 batch ثبت می‌شود. شکست guard یا درج Audit کل batch را Rollback می‌کند.
- Migration افزایشی: `migrations/0001_product_audit_log.sql`.
- تست‌ها با SQLite واقعی in-memory و schema/trigger fixture اجرا می‌شوند: `npm test`. این تست‌ها D1 runtime واقعی Cloudflare، replication یا تنظیمات Dashboard را اثبات نمی‌کنند.

### اجرای Migration در محیط محلی آزمایشی

فقط برای یک دیتابیس محلی/آزمایشی:

```sh
npx wrangler d1 migrations apply shop-manager --local --config worker/wrangler.toml
```

هرگز `--local` را حذف نکنید. این پروژه در این PR Migration را روی Production اجرا نمی‌کند. Migration تولیدی نیازمند تأیید جداگانه و backup/rollback plan است.

> تست SQLite از fixture بازسازی‌شده بر پایهٔ snapshot مستندشده استفاده می‌کند. پیش از Production، تعریف واقعی Triggerهای D1 باید به‌صورت read-only با fixture مقایسه شود؛ CI به D1 زنده متصل نمی‌شود.
