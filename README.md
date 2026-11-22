# سامانه مدیریت فروشگاه «شما»

پنل مدیریت و مانیتورینگ فروشگاه؛ با Frontend استاتیک، API مستقل و دیتابیس مرکزی فعلی فروشگاه.

## معماری در یک نگاه

- **Frontend:** React + Vite روی GitHub Pages
- **Backend/API:** Cloudflare Worker در پوشه `worker/`
- **Database:** دیتابیس D1 با نام `shop-manager` و binding برابر `DB`
- **انتشار Frontend:** GitHub Actions

GitHub Pages فقط فایل‌های استاتیک را میزبانی می‌کند. مرورگر مستقیماً به D1 وصل نمی‌شود؛ دسترسی به داده‌ها فقط از مسیر Worker انجام خواهد شد.

## تصمیم قطعی درباره دیتابیس

**ساختار فعلی D1 مرجع نهایی است و در این فاز تغییر نمی‌کند.** کد ربات و Worker باید با دیتابیس موجود تطبیق داده شوند؛ نه اینکه جدول‌ها یا ستون‌های D1 برای سازگاری با queryهای قدیمی تغییر کنند. جزئیات و ناسازگاری‌های شناخته‌شده در [D1_COMPATIBILITY.md](docs/D1_COMPATIBILITY.md) ثبت می‌شوند.

## وضعیت فعلی

- شاخه اتصال شامل ورود OTP تلگرام، نشست Bearer، کنترل نقش و APIهای فقط‌خواندنی است.
- صفحات سایت به API متصل شده‌اند و داده ساختگی نمایش نمی‌دهند.
- اتصال Worker به D1 در زمان اجرا باید با `/health` تأیید شود.
- پیش از Deploy باید KV مستقل و Secretهای Cloudflare تنظیم شوند؛ جزئیات در [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) است.
- هیچ migration یا تغییر نوشتنی روی دیتابیس زنده اجرا نشده است.

## نقشه فایل‌ها و مسئولیت‌ها

```text
.github/workflows/
  deploy-pages.yml       build و انتشار خودکار GitHub Pages

docs/
  ARCHITECTURE.md        نمای معماری و ارتباط اجزای سامانه
  API_CONTRACT.md        قرارداد مسیرها و پاسخ‌های API\n  AUTH_DIAGNOSTICS.md    کدهای خطا، requestId و روش پیگیری لاگ‌های احراز هویت
  DATA_MODEL.md          مدل مفهومی داده
  D1_COMPATIBILITY.md    واقعیت‌های تأییدشده و تطبیق کد با D1 زنده
  PRODUCT_DATA_STRATEGY.md تصمیم‌های محصول، کاتالوگ و داده
  ACCOUNTING_RULES.md    قواعد و ملاحظات حسابداری
  DEPLOYMENT.md          راهنمای استقرار
  ROADMAP.md             چک‌لیست مرحله‌ای توسعه
  SECURITY_AND_NEXT_STEPS.md
                         مرجع اصلی ادامه کار، امنیت، وضعیت و گام بعدی

src/
  App.jsx                پوسته اصلی، مسیریابی و چیدمان پنل
  main.jsx               نقطه ورود React
  styles.css             استایل‌های سراسری
  components/            اجزای مشترک رابط کاربری
  config/app.js          تنظیمات عمومی Frontend؛ بدون secret
  lib/api/
    client.js            کلاینت ارتباط با Worker
    endpoints.js         تعریف مسیرهای API سمت Frontend
  lib/constants/         ثابت‌های عمومی رابط
  lib/format/            قالب‌بندی تاریخ و مبلغ
  modules/
    registry.js          فهرست و مشخصات ماژول‌های پنل
    */model.js           مدل و توابع کمکی هر دامنه
  pages/                 صفحه‌های مستقل هر بخش پنل

worker/
  wrangler.toml          نام Worker، متغیرهای عمومی و binding دیتابیس
  package.json           وابستگی‌ها و فرمان‌های Worker
  README.md              راهنمای فنی Worker و تنظیمات Cloudflare
  src/
    index.js             ورودی Worker
    router.js            مسیریابی درخواست‌ها
    middleware/          میان‌افزارهای مشترک مانند CORS
    routes/               handlerهای مسیرهای API
    repositories/         لایه دسترسی به داده و queryها
    validation/           اعتبارسنجی ورودی‌ها
    utils/                پاسخ‌ها، خطاهای استاندارد و ابزارهای تشخیصی request-scoped

tests/
  README.md               وضعیت و برنامه آزمون‌ها

index.html                سند HTML اصلی Vite
package.json              وابستگی‌ها و فرمان‌های Frontend
vite.config.js            تنظیمات build و مسیر پایه GitHub Pages
.env.example              نمونه تنظیمات عمومی؛ هیچ secret واقعی در آن قرار نگیرد
```

## مستندات مهم

پیش از هر تغییر، [SECURITY_AND_NEXT_STEPS.md](docs/SECURITY_AND_NEXT_STEPS.md)، [D1_COMPATIBILITY.md](docs/D1_COMPATIBILITY.md) و سند دامنه مرتبط را بخوان.

## اصول غیرقابل‌چشم‌پوشی

- هیچ secret، توکن ربات یا کلید مدیریتی در Frontend، Git یا متغیرهای `VITE_*` قرار نگیرد.
- CORS جای احراز هویت و مجوز دسترسی را نمی‌گیرد.
- هر endpoint خصوصی باید در خود Worker هویت و مجوز کاربر را بررسی کند.
- گزارش‌های مشتق‌شده از داده خام محاسبه شوند؛ منبع حقیقت، سوابق عملیاتی باشند.
- هیچ migration یا تغییر schema روی D1 برای سازگاری با کد قدیمی انجام نشود.
- حذف یا اصلاح سوابق مالی باید قابل ردیابی باشد.

## انتشار

Frontend با GitHub Actions از شاخه `main` روی GitHub Pages منتشر می‌شود. تنظیمات build در `vite.config.js` و workflow در `.github/workflows/deploy-pages.yml` قرار دارند.

Worker از طریق تنظیمات و ابزارهای Cloudflare منتشر می‌شود؛ راهنمای آن در [worker/README.md](worker/README.md) است. روند این پروژه بر پایه GitHub و Cloudflare Dashboard است و نباید اجرای محلی یا ترمینال را پیش‌فرض بگیریم.
