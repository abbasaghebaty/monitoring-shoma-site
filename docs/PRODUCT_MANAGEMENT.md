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

هنگام ایجاد، `INSERT INTO products` و به‌روزرسانی قیمت در یک `DB.batch()` انجام می‌شوند. Trigger موجود `trg_product_initialize` ردیف قیمت و موجودی صفر را ایجاد می‌کند. کد برنامه موجودی را مستقیماً تغییر نمی‌دهد.

## عمداً غیرفعال

موارد زیر در schema تأییدشده وجود ندارند:
- barcode
- category_id یا جدول دسته‌بندی
- is_active / deleted_at
- min_stock
- جدول گردش موجودی یا اسناد خرید
- جدول audit log دائمی

بنابراین حذف/غیرفعال‌سازی، بارکد، دسته‌بندی، حداقل موجودی و تغییر موجودی از UI/API فعال نیستند. افزودن آن‌ها به مدل نیازمند پیشنهاد schema حداقلی، بررسی مراجع و تأیید جداگانه است.

## Audit و آمادگی Production

Worker برای ایجاد و ویرایش، رویداد ساختاریافته `PRODUCT_CREATED` و `PRODUCT_UPDATED` را با نقش عامل و شناسه کالا ثبت می‌کند؛ این رویدادها در Cloudflare Worker Logs هستند و **جای audit log دائمی در D1 را نمی‌گیرند**.

به همین دلیل این پیاده‌سازی برای بازبینی در PR آماده است، اما پیش از فعال‌سازی نوشتن قیمت در Production باید تصمیم گرفته شود که آیا جدول audit log حداقلی لازم است یا نه. در این شاخه هیچ جدول یا migration ایجاد نشده است.

## API

- `GET /api/v1/products?q=&stock=&limit=&offset=`
- `POST /api/v1/products`
- `PATCH /api/v1/products/:productId`

هر سه مسیر به نشست معتبر نیاز دارند. عملیات نوشتن فقط برای `owner` و `manager` مجاز است.
