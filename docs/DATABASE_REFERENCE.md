# مرجع واقعی دیتابیس فروشگاه (Cloudflare D1)

> وضعیت: snapshot فقط‌خواندنی دریافت‌شده از Cloudflare D1 در 2026-11-25  
> دیتابیس: `shop-manager` — Worker binding: `DB`  
> این سند بر اساس خروجی `sqlite_master` و PRAGMAهایی است که کاربر از کنسول D1 ارسال کرده است. هیچ داده عملیاتی مشتریان، کارکنان یا فروش‌ها در این سند ذخیره نشده است.

## 1. نتیجه اجرایی

دیتابیس زنده شامل هشت جدول دامنه‌ای اصلی و یک جدول زیرساختی Cloudflare است:

- `users`
- `products`
- `product_prices`
- `inventory`
- `sales`
- `debts`
- `customers`
- `attendance`
- `_cf_KV` (زیرساخت Cloudflare؛ خارج از مدل دامنه فروشگاه)

جدول‌ها و قابلیت‌های زیر در snapshot زنده مشاهده نشدند:

- `product_audit_log` و Triggerهای آن (Migration `0001`)
- `product_categories`، `product_brands`، `warehouses`، `warehouse_locations` و `inventory_workspace_audit` (Migration `0002`)
- ستون‌های افزوده‌شده در Migration `0002`: `barcode`، `category_id`، `brand_id`، `min_stock` و `is_active` در `products`

جدول `d1_migrations` نیز وجود ندارد؛ بنابراین سابقه اعمال Migrationها از جدول داخلی قابل بازیابی نیست. وضعیت باید از روی schema واقعی سنجیده شود، نه از روی فرض درباره تاریخچه migration.

**هیچ migration یا دستور تغییردهنده‌ای در جریان تهیه این snapshot اجرا نشده است.**

## 2. ساختار جدول‌ها

### users

| ستون | نوع | محدودیت / مقدار پیش‌فرض |
|---|---|---|
| telegram_id | INTEGER | PRIMARY KEY |
| full_name | TEXT | NOT NULL |
| username | TEXT | nullable |
| role | TEXT | NOT NULL، پیش‌فرض `employee`؛ فقط `owner`، `manager`، `employee` |
| is_active | INTEGER | NOT NULL، پیش‌فرض 1 |
| created_at | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

### products

| ستون | نوع | محدودیت / مقدار پیش‌فرض |
|---|---|---|
| product_id | TEXT | PRIMARY KEY |
| name | TEXT | NOT NULL |
| unit | TEXT | NOT NULL، پیش‌فرض `'عدد'` |
| package_quantity | INTEGER | nullable |
| weight | REAL | nullable |
| weight_unit | TEXT | nullable |
| description | TEXT | nullable |
| created_at | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

شناسه محصول رشته‌ای است و ستون `id` وجود ندارد. قیمت و موجودی در جدول‌های جداگانه نگهداری می‌شوند.

### product_prices

| ستون | نوع | محدودیت / مقدار پیش‌فرض |
|---|---|---|
| product_id | TEXT | PRIMARY KEY، FK به `products.product_id` |
| purchase_price | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| sell_price | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| consumer_price | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| market_price | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| updated_at | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

### inventory

| ستون | نوع | محدودیت / مقدار پیش‌فرض |
|---|---|---|
| product_id | TEXT | PRIMARY KEY، FK به `products.product_id` |
| quantity | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| updated_at | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

### sales

| ستون | نوع | محدودیت / مقدار پیش‌فرض |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| product_id | TEXT | NOT NULL، FK به `products.product_id` |
| quantity | INTEGER | NOT NULL، CHECK > 0 |
| sale_date | TEXT | NOT NULL |
| sale_time | TEXT | NOT NULL |
| sale_channel | TEXT | NOT NULL |
| purchase_price | INTEGER | NOT NULL، CHECK >= 0 |
| sell_price | INTEGER | NOT NULL، CHECK >= 0 |
| consumer_price | INTEGER | NOT NULL، CHECK >= 0 |
| amount_paid | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| payment_method | TEXT | NOT NULL |
| total_amount | INTEGER | STORED generated: `quantity * sell_price` |
| balance_amount | INTEGER | STORED generated: `quantity * sell_price - amount_paid` |
| discount_amount | INTEGER | STORED generated: `MAX(consumer_price - sell_price, 0) * quantity` |
| created_at | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |
| customer_name | TEXT | nullable |

**نکته فنی مهم:** `PRAGMA table_info(sales)` ستون‌های generated را نمایش نمی‌دهد. وجود سه ستون محاسباتی بالا از تعریف کامل `CREATE TABLE sales` در `sqlite_master` تأیید شده است. بنابراین خروجی `table_info` به‌تنهایی برای نتیجه‌گیری درباره نبود این ستون‌ها کافی نیست.

