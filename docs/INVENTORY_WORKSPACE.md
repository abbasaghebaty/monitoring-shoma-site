# فضای مدیریت انبار — اتصال مرحله‌ای

## فاز اول: داده‌های پایه
چهار صفحه دسته‌بندی، برند، انبار و موقعیت انبار به مدل داده و API متصل می‌شوند. مدل افزوده‌شده در Migration 0002 شامل product_categories، product_brands، warehouses، warehouse_locations و inventory_workspace_audit است. ستون‌های افزوده‌شده به products عبارت‌اند از barcode، category_id، brand_id، min_stock و is_active.

APIها زیر مسیر /api/v1/inventory-workspace قرار دارند و عملیات فهرست، ایجاد و ویرایش را ارائه می‌کنند. دسترسی فقط owner/manager و نیازمند نشست معتبر است. تغییرات با updated_at به‌عنوان compare-and-swap محافظت می‌شوند و Audit در همان D1 batch ثبت می‌شود. حذف فیزیکی در این فاز وجود ندارد.

## مرزهای این فاز
این مرحله هنوز موجودی چندانباره را فعال نمی‌کند. جدول inventory فعلی همچنان منبع حقیقت موجودی است تا فروش و Triggerهای موجود بدون تغییر باقی بمانند. گردش، اصلاح، انتقال، خرید و دریافت تا طراحی ledger سازگار فعال نمی‌شوند.

Migration فقط افزایشی است و هیچ جدول یا سابقه‌ای را حذف یا بازنویسی نمی‌کند. اجرای Production ممنوع است تا schema preflight، backup و تأیید مستقل انجام شود.