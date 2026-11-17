# تطبیق کد با دیتابیس زنده D1

## تصمیم قطعی

دیتابیس فعلی `shop-manager` مرجع داده است. ساختار آن در این فاز تغییر نمی‌کند؛ نه برای سازگاری با کد قدیمی ربات و نه برای ساده‌کردن API سایت.

جهت تطبیق فقط این است:

1. queryها و repositoryهای ربات با schema زنده هماهنگ شوند.
2. repositoryها و routeهای Worker با همان schema هماهنگ شوند.
3. Frontend فقط قرارداد API Worker را مصرف کند.
4. هیچ جدول، ستون، trigger یا داده‌ای برای برگرداندن مدل قدیمی ساخته، حذف یا تغییر داده نشود.

این سند snapshot کامل schema نیست؛ فقط واقعیت‌هایی را ثبت می‌کند که در خروجی‌های بررسی‌شده تا 2026-11-17 تأیید شده‌اند. موارد نامعلوم عمداً حدس زده نمی‌شوند.

## ساختارهای تأییدشده

### `product_prices`

| ستون | نوع | قاعده |
|---|---|---|
| `product_id` | TEXT | کلید اصلی |
| `purchase_price` | INTEGER | NOT NULL، پیش‌فرض 0 |
| `sell_price` | INTEGER | NOT NULL، پیش‌فرض 0 |
| `consumer_price` | INTEGER | NOT NULL، پیش‌فرض 0 |
| `market_price` | INTEGER | NOT NULL، پیش‌فرض 0 |
| `updated_at` | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

### `inventory`

| ستون | نوع | قاعده |
|---|---|---|
| `product_id` | TEXT | کلید اصلی |
| `quantity` | INTEGER | NOT NULL، پیش‌فرض 0 |
| `updated_at` | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

هر دو جدول به `products.product_id` با رفتار `NO ACTION` در حذف و به‌روزرسانی کلید خارجی متصل‌اند. triggerهای ایجاد محصول/قیمت/موجودی باید از snapshot کامل خوانده شوند؛ تا آن زمان منطق نوشتن محصول نباید تغییر کند.

### `sales`

خروجی PRAGMA قبلی این ستون‌ها را نشان داده است:

- `id`
- `product_id`
- `quantity`
- `sale_date`
- `sale_time`
- `sale_channel`
- snapshot قیمت خرید، فروش و مصرف‌کننده
- `amount_paid`
- `payment_method`
- `total_amount` (ستون محاسباتی/generated)
- `balance_amount`
- `discount_amount`
- `created_at`
- `customer_name`

نوع دقیق، constraintها و عبارت generated باید از خروجی کامل PRAGMA/CREATE TABLE دوباره ثبت شوند. مدل فعلی مشاهده‌شده، فروش را به‌صورت ردیف دارای `product_id` و `quantity` نگه می‌دارد؛ فرض وجود `sale_items` یا پرداخت‌های چندردیفی نباید بدون بررسی schema استفاده شود.

### `debts`

ستون‌های تأییدشده در خروجی قبلی:

- `sale_id`
- `amount`
- `status`
- `created_at`

ستون‌های `customer_name` و `paid` که در query قدیمی ربات استفاده می‌شوند، در اطلاعات فعلی تأیید نشده‌اند.

## ناسازگاری‌های شناخته‌شده در کد قدیمی ربات

فایل `src/db/shop.js` در مخزن `monitoring-shoma-bot` هنوز فرض‌های قدیمی زیر را دارد:

- `products.id`, `purchase_price`, `sell_price`, `consumer_price`, `stock`, `is_active`
- `debts.customer_name`, `paid` و وضعیت `open`
- جدول `payments` با `kind`, `method`, `amount`
- جدول `sale_items` با `qty`, `line_total`, `purchase_price_snapshot`
- `sales.debt_amount`

این queryها نباید به‌عنوان قرارداد معتبر دیتابیس تلقی شوند. باید با schema زنده بازنویسی شوند، نه اینکه دیتابیس به عقب برگردد. بخش حضور و غیاب از جداول `users` و `attendance` جداست و تا وقتی schema آن‌ها تأیید نشده، نباید تغییر کند.

## مواردی که هنوز برای پیاده‌سازی لازم‌اند

قبل از بازنویسی کامل repositoryهای فروشگاه و فعال‌کردن routeها، snapshot کامل و جاری این موارد لازم است:

- `CREATE TABLE` و `PRAGMA table_info` همه جدول‌ها
- تمام foreign keyها
- تمام indexها و triggerها
- تعریف دقیق generated columns
- وجود یا عدم وجود جدول‌های `payments`, `sale_items`, `purchases`, `purchase_items`, `customers`, `shortages`
- queryهای نوشتنی ربات و اثر triggerها روی فروش، قیمت و موجودی

تا تکمیل این snapshot، عملیات نوشتنی فروشگاه متوقف/غیرفعال باقی می‌مانند. هیچ migration، ALTER، DROP، UPDATE یا DELETE برای سازگارکردن کد اجرا نمی‌شود.

## ترتیب پیاده‌سازی

1. ثبت snapshot کامل schema بدون خواندن ردیف‌های واقعی مشتریان یا فروش.
2. بازنویسی repositoryهای ربات و تست queryها با همان D1، بدون تغییر schema.
3. ساخت repositoryهای Worker بر مبنای همان ستون‌ها و قواعد.
4. تکمیل احراز هویت و مجوزسنجی طبق `SECURITY_AND_NEXT_STEPS.md`.
5. فعال‌سازی API فقط‌خواندنی و اتصال Frontend.
6. بازطراحی عملیات نوشتنی و تست تراکنش/trigger فقط پس از تأیید سازگاری.

