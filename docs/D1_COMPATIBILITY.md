# قرارداد Schema و تطبیق با Cloudflare D1

## تصمیم فعلی

Schema canonical پروژه در worker/migrations تعریف می‌شود. فایل 0000_baseline.sql دیتابیس تازه را از صفر می‌سازد و 0001_product_audit_log.sql Audit را اضافه می‌کند. Baseline از CREATE TABLE/INDEX/TRIGGER IF NOT EXISTS استفاده می‌کند؛ برای اشیای موجود DDL را تغییر نمی‌دهد و داده‌ای را حذف یا بازنویسی نمی‌کند.

- Migrationها در CI و محیط محلی/آزمایشی اجرا می‌شوند؛ در این PR هیچ Migration یا query نوشتنی به Production D1 ارسال نشده است.
- دیتابیس میزبانی‌شده در این مرحله دوباره inspect نشده؛ snapshot زیر آخرین snapshot مستندشده و دریافت‌شده در 2026-11-17 است، نه ادعای وضعیت فعلی Remote.
- پیش از اعمال Migration روی دیتابیس موجود، sqlite_master، PRAGMA table_info، foreign_key_list، index_list و تعریف Triggerها باید read-only با قرارداد canonical مقایسه شوند.
- اگر جدول یا Trigger موجود تعریف ناسازگار داشته باشد، IF NOT EXISTS آن را تعمیر نمی‌کند. اجرای Migration باید متوقف و Migration اصلاحی forward-only با backfill/validation جداگانه طراحی شود.
- Frontend فقط از API Worker استفاده می‌کند؛ اتصال مستقیم مرورگر به D1 ممنوع است.

این snapshot بر اساس خروجی کامل `sqlite_master` و PRAGMAهایی است که در 2026-11-17 ارسال شد. `_cf_KV` و `sqlite_sequence` جداول سیستمی/زیرساختی‌اند و جزو مدل دامنه فروشگاه نیستند.

## Schema تأییدشده

### `products`

| ستون | نوع | قاعده |
|---|---|---|
| `product_id` | TEXT | PRIMARY KEY |
| `name` | TEXT | NOT NULL |
| `unit` | TEXT | NOT NULL، پیش‌فرض `'عدد'` |
| `package_quantity` | INTEGER | nullable |
| `weight` | REAL | nullable |
| `weight_unit` | TEXT | nullable |
| `description` | TEXT | nullable |
| `created_at` | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

**نکته:** شناسه محصول رشته‌ای است؛ فرض عددی بودن شناسه و `products.id` اشتباه است. ستون‌های قیمت، موجودی و وضعیت فعال در این جدول وجود ندارند.

### `product_prices`

| ستون | نوع | قاعده |
|---|---|---|
| `product_id` | TEXT | PRIMARY KEY، FK به `products.product_id` |
| `purchase_price` | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| `sell_price` | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| `consumer_price` | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| `market_price` | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| `updated_at` | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

### `inventory`

| ستون | نوع | قاعده |
|---|---|---|
| `product_id` | TEXT | PRIMARY KEY، FK به `products.product_id` |
| `quantity` | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| `updated_at` | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

### `sales`

| ستون | نوع | قاعده |
|---|---|---|
| `id` | INTEGER | PRIMARY KEY AUTOINCREMENT |
| `product_id` | TEXT | NOT NULL، FK به `products.product_id` |
| `quantity` | INTEGER | NOT NULL، CHECK > 0 |
| `sale_date` | TEXT | NOT NULL |
| `sale_time` | TEXT | NOT NULL |
| `sale_channel` | TEXT | NOT NULL |
| `purchase_price` | INTEGER | NOT NULL، snapshot |
| `sell_price` | INTEGER | NOT NULL، snapshot |
| `consumer_price` | INTEGER | NOT NULL، snapshot |
| `amount_paid` | INTEGER | NOT NULL، پیش‌فرض 0، CHECK >= 0 |
| `payment_method` | TEXT | NOT NULL |
| `total_amount` | INTEGER | STORED generated: `quantity * sell_price` |
| `balance_amount` | INTEGER | STORED generated: `quantity * sell_price - amount_paid` |
| `discount_amount` | INTEGER | STORED generated: `MAX(consumer_price - sell_price, 0) * quantity` |
| `created_at` | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |
| `customer_name` | TEXT | nullable |

