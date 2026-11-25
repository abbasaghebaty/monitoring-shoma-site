# سامانه مدیریت فروشگاه «شما»

پنل مدیریت و مانیتورینگ فروشگاه؛ با Frontend استاتیک، API مستقل و دیتابیس مرکزی فعلی فروشگاه.

## معماری در یک نگاه

- **Frontend:** React + Vite روی GitHub Pages
- **Backend/API:** Cloudflare Worker در پوشه `worker/`
- **Database:** دیتابیس D1 با نام `shop-manager` و binding برابر `DB`
- **انتشار Frontend:** GitHub Actions

GitHub Pages فقط فایل‌های استاتیک را میزبانی می‌کند. مرورگر مستقیماً به D1 وصل نمی‌شود؛ دسترسی به داده‌ها فقط از مسیر Worker انجام خواهد شد.

## تصمیم قطعی درباره دیتابیس

**Schema مرجع پروژه versioned و migration-driven است.** worker/migrations/0000_baseline.sql ساخت دیتابیس تازه را تعریف می‌کند و 0001_product_audit_log.sql لایه Audit را اضافه می‌کند. Baseline از CREATE IF NOT EXISTS استفاده می‌کند تا در دیتابیس موجود، جدول‌ها/ردیف‌ها را حذف یا بازنویسی نکند؛ اما تعریف ستون‌ها و Triggerهای موجود را نیز اصلاح نمی‌کند. قبل از پذیرش یک دیتابیس موجود، تطبیق read-only آن با قرارداد canonical الزامی است. هیچ Migrationای در این PR روی Production اجرا نشده است. جزئیات در D1_COMPATIBILITY.md ثبت شده‌اند.

## وضعیت فعلی

- ورود OTP تلگرام، نشست Bearer و کنترل نقش در Worker انجام می‌شود.
- داشبورد، موجودی، فروش، بدهی، مشتریان، حضور و غیاب و گزارش‌ها از API واقعی D1 خوانده می‌شوند.
- بخش «مدیریت اجناس» ایجاد و ویرایش مشخصات و قیمت کالا را با مجوز owner/manager انجام می‌دهد؛ کنترل هم‌زمانی و Audit اتمیک دارد. موجودی مستقل و سوابق فروش را تغییر نمی‌دهد.
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
  API_CONTRACT.md        قرارداد مسیرها و پاسخ‌های API
  AUTH_DIAGNOSTICS.md    کدهای خطا، requestId و روش پیگیری لاگ‌های احراز هویت
  DATA_MODEL.md          مدل مفهومی داده
  D1_COMPATIBILITY.md    واقعیت‌های تأییدشده و تطبیق کد با D1 زنده
  PRODUCT_DATA_STRATEGY.md تصمیم‌های محصول، کاتالوگ و داده
  PRODUCT_MANAGEMENT.md    قابلیت‌ها، Audit و محدودیت‌های مدیریت اجناس
  ACCOUNTING_RULES.md    قواعد و ملاحظات حسابداری
  DEPLOYMENT.md          راهنمای استقرار
  ROADMAP.md             چک‌لیست مرحله‌ای توسعه
  SECURITY_AND_NEXT_STEPS.md
                         مرجع اصلی ادامه کار، امنیت، وضعیت و گام بعدی

src/
  App.jsx                پوسته اصلی و جابه‌جایی بخش‌های پنل
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
  pages/
    ProductsPage.jsx     فهرست، جست‌وجو، فیلتر و فرم مدیریت کالا

worker/
  wrangler.toml          نام Worker، متغیرهای عمومی و binding دیتابیس
  migrations/             Migrationهای افزایشی؛ اجرای Production فقط با تأیید جداگانه
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

