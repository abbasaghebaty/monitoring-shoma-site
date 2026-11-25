# وضعیت پیاده‌سازی اتصال سایت به D1

آخرین به‌روزرسانی: 2026-11-25

## تغییرات این شاخه
- ورود با Telegram ID و OTP پنج‌دقیقه‌ای از طریق Telegram Bot API اضافه شده است.
- OTP به‌صورت hash در KV نگهداری می‌شود؛ کد خام در KV ذخیره نمی‌شود.
- ارسال OTP پاسخ JSON تلگرام را هم بررسی می‌کند؛ خطای واقعی Telegram API با کد و توضیح در Worker Logs ثبت می‌شود، بدون ثبت توکن یا خود کد ورود.
- مهلت ارسال مجدد فقط پس از تأیید موفقیت ارسال توسط تلگرام فعال می‌شود؛ در شکست ارسال، OTP و cooldown پاک می‌شوند تا کاربر بتواند دوباره درخواست دهد.
- کاربر باید پیش از اولین پیام خصوصی، ربات را در تلگرام باز کند و `/start` بزند.
- نشست با توکن تصادفی ایجاد می‌شود و فقط hash توکن در KV ذخیره می‌شود.
- توکن نشست فقط در حافظه مرورگر نگهداری می‌شود؛ پس از refresh صفحه، ورود مجدد لازم است.
- هویت و نقش هر درخواست خصوصی از جدول users دوباره بررسی می‌شود؛ فقط نقش‌های owner، manager و employee معتبرند و OTP و middleware نشست هر دو whitelist را کنترل می‌کنند.
- نقش‌های معتبر فقط برای شناسایی حساب در ورود استفاده می‌شوند؛ همه نقش‌های معتبر پس از ورود، دسترسی یکسان به بخش‌ها و عملیات سایت دارند.
- محصولات، قیمت‌ها و موجودی از products و product_prices و inventory خوانده می‌شوند.
- فروش، بدهی، مشتری و حضور و غیاب با ستون‌های واقعی schema خوانده می‌شوند.
- داشبورد و گزارش فروش بازه‌ای به queryهای D1 متصل شده‌اند.
- APIهای خواندنی موجود حفظ شده‌اند؛ برای محصولات فقط POST ایجاد و PATCH ویرایش مشخصات/قیمت با مجوز owner/manager اضافه شده است.
- ویرایش کالا فقط ستون‌های واقعاً تغییرکرده را با optimistic concurrency control می‌نویسد؛ Snapshot stale با 409 رد می‌شود.
- زنجیرهٔ Migration شامل baseline کامل و Audit است؛ هر دو فایل در SQLite و D1 محلی از دیتابیس خالی اجرا می‌شوند. Production اجرا نشده است.
- مسیر موقت schema inspection از Router عمومی خارج شده است.
- Frontend صفحه ورود، وضعیت‌های loading/error/empty و جدول‌های داده واقعی را دارد.
- GitHub Actions مقدار عمومی VITE_API_BASE_URL را از Repository Variable می‌گیرد.

## مدیریت اجناس در شاخه feature
- فهرست کالاها از D1 با جست‌وجوی نام/شناسه، فیلتر موجودی و pagination خوانده می‌شود.
- ایجاد محصول، قیمت اولیه و رویداد Audit در یک D1 batch انجام می‌شود؛ Trigger موجود ردیف موجودی صفر را می‌سازد و شکست Audit/قیمت کل batch را Rollback می‌کند.
- ویرایش فقط فیلدهای تغییرکرده را با compare-and-swap روی Snapshot کامل ذخیره می‌کند؛ تغییر هم‌زمان پاسخ 409 دارد.
- رویدادهای CREATE/UPDATE در `product_audit_log` با actor، product، مقادیر قبلی/جدید، زمان و request ID یکتا ثبت می‌شوند.
- ویرایش شناسه اصلی، موجودی، سوابق فروش یا جدول‌های مالی انجام نمی‌شود.
- بارکد، دسته‌بندی، وضعیت فعال/غیرفعال و حداقل موجودی در schema تأییدشده وجود ندارند؛ حذف/غیرفعال‌سازی فعال نشده است.
- هیچ Migration یا SQL تغییردهنده‌ای روی Production اجرا نشده است. تست‌ها baseline و audit را فقط روی SQLite in-memory و D1 محلی Miniflare اجرا می‌کنند.

