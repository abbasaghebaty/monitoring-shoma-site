# انتشار

## GitHub Pages

1. وارد Settings مخزن شو.
2. در Pages، بخش Build and deployment را روی GitHub Actions قرار بده.
3. مطمئن شو شاخه اصلی `main` است.
4. با هر push به main، workflow فایل‌ها را build و منتشر می‌کند.
5. آدرس پروژه معمولاً `https://abbasaghebaty.github.io/monitoring-shoma-site/` خواهد بود.

اگر نام repository تغییر کرد، مقدار `base` در `vite.config.js` و مسیر URL انتشار را نیز اصلاح کن.

## تنظیمات API در Frontend

در Build تولیدی GitHub Pages، آدرس API به‌صورت قطعی از `src/config/app.js` و برابر آدرس Worker زیر است:

```text
https://monitoring-shoma-site.abbas-aghebaty.workers.dev
```

متغیر `VITE_API_BASE_URL` عمداً در workflow انتشار Pages تزریق نمی‌شود و حتی اگر در GitHub Repository Variables مقدار قدیمی یا اشتباه داشته باشد، نمی‌تواند آدرس API نسخه Production را override کند. در Buildهای غیرتولیدی، امکان استفاده از `VITE_API_BASE_URL` برای تنظیم محیط توسعه حفظ شده است.

هیچ کلید محرمانه‌ای در متغیرهای `VITE_*` قرار نده.

## Worker

نام Worker این پروژه دقیقاً `monitoring-shoma-site` است؛ این نام از مقدار `name` در `worker/wrangler.toml` گرفته می‌شود. هنگام تنظیم Secrets، بررسی Deploy و دریافت آدرس API در Cloudflare Dashboard، همین Worker را انتخاب کن. نام دیگری مانند `shoma-api` برای این پروژه استفاده نمی‌شود.

مراحل اتصال D1 و تنظیم CORS در `worker/README.md` توضیح داده شده است.
