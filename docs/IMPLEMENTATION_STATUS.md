# وضعیت پیاده‌سازی اتصال سایت به D1

آخرین به‌روزرسانی: 2026-11-17

## تغییرات این شاخه
- ورود با Telegram ID و OTP پنج‌دقیقه‌ای از طریق Telegram Bot API اضافه شده است.
- OTP به‌صورت hash در KV نگهداری می‌شود؛ کد خام در KV ذخیره نمی‌شود.
- نشست با توکن تصادفی ایجاد می‌شود و فقط hash توکن در KV ذخیره می‌شود.
- توکن نشست فقط در حافظه مرورگر نگهداری می‌شود؛ پس از refresh صفحه، ورود مجدد لازم است.
- هویت و نقش هر درخواست خصوصی از جدول users دوباره بررسی می‌شود.
- نقش employee فقط به سوابق حضور و غیاب خودش دسترسی دارد؛ owner و manager به منابع مدیریتی خواندنی دسترسی دارند.
- محصولات، قیمت‌ها و موجودی از products و product_prices و inventory خوانده می‌شوند.
- فروش، بدهی، مشتری و حضور و غیاب با ستون‌های واقعی schema خوانده می‌شوند.
- داشبورد و گزارش فروش بازه‌ای به queryهای D1 متصل شده‌اند.
- API داده‌ها فقط‌خواندنی است؛ هیچ endpoint نوشتنی ایجاد نشده است.
- مسیر موقت schema inspection از Router عمومی خارج شده است.
- Frontend صفحه ورود، وضعیت‌های loading/error/empty و جدول‌های داده واقعی را دارد.
- GitHub Actions مقدار عمومی VITE_API_BASE_URL را از Repository Variable می‌گیرد.

## محدودیت‌های آگاهانه
1. جدول‌های users و attendance و تمام سوابق آن‌ها دست‌نخورده‌اند. این شاخه هیچ SQL تغییردهنده‌ای اجرا نمی‌کند.
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
- [ ] کارمند فقط سوابق خودش را ببیند
- [ ] داده‌های محصولات، فروش، بدهی، مشتری و attendance با D1 تطبیق داده شوند
- [ ] هیچ جدول یا سابقه D1 تغییر نکرده باشد

## وضعیت انتشار
Commit در شاخه توسعه به‌تنهایی به معنی Deploy نیست. تا وقتی KV و Secrets در Cloudflare تنظیم نشده‌اند، Worker آماده انتشار عملیاتی نیست.
