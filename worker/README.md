# Monitoring Shoma Site — Cloudflare Worker API

Worker لایه API مستقل بین GitHub Pages، مصرف‌کننده‌های بعدی مانند ربات، و دیتابیس D1 است.

- Worker: \`monitoring-shoma-site\`
- D1: \`shop-manager\`
- Binding: \`DB\`
- API version: \`/api/v1\`

## ساختار
- \`src/router.js\`: مسیریابی و نسخه API
- \`src/routes/\`: handlerهای HTTP
- \`src/repositories/\`: queryهای D1
- \`src/validation/\`: اعتبارسنجی ورودی
- \`src/middleware/\`: نشست و مجوز
- \`src/utils/\`: پاسخ‌ها و diagnostics

## امنیت
ورود OTP تلگرام و نشست Bearer. Secretهای BOT_TOKEN و OTP_PEPPER و KV مستقل SITE_AUTH_KV باید در Cloudflare تنظیم باشند. هیچ secret در Git یا Frontend قرار نگیرد.

## تطابق با D1
کد عملیاتی فقط از جدول‌ها و ستون‌های تأییدشده در docs/DATABASE_REFERENCE.md استفاده می‌کند. Migrationهای Audit و فضای چندانبار روی Production اجرا نشده‌اند؛ Worker به آن‌ها وابسته نیست.

## قواعد مالی
- فروش فعلی یک‌قلمی است.
- Triggerهای D1 بعد از درج فروش، موجودی را کاهش و بدهی احتمالی را ایجاد می‌کنند؛ API این کار را دوباره انجام نمی‌دهد.
- سوابق فروش immutable هستند.
- تغییر موجودی و تسویه بدهی تا ایجاد ledger قابل حسابرسی غیرفعال‌اند.
- Worker باید جداگانه Deploy و با GET /health بررسی شود؛ انتشار GitHub Pages آن را Deploy نمی‌کند.

قرارداد endpointها در ../docs/API_CONTRACT.md آمده است. برای اتصال ربات یا کلاینت‌های غیرمرورگری، service token مستقل و محدود لازم است؛ از نشست مرورگر استفاده نکنید.
