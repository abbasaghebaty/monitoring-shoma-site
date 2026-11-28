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
کد عملیاتی از schema مستندشده استفاده می‌کند، اما نسخه remediation اکنون به جدول Audit (Migration 0001)، فضای انبار (Migration 0002 برای endpointهای workspace) و جدول‌های OTP/Rate Limit و Unique Index حضور و غیاب (Migration 0003) وابسته است. این Migrationها در Production اجرا نشده‌اند؛ بنابراین Worker این شاخه تا preflight، backup و اجرای تأییدشده Migrationهای لازم نباید Deploy شود.

## قواعد مالی
- فروش فعلی یک‌قلمی است.
- Triggerهای D1 بعد از درج فروش، موجودی را کاهش و بدهی احتمالی را ایجاد می‌کنند؛ API این کار را دوباره انجام نمی‌دهد.
- سوابق فروش immutable هستند.
- تغییر موجودی و تسویه بدهی تا ایجاد ledger قابل حسابرسی غیرفعال‌اند.
- Worker باید جداگانه Deploy و با GET /health بررسی شود؛ انتشار GitHub Pages آن را Deploy نمی‌کند.

قرارداد endpointها در ../docs/API_CONTRACT.md آمده است. برای اتصال ربات یا کلاینت‌های غیرمرورگری، service token مستقل و محدود لازم است؛ از نشست مرورگر استفاده نکنید.


## Migrationهای افزوده در شاخه remediation

- `0003_attendance_and_auth_integrity.sql` یک partial unique index برای حداکثر یک ورود باز به ازای هر کاربر می‌سازد و جدول‌های `auth_rate_limits` و `auth_otp_challenges` را اضافه می‌کند.
- پیش از اجرای آن روی دیتابیس موجود، این preflight فقط‌خواندنی را اجرا و نتیجه را بررسی کنید:

```sql
SELECT telegram_id, COUNT(*) AS open_count
FROM attendance
WHERE check_out IS NULL
GROUP BY telegram_id
HAVING COUNT(*) > 1;
```

اگر نتیجه‌ای وجود داشت، Migration با خطای Unique متوقف می‌شود؛ هیچ رکوردی را خودکار نمی‌بندد یا حذف نمی‌کند. رفع داده‌های تاریخی نیازمند تصمیم و بررسی جداگانه است.