هر ردیف `sales` یک محصول و تعداد آن را ثبت می‌کند؛ جدول `sale_items` وجود ندارد. قیمت‌های خرید و فروش هنگام ثبت، در خود ردیف فروش snapshot می‌شوند.

### `debts`

| ستون | نوع | قاعده |
|---|---|---|
| `sale_id` | INTEGER | PRIMARY KEY، FK به `sales.id` |
| `amount` | INTEGER | NOT NULL، CHECK > 0 |
| `status` | TEXT | NOT NULL، پیش‌فرض `open`، فقط `open` یا `settled` |
| `created_at` | TEXT | NOT NULL، پیش‌فرض `datetime('now')` |

بدهی به فروش وصل است؛ `debts.id`، `customer_id`، `customer_name`، `paid` و `note` در این جدول وجود ندارند. نام مشتری در صورت وجود، از `sales.customer_name` می‌آید.

### `customers`

`id INTEGER PRIMARY KEY AUTOINCREMENT`, `name TEXT NOT NULL`, `phone TEXT`, `note TEXT`, `created_at TEXT NOT NULL DEFAULT datetime('now')`.

در `sales` فعلی `customer_id` وجود ندارد؛ ارتباط مستقیم مشتری با فروش از طریق شناسه مشتری در schema تعریف نشده است.

### `users` و `attendance`

- `users`: `telegram_id` (INTEGER PRIMARY KEY)، `full_name` (TEXT NOT NULL)، `username`، `role` (یکی از owner/manager/employee)، `is_active` (پیش‌فرض 1)، `created_at`.
- `attendance`: `id` (INTEGER PRIMARY KEY AUTOINCREMENT)، `telegram_id` (FK به users)، `check_in` (TEXT NOT NULL)، `check_out`، `duration_minutes`، `created_at`.

این دو جدول توسط کد حضور و غیاب ربات استفاده می‌شوند؛ queryهای سازگار آن بخش نباید بی‌دلیل تغییر کنند.

## Triggerها و قواعد عملیاتی تأییدشده

- `trg_product_initialize`: پس از درج محصول، یک ردیف موجودی با مقدار صفر و یک ردیف قیمت با مقادیر پیش‌فرض ایجاد می‌کند.
- `trg_sales_check_stock`: قبل از درج فروش، موجودی کافی را کنترل می‌کند؛ در غیر این صورت `INSUFFICIENT_STOCK`.
- `trg_sales_update_stock`: پس از درج فروش، موجودی را به اندازه `quantity` کم می‌کند.
- `trg_sales_create_debt`: اگر `amount_paid < total_amount` باشد، بدهی متناظر را در `debts` می‌سازد.
- `trg_sales_prevent_update` و `trg_sales_prevent_delete`: سوابق فروش را immutable می‌کنند.
- `trg_inventory_updated_at` و `trg_prices_updated_at`: زمان به‌روزرسانی را مدیریت می‌کنند.
- indexهای attendance: `idx_attendance_open` و `idx_attendance_user`.

## ناسازگاری‌های قطعی کد قدیمی ربات

فایل `monitoring-shoma-bot/src/db/shop.js` و handlerهای فروشگاه هنوز فرض‌های قدیمی دارند:

- `products.id`, `is_active`, `stock` و قیمت‌ها داخل `products`.
- شناسه محصول عددی.
- جدول‌های `purchases`, `purchase_items`, `sale_items`, `payments`, `shortages`.
- ستون‌های `sales.customer_id`, `paid_amount`, `debt_amount`, `sale_type`, `note`.
- ستون‌های `debts.id`, `customer_id`, `customer_name`, `paid`, `note`.

هیچ‌یک از جدول‌های `payments`, `sale_items`, `purchases`, `purchase_items`, `shortages` در snapshot جاری وجود ندارد.

### محدودیت‌هایی که نباید با راه‌حل ساختگی پنهان شوند

- پرداخت چندبخشی با چند روش، در مدل فعلی فروش قابل ثبت به‌صورت چند ردیف نیست؛ فقط `amount_paid` و `payment_method` وجود دارد.
- پرداخت جزئی بدهی بدون ledger پرداخت، قابل ردیابی نیست. تغییر مقدار بدهی برای تقلید از پرداخت، تاریخچه را از بین می‌برد.
- سابقه خرید در جدول مستقل ثبت نمی‌شود؛ افزایش موجودی به‌تنهایی نباید به‌عنوان «ثبت خرید کامل» معرفی شود.
- جدول کسری موجودی وجود ندارد؛ گزارش کسری فعلی نباید از جدول فرضی خوانده شود.
- چون فروش immutable است، اصلاح یا حذف فروش از مسیر UPDATE/DELETE مجاز نیست.

