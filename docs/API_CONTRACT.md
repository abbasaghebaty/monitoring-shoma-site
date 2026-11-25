# قرارداد API نسخه ۱

تمام مسیرها از Worker مستقل پروژه ارائه می‌شوند؛ مرورگر و مصرف‌کننده‌های دیگر مستقیماً به D1 وصل نمی‌شوند.

## قرارداد عمومی
- پاسخ موفق: \`{ "ok": true, "data": {}, "requestId": "..." }\`
- پاسخ خطا: \`{ "ok": false, "error": { "code": "...", "message": "..." }, "requestId": "..." }\`
- تمام مسیرهای خصوصی \`/api/v1/*\` به نشست معتبر نیاز دارند.
- صفحه‌بندی با limit و offset؛ سقف limit برابر ۱۰۰ است.
- نقش‌های معتبر owner، manager و employee در پنل سطح دسترسی یکسان دارند.

## مسیرها
| منبع | مسیر | عملیات |
|---|---|---|
| سلامت | GET /health | اتصال Worker و D1 |
| احراز هویت | /api/v1/auth/* | OTP، ورود، خروج و اطلاعات حساب |
| داشبورد | GET /api/v1/dashboard/summary | آمار و فروش‌های اخیر |
| کاربران | GET /api/v1/users | فهرست و جست‌وجو |
| کالا | GET /api/v1/products | فهرست، جست‌وجو و فیلتر موجودی |
| کالا | GET /api/v1/products/:productId | جزئیات |
| کالا | POST /api/v1/products | ایجاد |
| کالا | PATCH /api/v1/products/:productId | ویرایش |
| قیمت کالا | GET /api/v1/product-prices | فهرست قیمت‌ها؛ فیلتر product_id |
| موجودی | GET /api/v1/inventory | مشاهده موجودی |
| فروش | GET /api/v1/sales و GET /api/v1/sales/:id | فهرست و جزئیات |
| فروش | POST /api/v1/sales | ثبت فروش یک‌قلمی |
| بدهی | GET /api/v1/debts | فهرست بدهی |
| مشتری | GET /api/v1/customers | فهرست و جست‌وجو |
| مشتری | POST /api/v1/customers | ایجاد |
| مشتری | PATCH /api/v1/customers/:id | ویرایش |
| حضور | GET /api/v1/attendance | سوابق |
| حضور | POST /api/v1/attendance/check-in | ثبت ورود حساب جاری |
| حضور | POST /api/v1/attendance/check-out | ثبت خروج حساب جاری |
| گزارش | GET /api/v1/reports/sales | گزارش بازه‌ای |

## قرارداد فروش
POST /api/v1/sales بدنه‌ای شامل product_id، quantity و در صورت نیاز sale_date، sale_time، sale_channel، sell_price، amount_paid، payment_method و customer_name می‌پذیرد. قیمت‌های خرید و مصرف‌کننده از product_prices خوانده و به‌عنوان snapshot ذخیره می‌شوند. جدول فعلی فقط یک محصول در هر ردیف دارد.

**Triggerهای D1 بعد از درج فروش، موجودی را کم و بدهی احتمالی را ایجاد می‌کنند.** API این دو رفتار را تکرار نمی‌کند. سوابق فروش قابل ویرایش یا حذف نیستند.

## محدودیت‌های صریح Schema زنده
- فیلدهای کالا فقط product_id، name، unit، package_quantity، weight، weight_unit و description هستند؛ قیمت‌ها در product_prices نگهداری می‌شوند.
- barcode، category، brand، min_stock و is_active در جدول زنده products وجود ندارند.
- موجودی فقط خواندنی است؛ تغییر مستقیم بدون ledger و تاریخچه حسابرسی فعال نیست.
- تسویه بدهی فعال نیست؛ sales immutable است و جدول پرداخت/تاریخچه تسویه وجود ندارد.
- کاربران فقط خواندنی‌اند؛ تغییر نقش و وضعیت نیازمند مسیر مدیریتی و Audit است.
- خرید، هزینه، فاکتور چندقلمی، تأمین‌کننده، چندانبار و گردش موجودی در schema زنده وجود ندارند.
- POST /api/v1/inventory/adjust و POST /api/v1/debts/:saleId/settle فعلاً 501 LEDGER_REQUIRED برمی‌گردانند.

## توسعه و استفاده مجدد
- routes: قرارداد HTTP و orchestration
- repositories: queryهای D1
- validation: اعتبارسنجی ورودی
- middleware: نشست و دسترسی
- utils: پاسخ‌ها و diagnostics
مسیرها نسخه‌بندی‌شده و مستقل از رابط سایت هستند. برای مصرف‌کننده ماشینی مانند ربات، در مرحله اتصال باید service token محدود و scopeدار تعریف شود؛ توکن نشست مرورگر را در ربات استفاده نکنید.