## محدودیت‌های آگاهانه
1. جدول‌های users و attendance و سوابق آن‌ها در baseline حفظ شده‌اند؛ Migrationها هیچ DROP یا بازنویسی داده‌ای ندارند. وضعیت فیزیکی دیتابیس میزبانی‌شده در این مرحله بررسی نشده است.
2. خریدها، تأمین‌کنندگان، هزینه‌ها، فاکتور چندقلمی و پرداخت چندمرحله‌ای API ندارند؛ schema فعلی آن‌ها را پشتیبانی نمی‌کند.
3. پرداخت بدهی و اصلاح فروش فعال نیستند؛ فروش immutable است و ledger پرداخت وجود ندارد.
4. ارتباط مستقیم customers به sales وجود ندارد؛ سایت تاریخچه خرید مشتری را جعل نمی‌کند.
5. KV برای مصرف OTP تضمین اتمیک نمی‌دهد؛ دو درخواست هم‌زمان ممکن است race داشته باشند. قبل از استفاده حساس، این بخش باید به Durable Object یا سازوکار اتمیک ارتقا یابد.
6. گزارش‌های تاریخ‌محور فعلاً تاریخ ISO میلادی YYYY-MM-DD می‌گیرند.
7. مقدار KV در worker/wrangler.toml باید با namespace مستقل سایت تطبیق داده شود؛ از KV ربات استفاده نکن.

## راه‌اندازی الزامی Cloudflare
1. یک KV Namespace مستقل با نامی مثل shoma-site-auth بساز.
2. ID واقعی آن را در بخش SITE_AUTH_KV فایل worker/wrangler.toml ثبت کن؛ از KV ربات استفاده نکن.
3. برای Worker با نام دقیق `monitoring-shoma-site` (همان مقدار `name` در worker/wrangler.toml) دو Secret تنظیم کن:
   - BOT_TOKEN: توکن رباتی که کاربران مجاز از قبل با آن تعامل دارند.
   - OTP_PEPPER: مقدار تصادفی مستقل و بلند؛ هرگز آن را در Git یا Frontend قرار نده.
4. در GitHub Repository Settings → Secrets and variables → Actions → Variables، متغیر VITE_API_BASE_URL را با origin کامل Worker تنظیم کن. account subdomain را از Cloudflare بردار؛ آن را حدس نزن.
5. همان Worker یعنی `monitoring-shoma-site` را Deploy کن.
6. مسیر /health را بررسی کن؛ باید database: connected برگرداند.
7. پس از merge به main، GitHub Actions سایت را build و منتشر می‌کند.

## چک‌لیست آزمون
- [ ] ساخت KV مستقل و ثبت ID واقعی در SITE_AUTH_KV
- [ ] تنظیم BOT_TOKEN و OTP_PEPPER در Worker Secrets مربوط به monitoring-shoma-site
- [ ] Deploy موفق Worker و بررسی /health
- [ ] تنظیم GitHub Actions Variable
- [ ] موفقیت build در Pull Request و انتشار Pages پس از merge
- [ ] OTP برای کاربر فعال ارسال شود
- [ ] کاربر غیرفعال یا ناشناخته نتواند وارد شود
- [ ] درخواست بدون نشست 401 و نقش نامجاز 403 بگیرد
- [ ] تمام نقش‌های معتبر بتوانند منابع خواندنی پنل را ببینند و عملیات نوشتنی برای employee همچنان رد شود
- [ ] داده‌های محصولات، فروش، بدهی، مشتری و attendance با D1 تطبیق داده شوند
- [ ] هیچ جدول یا سابقه Production D1 تغییر نکرده باشد

