# مدیریت اجناس — دامنه و محدودیت‌ها

## وضعیت اتصال

صفحه \`src/pages/ProductsPage.jsx\` از API نسخه ۱ استفاده می‌کند. API به schema تأییدشدهٔ زندهٔ D1 متصل است و به جدول‌ها یا ستون‌های migration اجرا‌نشده وابستگی ندارد.

قابلیت‌های فعال:
- فهرست کالا با صفحه‌بندی
- جست‌وجو بر اساس نام یا شناسه
- فیلتر موجودی
- ایجاد کالا با مشخصات واقعی و چهار قیمت
- ویرایش مشخصات و قیمت‌ها
- نمایش loading، empty و error
- دسترسی برای تمام نقش‌های معتبر پس از ورود، مطابق سیاست فعلی پنل

## مدل واقعی داده

- \`products\`: \`product_id\`, \`name\`, \`unit\`, \`package_quantity\`, \`weight\`, \`weight_unit\`, \`description\`, \`created_at\`
- \`product_prices\`: \`product_id\`, \`purchase_price\`, \`sell_price\`, \`consumer_price\`, \`market_price\`, \`updated_at\`
- \`inventory\`: \`product_id\`, \`quantity\`, \`updated_at\`

Trigger \`trg_product_initialize\` بعد از ایجاد کالا، ردیف قیمت و موجودی صفر را می‌سازد. Repository فقط همان ردیف قیمت را به‌روزرسانی می‌کند و ردیف موجودی را دوباره درج نمی‌کند.

## فیلدهای خارج از schema زنده

بارکد، دسته‌بندی، برند، حداقل موجودی و وضعیت فعال‌بودن در جدول زنده products وجود ندارند. فرم سایت این فیلدها را به API ارسال نمی‌کند. بخش‌های پیشرفته دسته‌بندی، برند، انبار و موقعیت تا ایجاد schema سازگار فقط نمای توسعه هستند.

## API

- \`GET /api/v1/products?q=&stock=&limit=&offset=\`
- \`GET /api/v1/products/:productId\`
- \`POST /api/v1/products\`
- \`PATCH /api/v1/products/:productId\`
- \`GET /api/v1/product-prices?product_id=&limit=&offset=\`

قیمت‌ها از جدول مستقل \`product_prices\` خوانده می‌شوند. ایجاد و ویرایش محصول از API محصول انجام می‌شود تا اطلاعات پایه و قیمت‌ها از یک قرارداد واحد مدیریت شوند.

## محدودیت‌های عمدی

- موجودی از صفحه کالا تغییر نمی‌کند.
- حذف کالا فعال نیست.
- Audit کالا در schema زنده وجود ندارد؛ API عملیاتی به جدول Audit مهاجرتی وابسته نیست.
- برای جلوگیری از ادعای نادرست، در این نسخه کنترل هم‌زمانی مبتنی بر Audit/CAS یا ثبت Audit ادعا نمی‌شود.
- هر تغییر schema نیازمند Migration جداگانه، backup و تأیید مستقل است.