پیش از هر تغییر، [SECURITY_AND_NEXT_STEPS.md](docs/SECURITY_AND_NEXT_STEPS.md)، [D1_COMPATIBILITY.md](docs/D1_COMPATIBILITY.md) و سند دامنه مرتبط را بخوان. محدوده مدیریت اجناس در [PRODUCT_MANAGEMENT.md](docs/PRODUCT_MANAGEMENT.md) ثبت شده است.

## اصول غیرقابل‌چشم‌پوشی

- هیچ secret، توکن ربات یا کلید مدیریتی در Frontend، Git یا متغیرهای `VITE_*` قرار نگیرد.
- CORS جای احراز هویت و مجوز دسترسی را نمی‌گیرد.
- هر endpoint خصوصی باید در خود Worker هویت و مجوز کاربر را بررسی کند.
- گزارش‌های مشتق‌شده از داده خام محاسبه شوند؛ منبع حقیقت، سوابق عملیاتی باشند.
- تغییر schema فقط با Migration نسخه‌دار، بررسی backward compatibility و تأیید مستقل انجام شود؛ هیچ Migrationای از این PR روی Production اجرا نشده است.
- حذف یا اصلاح سوابق مالی باید قابل ردیابی باشد.

## انتشار

Frontend با GitHub Actions از شاخه `main` روی GitHub Pages منتشر می‌شود. تنظیمات build در `vite.config.js` و workflow در `.github/workflows/deploy-pages.yml` قرار دارند.

Worker از طریق تنظیمات و ابزارهای Cloudflare منتشر می‌شود؛ راهنمای آن در [worker/README.md](worker/README.md) است. روند این پروژه بر پایه GitHub و Cloudflare Dashboard است و نباید اجرای محلی یا ترمینال را پیش‌فرض بگیریم.


## آزمون‌های محصول

- `npm --prefix worker test`: تست‌های Worker و SQLite ایزوله.
- `npm run test:d1`: تست‌های integration با D1 محلی در Workers Vitest/Miniflare؛ هیچ اتصال Remote یا Production در این فرمان تنظیم نشده است.
- `npm run build`: ساخت Frontend.


## زنجیرهٔ canonical دیتابیس

ترتیب Migrationها در worker/migrations:

1. 0000_baseline.sql — ساخت جداول دامنه، کلیدها، محدودیت‌ها، indexها و Triggerهای عملیاتی.
2. 0001_product_audit_log.sql — جدول و Triggerهای append-only مربوط به Audit کالا.

برای تست از صفر: npm test --prefix worker و npm run test:d1. هر دو مجموعه از همین دو فایل Migration استفاده می‌کنند؛ هیچ schema fixture جداگانه‌ای باقی نمانده است. وضعیت دیتابیس Cloudflare میزبانی‌شده در این PR دوباره خوانده نشده و از روی این تست‌ها دربارهٔ آن نتیجه‌گیری نمی‌شود.


## فضای افزایشی مدیریت کالا و انبار

یک فضای مستقل و واکنش‌گرا برای مدیریت پیشرفته کالا و انبار به پنل اضافه شده است. این بخش منوی داخلی ماژولار دارد و قابلیت‌های دسته‌بندی، برند، انبارها، موقعیت‌ها، گردش و اصلاح موجودی، انتقال، تأمین‌کنندگان، سفارش خرید، دریافت، سفارش مجدد، انبارگردانی، تقویم، تحلیل، گزارش و تنظیمات را به‌صورت مرحله‌ای سازمان‌دهی می‌کند.

جزئیات فایل‌ها و مرز اتصال به API در [INVENTORY_WORKSPACE.md](docs/INVENTORY_WORKSPACE.md) آمده است. نمای کلی و موجودی از API فعلی خوانده می‌شوند؛ در فاز اول دسته‌بندی، برند، انبار و موقعیت نیز API فهرست/ایجاد/ویرایش دارند. گردش و عملیات مالی انبار تا طراحی ledger سازگار، اسکلت باقی می‌مانند. Migration جدید فقط در محیط تست ایزوله استفاده می‌شود و روی Production اجرا نشده است.