## وضعیت انتشار
Commit در شاخه توسعه به‌تنهایی به معنی Deploy نیست. تا وقتی KV و Secrets در Cloudflare تنظیم نشده‌اند، Worker آماده انتشار عملیاتی نیست.


## تست‌های خودکار شاخه feature
- Node.js 22 و `node:sqlite` برای اجرای SQLite واقعی درون‌حافظه‌ای استفاده می‌شوند.
- CI آخرین اجرا: 42 تست Node/SQLite و 10 تست Workers Vitest روی D1 محلی Miniflare موفق؛ Vite build نیز موفق. Run: 45041773753.
- fixture دستی حذف شده است؛ SQLite و Miniflare هر دو فایل‌های واقعی 0000_baseline.sql و 0001_product_audit_log.sql را به‌ترتیب اجرا می‌کنند. تطبیق دقیق Triggerهای D1 میزبانی‌شده همچنان نیازمند بررسی Dashboard است.


## وضعیت canonical schema

- Migration 0000_baseline.sql دیتابیس خالی را با 9 جدول دامنه، FKها، CHECKها، indexها و Triggerهای عملیاتی می‌سازد.
- Migration 0001_product_audit_log.sql جدول Audit و قیود JSON/operation/request_id و Triggerهای append-only را اضافه می‌کند.
- تست‌های Worker و D1 از همین Migrationها استفاده می‌کنند؛ schema fixture دستی حذف شده است.
- Migrationها فقط روی SQLite in-memory و D1 محلی Miniflare اجرا شده‌اند. هیچ Migration/SQL تغییردهنده‌ای روی Production اجرا نشده است.
- Baseline با IF NOT EXISTS برای دیتابیس موجود non-destructive است، اما schema ناسازگار موجود را repair نمی‌کند؛ پیش از هر اجرای remote، schema preflight الزامی است.


## توسعه افزایشی فضای مدیریت انبار

- [x] زیرمنوی مستقل و واکنش‌گرا برای مدیریت کالا و انبار به Frontend اضافه شد.
- [x] نمای کلی به API فعلی داشبورد متصل شد.
- [x] فهرست موجودی به endpoint فعلی و فقط‌خواندنی متصل شد.
- [x] مدیریت محصول به صفحه CRUD فعلی پیوند داده شد؛ منطق موجود تکرار یا جایگزین نشد.
- [x] صفحات ساختاری دسته‌بندی، برند، انبار، موقعیت، گردش، اصلاح، انتقال، تأمین‌کننده، سفارش خرید، دریافت، سفارش مجدد، انبارگردانی، تقویم، تحلیل، گزارش و تنظیمات اضافه شدند.
- [x] هیچ فایل قبلی حذف نشد و هیچ Migration یا تغییر D1 انجام نشد.
- [ ] اتصال دامنه‌های فاقد API پس از بررسی read-only schema و طراحی Migration سازگار انجام شود.
- [ ] build و تست‌های CI این شاخه باید از طریق Pull Request بررسی شوند؛ تا قبل از اجرای موفق CI، صحت build تأییدشده محسوب نمی‌شود.


## Inventory workspace integration — phase 1
- Added additive migration 0002 for categories, brands, warehouses, warehouse locations, product metadata fields and append-only workspace audit.
- Added authenticated Worker list/create/update routes for the four master-data entities. Writes are restricted to owner/manager and use updated_at compare-and-swap plus transactional audit.
- Added frontend API methods and CRUD form/table view for those four sections.
- Multi-warehouse stock, movement ledger, purchase/receiving and adjustments remain intentionally inactive until a stock ledger is designed to preserve existing sales triggers.
- Migration 0002 has not been applied to hosted D1; CI/local migration tests are the required validation boundary.