تا زمانی که قابلیت‌های بالا در قرارداد موجود دیتابیس پشتیبانی نمی‌شوند، باید در UI/ربات غیرفعال یا صریحاً به‌عنوان پشتیبانی‌نشده معرفی شوند؛ نه اینکه جدول جدید ساخته شود.

## قرارداد تطبیق کد

1. queryهای ربات با `products.product_id`، `product_prices` و `inventory` بازنویسی شوند.
2. درج محصول فقط در `products` انجام شود و trigger ردیف‌های قیمت و موجودی را بسازد.
3. تغییر قیمت در `product_prices` انجام شود؛ موجودی فقط در `inventory`.
4. درج فروش مطابق ستون‌های واقعی `sales` انجام شود و triggerها موجودی و بدهی را مدیریت کنند؛ کد نباید همان کار را دوباره انجام دهد.
5. repositoryهای Worker دقیقاً همین مدل را مصرف کنند.
6. routeهای خصوصی تا تکمیل auth و permission طبق `SECURITY_AND_NEXT_STEPS.md` داده برنگردانند.
7. هر تست نوشتنی روی محیط آزمایشی جداگانه انجام شود؛ از داده زنده برای تست استفاده نشود.

**ممنوع در این PR:** اجرای ALTER/DROP یا هر Migration روی Production، حذف جدول/Trigger، یا بازنویسی داده زنده. تغییرات schema مجاز فقط از طریق Migration نسخه‌دار و پس از preflight و تأیید مستقل هستند.

## افزونهٔ افزایشی Audit کالا (شاخه PR #4)

Migration جدید `worker/migrations/0001_product_audit_log.sql` یک جدول مستقل `product_audit_log` اضافه می‌کند و ساختار جدول‌های عملیاتی موجود را تغییر نمی‌دهد.

- `users.telegram_id` در snapshot تأییدشده INTEGER PRIMARY KEY است؛ ستون عامل در Audit نیز INTEGER و دارای FK با `ON DELETE RESTRICT` است.
- `products.product_id` در snapshot تأییدشده TEXT PRIMARY KEY است؛ ستون محصول در Audit نیز TEXT و دارای FK با `ON DELETE RESTRICT` است.
- `request_id` در هر رویداد UNIQUE است؛ Worker برای هر درخواست HTTP یک UUID جدید تولید می‌کند.
- `previous_values` برای CREATE برابر NULL و برای UPDATE یک JSON object از فیلدهای واقعاً تغییرکرده است.
- `new_values` یک JSON object فقط از فیلدهای واقعاً تغییرکرده (یا تمام مقادیر آغازین در CREATE) است.
- Triggerهای BEFORE UPDATE و BEFORE DELETE تغییر و حذف عادی رویدادهای Audit را رد می‌کنند.
- Migration در PR تعریف شده، اما روی Production اجرا نشده است.

### اجرای آزمایشی

تست‌های SQLite دیگر fixture دستی ندارند؛ worker/tests/helpers/sqlite-d1.js فایل‌های 0000_baseline.sql و 0001_product_audit_log.sql را به‌ترتیب روی دیتابیس in-memory اعمال می‌کند. تست D1 محلی نیز همین فایل‌ها را از binding ایزوله Miniflare اجرا می‌کند.

برای اجرای دستی Wrangler فقط در حالت محلی:

```sh
npx wrangler d1 migrations apply shop-manager --local --config worker/wrangler.toml
```

از حذف گزینهٔ `--local` خودداری کنید. دستور بالا در این فاز اجرا نشده است.

### Atomicity و هم‌زمانی

