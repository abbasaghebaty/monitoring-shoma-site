# سامانه مدیریت فروشگاه «شما»

پنل مدیریتی فروشگاه با معماری تفکیک‌شده و قابل توسعه.

## معماری استقرار
- **Frontend:** React + Vite روی GitHub Pages
- **Backend/API:** Cloudflare Workers (پوشه `worker/`)
- **Database:** دیتابیس D1 فعلی فروشگاه با binding برابر `DB`
- **CI/CD:** GitHub Actions برای build و انتشار خودکار GitHub Pages

GitHub Pages فقط فایل‌های استاتیک را میزبانی می‌کند. اجرای API، منطق کسب‌وکار و دسترسی به D1 فقط در Worker انجام می‌شود. مرورگر هرگز مستقیماً به D1 وصل نمی‌شود.

## تصمیم‌های ثابت پروژه

مرجع تصمیم‌های محصولی و مدل داده در [سند معماری داده و دامنه](docs/PRODUCT_DATA_STRATEGY.md) ثبت شده است. این پروژه قرار است در آینده پنل مدیریت، ربات تلگرام و وب‌سایت فروشگاهی را روی یک دیتابیس مرکزی و کاتالوگ مشترک پشتیبانی کند.

## وضعیت فعلی
- رابط فعلی داشبورد و محصولات دارای داده‌های نمایشی است.
- صفحات دامنه‌ای فروش، انبار، خرید، مشتریان، مالی، گزارش‌ها و تنظیمات به‌صورت اسکلت ایجاد شده‌اند.
- کلاینت API سمت Frontend آماده اتصال به Worker است.
- Worker و routeهای نسخه ۱ ایجاد شده‌اند؛ به‌جز `/health` سایر endpointها فعلاً پاسخ 501 می‌دهند.
- اتصال به D1، احراز هویت، عملیات نوشتن، محاسبات مالی و تست end-to-end هنوز انجام نشده‌اند.
- هیچ migration یا تغییری روی دیتابیس زنده اعمال نشده است.

## ساختار
```text
.github/workflows/  انتشار خودکار GitHub Pages
docs/               معماری، قرارداد API، داده، حسابداری و نقشه راه
src/components/     اجزای مشترک رابط
src/config/         تنظیمات عمومی Frontend
src/lib/api/        کلاینت و endpointهای API
src/lib/format/     قالب‌بندی تاریخ و مبلغ
src/modules/        مدل‌های دامنه و کاتالوگ بخش‌ها
src/pages/          صفحات ماژولار
worker/src/         Worker، routes، middleware، repositories و validation
tests/              برنامه آزمون‌ها
```

## اجرای Frontend
```bash
npm install
npm run dev
npm run build
npm run preview
```

## راه‌اندازی GitHub Pages
1. در Settings مخزن به Pages برو.
2. بخش Build and deployment را روی **GitHub Actions** قرار بده.
3. workflow با هر push به شاخه `main` پروژه را build و منتشر می‌کند.
4. آدرس مورد انتظار: `https://abbasaghebaty.github.io/monitoring-shoma-site/`

چون مخزن از نوع Project Pages است، مقدار `base` در `vite.config.js` برابر `/monitoring-shoma-site/` است. در صورت تغییر نام مخزن، این مقدار هم باید تغییر کند.

## اتصال API
در `.env.example` فقط origin عمومی Worker تعریف شده است. برای توسعه محلی می‌توان آن را در `.env.local` قرار داد. مقدار `VITE_*` عمومی است و نباید حاوی secret باشد.

## دیتابیس موجود
مخزن ربات فروشگاه: [monitoring_shoma](https://github.com/abbasaghebaty/monitoring_shoma)

نام دیتابیس گزارش‌شده `shop-manager` و binding آن `DB` است. جداولی از جمله `products`, `purchases`, `purchase_items`, `sales`, `sale_items`, `payments`, `debts`, `customers` و `shortages` در کد ربات دیده شده‌اند؛ این فهرست schema کامل نیست. پیش از query باید migrationها، ستون‌ها، کلیدها و triggerها بررسی شوند. شناسه D1 در تنظیمات Worker عمداً placeholder است.

## اصول امنیت و صحت داده
- شناسه دیتابیس، توکن و secret در Frontend یا Git ذخیره نشود.
- CORS به‌تنهایی احراز هویت نیست؛ قبل از نمایش اطلاعات خصوصی باید احراز هویت و نقش‌ها پیاده‌سازی شوند.
- عملیات فروش باید اتمیک و همراه اقلام، پرداخت‌ها و گردش موجودی ثبت شود.
- داده نمایشی نباید با داده واقعی اشتباه گرفته شود.
- سود تقریبی فعلی ربات، سود خالص حسابداری محسوب نمی‌شود.
- جزئیات در `docs/` و `worker/README.md` آمده است.
