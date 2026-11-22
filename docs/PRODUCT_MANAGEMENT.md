# مدیریت اجناس — دامنه و محدودیت‌ها

## پیاده‌سازی این شاخه

صفحه `src/pages/ProductsPage.jsx` به API Worker متصل است و رکوردهای واقعی D1 را می‌خواند.

قابلیت‌های فعال:
- فهرست کالا با pagination
- جست‌وجو بر اساس نام یا `product_id`
- فیلتر کالاهای دارای موجودی / بدون موجودی
- ایجاد کالا با شناسه، نام، واحد، مشخصات بسته‌بندی، وزن، توضیح و قیمت‌ها
- ویرایش مشخصات پایه و قیمت خرید، فروش، مصرف‌کننده و بازار
- نمایش وضعیت loading، empty و error
- دسترسی نوشتن فقط برای نقش‌های `owner` و `manager`

## قرارداد D1

ساختار زنده تغییر نمی‌کند:
- `products`: شناسه متنی، نام، واحد، package_quantity، weight، weight_unit، description
- `product_prices`: purchase_price، sell_price، consumer_price، market_price
- `inventory`: quantity و updated_at

هنگام ایجاد، درج محصول، به‌روزرسانی ردیف قیمت ایجادشده توسط Trigger و درج Audit در یک `DB.batch()` انجام می‌شوند. Trigger موجود `trg_product_initialize` ردیف قیمت و موجودی صفر را ایجاد می‌کند. اگر درج Audit یا ردیف قیمت شکست بخورد، کل batch Rollback می‌شود. کد برنامه موجودی را مستقیماً تغییر نمی‌دهد.

در ویرایش، فقط ستون‌هایی که واقعاً تغییر کرده‌اند نوشته می‌شوند. ابتدا Snapshot کامل کالا و قیمت‌ها در شرط CAS بررسی می‌شود. Audit insert نقش guard را دارد؛ شکست شرط باعث نقض NOT NULL و شکست batch می‌شود. هر UPDATE نیز guard مجزای صفرردیفی دارد. تعارض واقعی با HTTP 409 برمی‌گردد.

## عمداً غیرفعال

موارد زیر در schema تأییدشده وجود ندارند:
- barcode
- category_id یا جدول دسته‌بندی
- is_active / deleted_at
- min_stock
- جدول گردش موجودی یا اسناد خرید
- جدول audit log در schema پایهٔ مستندشده وجود نداشت؛ Migration افزایشی آن در همین شاخه تعریف شده است

بنابراین حذف/غیرفعال‌سازی، بارکد، دسته‌بندی، حداقل موجودی و تغییر موجودی از UI/API فعال نیستند. افزودن آن‌ها به مدل نیازمند پیشنهاد schema حداقلی، بررسی مراجع و تأیید جداگانه است.

## Audit و آمادگی Production

Migration افزایشی `worker/migrations/0001_product_audit_log.sql` جدول `product_audit_log` را تعریف می‌کند. هر رویداد شامل actor Telegram ID، product ID، operation، مقادیر قبلی/جدید JSON، زمان UTC و request ID یکتا است. OTP، نشست، secret و اطلاعات نامرتبط ذخیره نمی‌شوند.

Audit با تغییر کالا در همان D1 batch ثبت می‌شود. UPDATE و DELETE عادی توسط Trigger رد می‌شوند. درخواست HTTP جدید request ID جدید می‌گیرد؛ این API قرارداد Idempotency-Key ندارد، بنابراین retry در قالب درخواست جدید رویداد جدید می‌سازد. دسترسی privileged مستقیم به D1 همچنان قادر به تغییر schema یا حذف Triggerهاست.

Migration فقط در دیتابیس SQLite آزمایشی در تست‌ها اجرا شده است؛ Production اجرا نشده و قبل از هر استفادهٔ زنده نیازمند تأیید و اجرای جداگانه است.

## API

- `GET /api/v1/products?q=&stock=&limit=&offset=`
- `POST /api/v1/products`
- `PATCH /api/v1/products/:productId`

هر سه مسیر به نشست معتبر نیاز دارند. عملیات نوشتن فقط برای `owner` و `manager` مجاز است.
