# قرارداد API نسخه ۱

## قالب پاسخ

موفق:

```json
{ "ok": true, "data": {}, "requestId": "..." }
```

خطا:

```json
{
  "ok": false,
  "error": {
    "errorCode": "CONFIG_001",
    "message": "پیام امن برای کاربر",
    "requestId": "...",
    "httpStatus": 503
  },
  "requestId": "...",
  "meta": { "requestId": "...", "rayId": "..." }
}
```

- تمام پاسخ‌های JSON Worker دارای `requestId` هستند؛ هدر `X-Request-ID` نیز برگردانده می‌شود.
- اگر Cloudflare Ray ID در درخواست وجود داشته باشد، در `meta.rayId` و هدر `X-CF-Ray` برگردانده می‌شود.
- خطاها از `errorCode` ثابت استفاده می‌کنند؛ `httpStatus` داخل خطا با وضعیت واقعی HTTP برابر است.
- پاسخ‌ها `Cache-Control: no-store` دارند.
- جزئیات فنی، Stack Trace، Secret و اطلاعات خصوصی در پاسخ عمومی قرار نمی‌گیرند.

کاتالوگ کامل خطاها و رویدادها در [AUTH_DIAGNOSTICS.md](AUTH_DIAGNOSTICS.md) است.

## احراز هویت

- POST /api/v1/auth/request-otp — body: { "telegramId": "..." }
- POST /api/v1/auth/verify-otp — body: { "telegramId": "...", "code": "000000" }
- POST /api/v1/auth/logout
- GET /api/v1/auth/me

### قرارداد امنیتی request-otp

برای جلوگیری از Account Enumeration، درخواست معتبر OTP برای حساب ناشناخته، غیرفعال، محدودشده، ارسال‌شده یا دارای شکست ارسال، پاسخ عمومی یکسان HTTP 202 با `status: "unconfirmed"` و پیام خنثی دریافت می‌کند؛ بدنه `ok: true` ندارد و تأیید تحویل پیام نیست. کد خطای دقیق این وضعیت‌ها فقط در Worker Logs ثبت می‌شود. خطاهای سراسری پیش از بررسی حساب، مانند تنظیمات ناقص یا خرابی اولیهٔ D1/KV، پاسخ خطای استاندارد با requestId دارند.

کد OTP پنج دقیقه اعتبار دارد و پس از پنج تلاش ناموفق حذف می‌شود. نشست حداکثر ۱۲ ساعت اعتبار دارد. نقش در هر درخواست از رکورد فعال users دوباره بررسی می‌شود.

## منابع خواندنی

- GET /health
- GET /api/v1/dashboard/summary
- GET /api/v1/products?q=&limit=&offset=
- GET /api/v1/inventory?q=&limit=&offset=
- GET /api/v1/sales?from=&to=&channel=&limit=&offset=
- GET /api/v1/sales/:id
- GET /api/v1/debts?status=open|settled&limit=&offset=
- GET /api/v1/customers?q=&limit=&offset=
- GET /api/v1/attendance?from=&to=&limit=&offset=
- GET /api/v1/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&channel=

## مدیریت کالا

- `POST /api/v1/products` — ایجاد کالا بر اساس ستون‌های واقعی `products` و قیمت‌های `product_prices`؛ Trigger موجود، ردیف موجودی صفر را ایجاد می‌کند.
- `PATCH /api/v1/products/:productId` — ویرایش مشخصات پایه و چهار نوع قیمت؛ شناسه اصلی کالا تغییر نمی‌کند.
- هر دو مسیر فقط برای نقش‌های `owner` و `manager` و فقط با نشست معتبر مجازند.
- جست‌وجوی `GET /api/v1/products` بر اساس نام یا شناسه است و فیلتر موجودی `stock=in_stock|out_of_stock` را می‌پذیرد.
- حذف، غیرفعال‌سازی، بارکد، دسته‌بندی و تغییر موجودی در این قرارداد نیستند؛ schema فعلی آن‌ها را پشتیبانی نمی‌کند.

## مجوز

- owner و manager: منابع مدیریتی خواندنی
- employee: فقط attendance خودش
- هر مسیر داده بدون نشست معتبر رد می‌شود.
- نقش یا شناسه کاربر از Frontend برای تعیین مجوز پذیرفته نمی‌شود.

## موارد خارج از schema

API خرید، تأمین‌کننده، هزینه، invoice چندقلمی، ledger پرداخت و تاریخچه پرداخت بدهی در این نسخه وجود ندارد. جدول‌های متناظر در schema تأییدشده نیستند؛ نباید داده‌ای جعل شود.

## اصول داده

- محصولات از products و join با product_prices و inventory خوانده می‌شوند.
- فروش از sales و بدهی از debts.sale_id خوانده می‌شود.
- attendance فقط SELECT است و هیچ write endpoint برای آن وجود ندارد.
- هیچ migration یا تغییر D1 در این شاخه انجام نمی‌شود.
