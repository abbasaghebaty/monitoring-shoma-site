# سامانه مدیریت فروشگاه «شما»

پنل مدیریت و مانیتورینگ فروشگاه؛ با Frontend استاتیک، API مستقل و دیتابیس مرکزی فعلی فروشگاه.

## معماری در یک نگاه

- **Frontend:** React + Vite روی GitHub Pages
- **Backend/API:** Cloudflare Worker در پوشه `worker/`
- **Database:** دیتابیس D1 با نام `shop-manager` و binding برابر `DB`
- **انتشار Frontend:** GitHub Actions

GitHub Pages فقط فایل‌های استاتیک را میزبانی می‌کند. مرورگر مستقیماً به D1 وصل نمی‌شود؛ دسترسی به داده‌ها فقط از مسیر Worker انجام خواهد شد.

## وضعیت فعلی

- اسکلت پنل و Worker ایجاد شده است.
- صفحات داشبورد و محصولات داده ساختگی نمایش نمی‌دهند.
- binding دیتابیس در تنظیمات Worker تعریف شده، اما اتصال عملیاتی هنوز تکمیل نشده است.
- endpointهای داده واقعی و احراز هویت هنوز پیاده‌سازی نشده‌اند.
- هیچ migration یا تغییر نوشتنی روی دیتابیس زنده اجرا نشده است.
- ابتدا باید schema واقعی، indexها، triggerها و رفتار ربات فعلی بررسی شوند.

## نقشه فایل‌ها و مسئولیت‌ها

```text
.github/workflows/
  deploy-pages.yml       build و انتشار خودکار GitHub Pages

docs/
  ARCHITECTURE.md        نمای معماری و ارتباط اجزای سامانه
  API_CONTRACT.md        قرارداد مسیرها و پاسخ‌های API
  DATA_MODEL.md          مدل مفهومی داده
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
    utils/                پاسخ‌ها و ابزارهای مشترک

tests/
  README.md               وضعیت و برنامه آزمون‌ها

index.html                سند HTML اصلی Vite
package.json              وابستگی‌ها و فرمان‌های Frontend
vite.config.js            تنظیمات build و مسیر پایه GitHub Pages
.env.example              نمونه تنظیمات عمومی؛ هیچ secret واقعی در آن قرار نگیرد
```

## مستندات مهم

برای ادامه توسعه، به‌خصوص اگر گفتگو یا محیط کاری جدیدی شروع شد، ابتدا فایل **[SECURITY_AND_NEXT_STEPS.md](docs/SECURITY_AND_NEXT_STEPS.md)** را بخوان. این فایل مرجع وضعیت فعلی، تصمیم‌های امنیتی و ترتیب دقیق کارهای باقی‌مانده است.

تصمیم‌های ثابت درباره دامنه محصول و مدل داده در [PRODUCT_DATA_STRATEGY.md](docs/PRODUCT_DATA_STRATEGY.md) نگهداری می‌شوند و چک‌لیست کلی توسعه در [ROADMAP.md](docs/ROADMAP.md) است.

## دیتابیس و سازگاری

دیتابیس مرکزی فعلی با نام `shop-manager` متعلق به سامانه فروشگاه است و پنل، ربات و وب‌سایت آینده باید با حفظ سازگاری از آن استفاده کنند. نام جدول‌هایی که در کد ربات دیده شده‌اند، schema کامل محسوب نمی‌شوند. پیش از هر query یا migration باید ساختار زنده و triggerها بررسی شوند.

## اصول غیرقابل‌چشم‌پوشی

- هیچ secret، توکن ربات یا کلید مدیریتی در Frontend، Git یا متغیرهای `VITE_*` قرار نگیرد.
- CORS جای احراز هویت و مجوز دسترسی را نمی‌گیرد.
- هر endpoint خصوصی باید در خود Worker هویت و مجوز کاربر را بررسی کند.
- گزارش‌های مشتق‌شده از داده خام محاسبه شوند؛ منبع حقیقت، سوابق عملیاتی باشند.
- تغییرات دیتابیس باید افزایشی، مستند، قابل بازبینی و سازگار با ربات فعلی باشند.
- حذف یا اصلاح سوابق مالی باید قابل ردیابی باشد.

## انتشار

Frontend با GitHub Actions از شاخه `main` روی GitHub Pages منتشر می‌شود. تنظیمات build در `vite.config.js` و workflow در `.github/workflows/deploy-pages.yml` قرار دارند.

Worker از طریق تنظیمات و ابزارهای Cloudflare منتشر می‌شود؛ راهنمای آن در [worker/README.md](worker/README.md) است. روند این پروژه بر پایه GitHub و Cloudflare Dashboard است و نباید اجرای محلی یا ترمینال را پیش‌فرض بگیریم.