در UPDATE، ابتدا Audit insert با شرط EXISTS روی Snapshot کامل خوانده‌شده (فیلدهای پایه و هر چهار قیمت) انجام می‌شود. اگر Snapshot تغییر کرده یا ردیف قیمت وجود نداشته باشد، actor به NULL تبدیل می‌شود و NOT NULL باعث شکست batch می‌شود. سپس فقط ستون‌های تغییرکرده UPDATE می‌شوند؛ بعد از هر UPDATE یک guard درج صفرردیفی دارد که در صورت `changes() = 0` عمداً NOT NULL را نقض می‌کند. D1 batch همهٔ این دستورات را در یک تراکنش اجرا می‌کند؛ هر شکست، Audit و تغییرات قبلی همان batch را Rollback می‌کند.

این راهبرد محافظه‌کارانه است: حتی تغییر هم‌زمان دو فیلد مستقل باعث 409 برای درخواست دوم می‌شود و کاربر باید دادهٔ تازه را بارگذاری کند. دسترسی privileged مستقیم به D1 همچنان می‌تواند schema، triggerها یا رکوردها را تغییر دهد؛ append-only بودن در برابر مدیر دارای اختیار DDL تضمین مطلق نیست.

### محدودهٔ اثبات تست SQLite

Migrationهای مخزن اکنون مرجع ساخت دیتابیس آزمایشی‌اند؛ fixture جداگانه حذف شده است. این کار drift میان تست و زنجیرهٔ Migration را کاهش می‌دهد. بااین‌حال، Migration baseline بر اساس schema snapshot مستندشده ساخته شده، نه از dump تازهٔ Remote. بنابراین برابری کامل آن با D1 میزبانی‌شده هنوز اثبات نشده و نیازمند مقایسهٔ read-only در Cloudflare Dashboard است.


### وابستگی استقرار

کد Worker این شاخه برای CREATE/UPDATE موفق به وجود جدول و Triggerهای Audit وابسته است. اگر Worker جدید بدون اجرای Migration متناظر در محیط هدف منتشر شود، عملیات نوشتن محصول شکست می‌خورند. ترتیب لازم پس از تأیید مستقل: backup و برنامه بازیابی، اجرای Migration روی محیط آزمایشی، بررسی schema/Triggerها، سپس اجرای Migration در محیط هدف و Deploy هماهنگ Worker. هیچ‌یک از این مراحل Production در این PR انجام نشده است.



## آزمون D1 محلی در CI

علاوه بر تست‌های Node.js و SQLite، فایل `tests/d1-runtime.test.js` با افزونه رسمی Workers Vitest در runtime محلی `workerd` اجرا می‌شود. Binding دیتابیس از `worker/wrangler.toml` خوانده می‌شود؛ چون هیچ `remote = true` تعریف نشده، Miniflare از D1 محلی و ایزوله استفاده می‌کند. Migrationهای واقعی baseline و audit فقط روی همین binding محلی اجرا می‌شوند.

فرمان اجرا از ریشه مخزن:

```sh
npm run test:d1
```

این آزمون‌ها خود API واقعی D1 در محیط محلی Cloudflare Workers/Miniflare را به کار می‌گیرند؛ از جمله `DB.batch()`، `DB.exec()`، `meta.changes`، Triggerها و رفتار هم‌زمانی دو درخواست. آن‌ها از adapter مبتنی بر `node:sqlite` جدا هستند.

**مرز اثبات:** Miniflare از runtime و پیاده‌سازی شبیه‌ساز D1 استفاده می‌کند و به دیتابیس میزبانی‌شدهٔ Production متصل نیست. بنابراین این تست‌ها اثبات اجرای واقعی روی Cloudflare account یا برابری کامل محیط محلی و hosted D1 نیستند. بررسی read-only Schema/Trigger واقعی و یک آزمون کنترل‌شده روی D1 غیر Production، پیش از تأیید نهایی عملیاتی، همچنان لازم است.

CI برای نصب وابستگی‌ها از npm 11 استفاده می‌کند تا با خطای resolver در npm 10 هنگام حل peer dependencies مربوط به Vitest مواجه نشود. این تغییر صرفاً ابزار CI است و به runtime Worker یا دیتابیس دست نمی‌زند.


## Canonical schema: responsibilities and constraints

