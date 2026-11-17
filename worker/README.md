# Shoma API Worker

این Worker لایه API بین GitHub Pages و دیتابیس D1 موجود فروشگاه است.

## اتصال D1

فایل `wrangler.toml` به دیتابیس موجود `shop-manager` و binding با نام `DB` اشاره می‌کند. شناسه دیتابیس با تنظیمات Worker ربات فروشگاه `monitoring-shoma-bot` یکسان است.

مسیر `GET /health` یک query بی‌خطر `SELECT 1 AS connected` اجرا می‌کند تا binding واقعی D1 را بررسی کند؛ هیچ داده عملیاتی یا schemaای برنمی‌گرداند.

**ساختار D1 مرجع است و در این فاز تغییر نمی‌کند.** queryهای قدیمی ربات باید با schema موجود هماهنگ شوند. هیچ migration، ALTER، DROP یا query نوشتنی برای بازگرداندن مدل قدیمی اجرا نشود. جزئیات در `docs/D1_COMPATIBILITY.md` مخزن اصلی ثبت شده است.

## وضعیت API

endpointهای داده هنوز به queryهای schema زنده متصل نشده‌اند. تا پیش از تکمیل snapshot کامل schema و احراز هویت/مجوزسنجی، هیچ داده حساس فروشگاه نباید از Worker عمومی شود.

## CORS و امنیت

Origin مجاز فعلی:
`https://abbasaghebaty.github.io`

CORS فقط محدودیت مرورگر است و جای احراز هویت و مجوز سمت Worker را نمی‌گیرد. اصول ورود Telegram ID، OTP، نشست امن، CSRF، rate limit و کنترل نقش‌ها در سند `docs/SECURITY_AND_NEXT_STEPS.md` مخزن اصلی تعریف شده‌اند.

## انتشار

تنظیمات Worker در `wrangler.toml` نگهداری می‌شود. Secretها فقط از بخش Cloudflare Worker Secrets تنظیم شوند؛ هیچ secret در Git، فایل Frontend یا متغیرهای `VITE_*` قرار نگیرد.
