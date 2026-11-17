# انتشار

## GitHub Pages

1. وارد Settings مخزن شو.
2. در Pages، بخش Build and deployment را روی GitHub Actions قرار بده.
3. مطمئن شو شاخه اصلی `main` است.
4. با هر push به main، workflow فایل‌ها را build و منتشر می‌کند.
5. آدرس پروژه معمولاً `https://abbasaghebaty.github.io/monitoring-shoma-site/` خواهد بود.

اگر نام repository تغییر کرد، مقدار `base` در `vite.config.js` و مسیر URL انتشار را نیز اصلاح کن.

## متغیرهای Frontend

فقط origin عمومی API را در GitHub Actions Variables یا فایل تنظیمات build قرار بده: `VITE_API_BASE_URL`. هیچ کلید محرمانه‌ای در متغیر VITE قرار نده.

## Worker

مراحل اتصال D1 و تنظیم CORS در `worker/README.md` توضیح داده شده است.