| Table | Responsibility / key | Relationships and key constraints |
|---|---|---|
| users | حساب‌های اپ؛ telegram_id INTEGER PRIMARY KEY | role محدود به owner/manager/employee؛ full_name الزامی؛ is_active پیش‌فرض 1 |
| products | کاتالوگ؛ product_id TEXT PRIMARY KEY | شناسهٔ رشته‌ای؛ نام الزامی؛ مشخصات بسته nullable |
| product_prices | چهار قیمت جاری؛ PK و FK روی product_id | قیمت‌ها INTEGER، NOT NULL، پیش‌فرض صفر و CHECK غیرمنفی |
| inventory | موجودی جاری؛ PK و FK روی product_id | quantity INTEGER، NOT NULL، پیش‌فرض صفر و CHECK غیرمنفی |
| sales | هر ردیف یک فروش محصول با snapshot قیمت | FK به products؛ quantity مثبت؛ مبالغ مشتق‌شده STORED generated؛ UPDATE/DELETE ممنوع |
| debts | ماندهٔ بدهی فروش | sale_id هم PK و هم FK به sales؛ amount مثبت؛ status فقط open/settled |
| customers | فهرست مشتریان مستقل | id INTEGER AUTOINCREMENT؛ sales.customer_name فقط snapshot متنی است و FK مشتری ندارد |
| attendance | ورود/خروج کاربران | FK عددی به users.telegram_id؛ check_in الزامی |
| product_audit_log | رویدادهای تغییر کالا | FK به users و products؛ operation محدود؛ JSON object؛ request_id یکتا؛ UPDATE/DELETE با Trigger رد می‌شود |

### Triggerها و Indexهای baseline

- trg_product_initialize: بعد از ایجاد محصول، inventory با quantity=0 و product_prices با قیمت‌های پیش‌فرض ایجاد می‌کند.
- trg_sales_check_stock: فروش با موجودی ناکافی را با INSUFFICIENT_STOCK رد می‌کند.
- trg_sales_update_stock: بعد از درج فروش، موجودی را کم می‌کند.
- trg_sales_create_debt: برای balance مثبت، یک بدهی متصل به sales.id می‌سازد.
- trg_sales_prevent_update و trg_sales_prevent_delete: فروش را immutable می‌کنند.
- trg_inventory_updated_at و trg_prices_updated_at: timestamp را در تغییر مقدار/قیمت تازه می‌کنند.
- Indexهای attendance، sales، debts و Audit برای فیلترها و ترتیب‌های استفاده‌شده توسط Worker تعریف شده‌اند.

### Migration order و initialization

از ریشه repository اجرا کن: npx wrangler d1 migrations list shop-manager --local --config worker/wrangler.toml و سپس npx wrangler d1 migrations apply shop-manager --local --config worker/wrangler.toml. Wrangler باید 0000_baseline.sql را پیش از 0001_product_audit_log.sql اعمال کند. این فرمان فقط دیتابیس محلی Wrangler را هدف می‌گیرد. در CI، فایل‌ها مستقیماً و به همین ترتیب روی D1 محلی Miniflare و SQLite in-memory اجرا می‌شوند.

### Adopting an existing D1 database safely

Baseline برای دیتابیس موجود idempotent است اما migration repair نیست. پیش از هر اجرای remote:
1. از sqlite_master تعریف همهٔ جدول‌ها، indexها و Triggerها را export/read کنید.
2. برای تمام جدول‌های بالا PRAGMA table_info، foreign_key_list، index_list و foreign_key_check اجرا کنید.
3. تعریف‌ها را با baseline و این سند مقایسه کنید.
4. اگر تعریف موجود mismatch دارد، اجرای baseline/audit را متوقف کنید و migration اصلاحی مشخص بسازید؛ IF NOT EXISTS ستون‌ها یا Triggerهای موجود را تغییر نمی‌دهد.
5. اگر schema برابر است، پس از backup و تأیید مستقل، migrationهای pending را با Wrangler اجرا کنید. هرگز با دست جدول d1_migrations را تغییر ندهید.

**Physical database status: Not verified in this task.** هیچ Cloudflare D1 connector یا دسترسی Dashboard/remote SQL در این محیط در دسترس نبود. بنابراین خالی/نیمه‌کاره/کامل بودن دیتابیس واقعی قابل اعلام نیست.


## Migration 0002 — inventory master data

The additive migration adds product barcode/category/brand/minimum-stock/active fields and the category, brand, warehouse, warehouse-location and inventory-workspace-audit tables. It does not rewrite existing product, inventory, sales, debt, customer, user or attendance rows. It has not been applied to hosted D1. Before any remote execution, compare the hosted schema read-only against the full migration chain and take a backup.
