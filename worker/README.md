# Shoma API Worker

این Worker لایه امن API بین GitHub Pages و دیتابیس D1 موجود فروشگاه است.

## اتصال D1

فایل `wrangler.toml` اکنون به دیتابیس موجود `shop-manager` و binding با نام `DB` اشاره می‌کند. شناسه از تنظیمات Worker ربات فروشگاه `monitoring-shoma-bot` برداشته شده است.

**هیچ migration یا query نوشتنی در این پروژه اجرا نمی‌شود.** ابتدا schema واقعی، indexها و triggerها باید استخراج و بررسی شوند.

## انتشار

از پوشه `worker/`:

```bash
npm install
npx wrangler login
npx wrangler secret put SCHEMA_INSPECTION_TOKEN
npx wrangler deploy
```

برای secret یک مقدار تصادفی و طولانی بساز. آن را در Git، فایل `.env` قابل commit یا Frontend قرار نده.

## بررسی schema

پس از deploy، endpoint زیر فقط metadata ساختار دیتابیس را می‌دهد و هیچ ردیف مشتری/فروش/حضور و غیاب را نمی‌خواند:

`GET /api/v1/admin/schema`

درخواست باید هدر زیر را داشته باشد:

`Authorization: Bearer <SCHEMA_INSPECTION_TOKEN>`

خروجی شامل نام جدول‌ها، SQL تعریف جدول، ستون‌ها، indexها و triggerها است. خروجی JSON را برای تطبیق schema ذخیره کن؛ خود توکن را ارسال یا منتشر نکن.

بعد از دریافت و بررسی schema، secret موقت را حذف کن و endpoint تشخیصی را ببند یا حذف کن.

## CORS

Origin مجاز فعلی:
`https://abbasaghebaty.github.io`

CORS فقط محدودیت مرورگر است و جای احراز هویت را نمی‌گیرد.

## APIهای داده

در این مرحله endpointهای عملیاتی هنوز پیاده‌سازی نشده‌اند. پس از تطبیق schema و افزودن احراز هویت، ابتدا GETهای فقط‌خواندنی اضافه می‌شوند. endpointهای ثبت و ویرایش محصول/فروش در مرحله بعد و با کنترل تراکنش و مجوز اجرا می‌شوند.

## امنیت و صحت

- هیچ secret در Git یا متغیرهای `VITE_*` قرار نده.
- GitHub Pages نباید مستقیم به D1 وصل شود.
- اطلاعات فروش، مشتری، بدهی و حضور و غیاب فقط برای مدیر احراز هویت‌شده قابل دسترسی است.
- موجودی باید با گردش‌های مستند و triggerهای بررسی‌شده سازگار باشد.
- CORS احراز هویت نیست.