هر ردیف فروش مربوط به یک محصول است؛ جدول `sale_items` وجود ندارد. قیمت خرید، قیمت فروش و قیمت مصرف‌کننده در ردیف فروش snapshot می‌شوند.

### debts

| ستون | نوع | محدودیت / مقدار پیش‌فرض |
|---|---|---|
| sale_id | INTEGER | PRIMARY KEY، FK به `sales.id` |
| amount | INTEGER | NOT NULL، CHECK > 0 |
| status | TEXT | NOT NULL، پیش‌فرض `open`؛ فقط `open` یا `settled` |
| created_at | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

هر بدهی به یک فروش وصل است. در این جدول `id` مستقل، `customer_id`، `paid` یا `note` وجود ندارد.

### customers

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `name TEXT NOT NULL`
- `phone TEXT`
- `note TEXT`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`

در جدول `sales` ستون `customer_id` وجود ندارد؛ بنابراین اتصال رابطه‌ای مستقیم بین مشتری و فروش در schema تعریف نشده است. `customer_name` در فروش صرفاً یک مقدار متنی است.

### attendance

- `id INTEGER PRIMARY KEY AUTOINCREMENT`
- `telegram_id INTEGER NOT NULL`، FK به `users.telegram_id`
- `check_in TEXT NOT NULL`
- `check_out TEXT`
- `duration_minutes INTEGER`
- `created_at TEXT NOT NULL DEFAULT datetime('now')`

## 3. روابط خارجی تأییدشده

| جدول فرزند | ستون | جدول والد | ستون والد | ON DELETE زنده |
|---|---|---|---|---|
| product_prices | product_id | products | product_id | NO ACTION |
| inventory | product_id | products | product_id | NO ACTION |
| sales | product_id | products | product_id | NO ACTION |
| debts | sale_id | sales | id | NO ACTION |
| attendance | telegram_id | users | telegram_id | NO ACTION |

برای `customers` و جدول‌های دسته‌بندی/برند/انبار در snapshot، جدول مرجع متناظری برای رابطه خارجی وجود ندارد. خروجی PRAGMA مربوط به این جدول‌های غایب نیز خطا/خروجی معناداری نداشت.

## 4. Triggerهای فعال در دیتابیس زنده

| Trigger | رفتار تأییدشده |
|---|---|
| trg_product_initialize | بعد از INSERT محصول، یک ردیف inventory با quantity=0 و یک ردیف product_prices با قیمت‌های پیش‌فرض می‌سازد. |
| trg_inventory_updated_at | بعد از تغییر quantity، اگر updated_at توسط همان دستور تغییر نکرده باشد، آن را به زمان جاری می‌رساند. |
| trg_prices_updated_at | بعد از UPDATE در product_prices، updated_at را تازه می‌کند. |
| trg_sales_check_stock | قبل از INSERT فروش، موجودی کافی را بررسی می‌کند؛ در غیر این صورت خطای INSUFFICIENT_STOCK می‌دهد. |
| trg_sales_update_stock | بعد از INSERT فروش، quantity موجودی را به اندازه فروش کم می‌کند. |
| trg_sales_create_debt | اگر amount_paid از total_amount کمتر باشد، بدهی به مبلغ اختلاف می‌سازد. |
| trg_sales_prevent_update | هر UPDATE روی sales را با خطای SALES_ARCHIVE_IS_IMMUTABLE رد می‌کند. |
| trg_sales_prevent_delete | هر DELETE روی sales را با خطای SALES_ARCHIVE_IS_IMMUTABLE رد می‌کند. |

**قاعده حیاتی:** در مسیر ثبت فروش نباید کد Worker یا ربات دوباره موجودی را کم کند یا بدهی را جداگانه بسازد؛ این کار را Triggerها انجام می‌دهند. اجرای دوباره همان منطق باعث ثبت دوباره اثر مالی/موجودی می‌شود.

## 5. Indexهای مشاهده‌شده

- `idx_attendance_open` روی `attendance(telegram_id)` با شرط `check_out IS NULL`
- `idx_attendance_user` روی `attendance(telegram_id, check_in)`

در خروجی کامل `sqlite_master`، indexهای sales و debts که در baseline پروژه تعریف شده‌اند مشاهده نشدند.

## 6. اختلاف با Migrationهای مخزن

### Migration 0000 — baseline

تطبیق کلی جدول‌های اصلی و triggerهای اصلی وجود دارد، اما یکسانی کامل schema اثبات نشده است:

1. در D1 زنده، کلیدهای خارجی مشاهده‌شده `ON DELETE NO ACTION` هستند؛ baseline برای آن‌ها `ON DELETE RESTRICT` تعریف می‌کند.
2. تعریف baseline برای `users.role` مقدار پیش‌فرض ندارد؛ دیتابیس زنده `DEFAULT 'employee'` دارد.
3. baseline چند index برای sales و debts تعریف می‌کند که در خروجی زنده وجود ندارند.
4. تعریف trigger `trg_prices_updated_at` در baseline فقط تغییر ستون‌های قیمت را هدف می‌گیرد؛ تعریف زنده بعد از هر UPDATE روی جدول اجرا می‌شود.
5. متن خطای Triggerهای جلوگیری از تغییر فروش در baseline با متن خطای زنده متفاوت است.
6. شرط ساخت بدهی در baseline بر اساس `balance_amount > 0` است؛ تعریف زنده از `amount_paid < total_amount` استفاده می‌کند. با توجه به generated expressionهای فعلی، این دو شرط در حالت عادی معادل‌اند.

### Migration 0001 — product audit

در دیتابیس زنده جدول `product_audit_log`، indexهای آن و Triggerهای جلوگیری از UPDATE/DELETE مشاهده نشدند. کد Worker جدیدی که به این جدول وابسته است، بدون آماده‌سازی این migration در محیط مقصد، هنگام عملیات نوشتن کالا ممکن است شکست بخورد.

### Migration 0002 — inventory master data

هیچ‌یک از جدول‌ها و ستون‌های افزوده‌شده در این migration در snapshot زنده مشاهده نشدند. توجه: نام جدول موقعیت در فایل migration برابر `warehouse_locations` است، نه `locations`.

**هیچ‌یک از این اختلاف‌ها با اجرای دوباره baseline و استفاده از IF NOT EXISTS خودکار اصلاح نمی‌شود.** baseline جدول موجود را بازسازی یا ستون‌های آن را تغییر نمی‌دهد.

## 7. محدودیت‌های قابلیت‌ها بر اساس schema زنده

- کاتالوگ، چهار قیمت و موجودی فعلی در جدول‌های مجزا وجود دارند.
- ثبت فروش از جدول sales و Triggerهای آن استفاده می‌کند.
- بدهی فعلی فقط به فروش متصل است و وضعیت open/settled دارد.
- جدول ledger پرداخت بدهی یا پرداخت‌های چندمرحله‌ای وجود ندارد.
- جدول خرید، اقلام خرید، تأمین‌کننده، هزینه، پرداخت مستقل، فاکتور چندقلمی، مرجوعی یا گردش انبار مستقل در snapshot وجود ندارد.
- دسته‌بندی، برند، بارکد، انبار چندگانه و موقعیت انبار هنوز در schema زنده حاضر نیستند.
- تاریخچه Audit تغییرات کالا در schema زنده حاضر نیست.
- سوابق فروش immutable هستند؛ ویرایش یا حذف فروش از مسیر SQL معمولی با Trigger رد می‌شود.

این موارد به معنی ناممکن بودن همیشگی این قابلیت‌ها نیست؛ یعنی تا طراحی و تصویب migration سازگار، نباید در UI به‌عنوان قابلیت فعال معرفی یا با داده ساختگی شبیه‌سازی شوند.

## 8. دستورات read-only برای تکمیل بررسی

برای مشاهده ستون‌های پنهان/generated در sales:

```sql
PRAGMA table_xinfo(sales);
```

برای بررسی تمام روابط خارجی، هر دستور را جدا اجرا کن تا محدودیت compound SELECT رخ ندهد:

```sql
PRAGMA foreign_key_list(products);
PRAGMA foreign_key_list(product_prices);
PRAGMA foreign_key_list(inventory);
PRAGMA foreign_key_list(sales);
PRAGMA foreign_key_list(debts);
PRAGMA foreign_key_list(customers);
PRAGMA foreign_key_list(attendance);
```

برای بررسی وضعیت یکپارچگی FK:

```sql
PRAGMA foreign_key_check;
```

این دستورات فقط خواندنی‌اند. خروجی `foreign_key_check` ممکن است شامل شناسه ردیف‌های ناسازگار باشد؛ قبل از ارسال، داده حساس را حذف کن.

## 9. سیاست ایمنی تغییرات

- این سند snapshot ساختار است، نه backup داده‌ها.
- قبل از هر migration روی D1 زنده، backup و طرح بازیابی لازم است.
- ابتدا migration باید روی D1 آزمایشی مستقل بررسی شود.
- اجرای migration روی Production فقط پس از تطبیق کامل schema، بررسی وابستگی‌های ربات، و تأیید صریح انجام شود.
- هیچ جدول، trigger، کاربر، رکورد حضور و غیاب، فروش یا بدهی نباید برای هماهنگ‌سازی با کد حذف یا بازنویسی شود.
- پس از هر تغییر schema تأییدشده، این سند با snapshot تازه به‌روزرسانی شود.

## 10. منابع مرجع پروژه

- `worker/migrations/0000_baseline.sql`
- `worker/migrations/0001_product_audit_log.sql`
- `worker/migrations/0002_inventory_master_data.sql`
- `docs/D1_COMPATIBILITY.md`
- `docs/API_CONTRACT.md`

