# خطایابی و قرارداد تشخیصی احراز هویت

این سند مرجع کدهای خطا، شناسهٔ پیگیری و لاگ‌های OTP در Worker با نام `monitoring-shoma-site` است.

## تشخیص 503 فعلی

در کد Worker، پاسخ 503 با متن «سرویس ورود در حال حاضر آماده نیست. با مدیر سامانه تماس بگیرید.» از شرط تنظیمات ضروری در `worker/src/auth/otp.js` تولید می‌شد. شرط شامل نبود یکی از موارد زیر است:

- `DB`
- `SITE_AUTH_KV`
- `OTP_PEPPER`
- `BOT_TOKEN`

در نسخهٔ تشخیصی، این وضعیت با کد `CONFIG_001` برمی‌گردد و لاگ `AUTH_CONFIG_MISSING` نام Binding/Secretهای مفقود را بدون مقدارشان ثبت می‌کند.

این تطبیق کد، منبع برنامه‌ای پاسخ را مشخص می‌کند؛ اما بدون مشاهدهٔ Runtime Logs نمی‌توان تعیین کرد کدام مورد در محیط فعال Cloudflare مفقود بوده است. اگر پاسخ واقعی JSON نباشد یا شناسهٔ پیگیری نداشته باشد، احتمال پاسخ لایهٔ Edge، نسخهٔ قدیمی Worker یا خطای پیش از اجرای برنامه باید جداگانه بررسی شود.

## قرارداد پاسخ

### پاسخ موفق

```json
{
  "ok": true,
  "data": {},
  "requestId": "..."
}
```

### پاسخ خطا

```json
{
  "ok": false,
  "error": {
    "errorCode": "CONFIG_001",
    "message": "پیام امن و قابل‌نمایش برای کاربر",
    "requestId": "...",
    "httpStatus": 503
  },
  "requestId": "...",
  "meta": {
    "requestId": "...",
    "rayId": "..."
  }
}
```

- `errorCode` کد ثابت ماشینی است؛ Frontend نباید از متن پیام برای تشخیص نوع خطا استفاده کند.
- `requestId` برای اتصال پاسخ مرورگر به لاگ‌های همان درخواست استفاده می‌شود.
- `httpStatus` داخل خطا باید با وضعیت واقعی HTTP برابر باشد.
- هدر `X-Request-ID` در پاسخ قرار می‌گیرد.
- اگر Cloudflare هدر `CF-Ray` را برای درخواست فراهم کرده باشد، مقدار شناسهٔ Ray به‌صورت `meta.rayId` و هدر `X-CF-Ray` نیز برگردانده می‌شود.
- CORS هدرهای پیگیری را برای Frontend مجاز به خواندن می‌کند.
- پاسخ‌ها `Cache-Control: no-store` دارند.

## اصل ضد کشف حساب

برای جلوگیری از Account Enumeration، پاسخ عمومی `POST /api/v1/auth/request-otp` برای شناسهٔ ناشناخته، کاربر غیرفعال، محدودیت ارسال، ارسال موفق و شکست ارسال یکسان نگه داشته می‌شود:

- HTTP 202
- پاسخ دارای `status: "unconfirmed"` است و فیلد `ok: true` ندارد؛ این پاسخ نه موفقیت ارسال را تأیید می‌کند و نه وجود حساب را.
- پیام عمومی صریحاً تضمین نمی‌کند که کد ارسال شده است.
- هیچ‌کدام از این حالت‌ها در پاسخ عمومی با کد یا Status متفاوت از هم قابل تشخیص نیستند.
- کد دقیق مانند `AUTH_001`، `AUTH_002`، `OTP_003`، `TG_001` یا `NET_001` فقط در لاگ داخلی ثبت می‌شود.

این یک استثنای امنیتی عمدی در قرارداد پاسخ است. برگرداندن 404 برای کاربر ناشناخته، 403 برای کاربر غیرفعال یا 502 فقط برای خطای تلگرام، می‌تواند وجود حساب مجاز را افشا کند. خطاهای سراسری پیش از بررسی کاربر، مانند نبود تنظیمات یا خرابی D1/KV در مرحلهٔ اولیه، پاسخ خطای استاندارد خود را دارند.

## کاتالوگ کدهای خطا

| کد | مرحله / مفهوم | HTTP معمول | نمایش عمومی |
|---|---|---:|---|
| `CONFIG_001` | Secret یا Binding ضروری موجود نیست | 503 | بله |
| `CONFIG_003` | Origin مجاز نیست | 403 | بله |
| `AUTH_001` | شناسه در D1 پیدا نشد | — | فقط لاگ |
| `AUTH_002` | کاربر در D1 غیرفعال است | — | فقط لاگ |
| `AUTH_003` | قالب Telegram ID نامعتبر است | 400 | بله |
| `DB_002` | Query یا عملیات D1 شکست خورد | 500 | بله |
| `KV_001` | خواندن KV در مرحلهٔ اولیه ناموفق بود | 503 | بله |
| `OTP_001` | تولید/هش OTP ناموفق | 500* | فقط لاگ در request-otp |
| `OTP_002` | ذخیره یا پاک‌سازی OTP ناموفق | 503* | فقط لاگ در request-otp |
| `OTP_003` | محدودیت ارسال مجدد فعال است | 429* | فقط لاگ |
| `OTP_004` | OTP نامعتبر، منقضی یا بیش از حد تلاش | 401 | بله |
| `OTP_005` | ساخت نشست پس از تأیید OTP ناموفق | 503 | بله |
| `TG_001` | Telegram API ارسال را رد کرد | 502* | فقط لاگ |
| `TG_002` | چت خصوصی قابل دسترسی نیست / chat unavailable | 502* | فقط لاگ |
| `NET_001` | Fetch به Telegram API پیش از دریافت پاسخ شکست خورد | 503* | فقط لاگ |
| `INTERNAL_001` | خطای پیش‌بینی‌نشدهٔ Worker | 500 | بله |

`*` در مسیر request-otp به‌دلیل ضد کشف حساب، در پاسخ عمومی به HTTP 202 خنثی تبدیل می‌شود؛ کد تشخیصی در لاگ حفظ می‌شود. در مسیر verify-otp، خطاهای مربوط به اعتبارسنجی و ذخیره‌سازی پاسخ استاندارد خود را دارند.

کدهای قدیمی `code` در پاسخ‌های سایر routeها در مرز Worker به `errorCode` استاندارد تبدیل می‌شوند تا قرارداد Frontend یکپارچه باشد.

## رویدادهای لاگ

هر رویداد ساختاریافته شامل `timestamp`، `requestId`، `rayId` و `stage` است. برای درخواست OTP این رویدادها مهم‌اند:

| رویداد | معنی |
|---|---|
| `SITE_API_INCOMING` | درخواست وارد Worker شد |
| `SITE_API_ORIGIN_REJECTED` | Origin توسط CORS رد شد |
| `OTP_REQUEST_RECEIVED` | handler درخواست OTP اجرا شد |
| `AUTH_CONFIG_MISSING` | تنظیمات ضروری مفقودند؛ فیلد `missingBindings` فقط نام‌ها را دارد |
| `OTP_CONFIG_OK` | وجود چهار تنظیم ضروری تأیید شد؛ اعتبار واقعی BOT_TOKEN را ثابت نمی‌کند |
| `OTP_COOLDOWN_CLEAR` | محدودیت ارسال فعال نبود |
| `OTP_RATE_LIMITED` | محدودیت ارسال مجدد فعال بود |
| `OTP_USER_LOOKUP` | فقط `found` و `active` ثبت شدند؛ شناسه و مشخصات کاربر ثبت نمی‌شوند |
| `AUTH_USER_NOT_FOUND` | کد داخلی `AUTH_001` |
| `AUTH_USER_INACTIVE` | کد داخلی `AUTH_002` |
| `OTP_TELEGRAM_SEND_START` | درخواست ارسال به Telegram API شروع شد |
| `OTP_TELEGRAM_SEND_OK` | Telegram API پیام را پذیرفت |
| `AUTH_DIAGNOSTIC_FAILURE` | خطای ساختاریافته با مرحله، نوع و شرح فنی امن |
| `AUTH_DIAGNOSTIC_DETAILS` | جزئیات مجاز وابستگی؛ برای Telegram شامل status/code/description/retryAfter |
| `OTP_DELIVERY_FAILED` | ارسال تلگرام شکست خورد |
| `OTP_REQUEST_COMPLETED` | تلاش ارسال با پذیرش Telegram API تمام شد |
| `OTP_VERIFY_REQUEST_RECEIVED` | درخواست تأیید OTP دریافت شد |
| `OTP_VERIFY_REJECTED` | تأیید OTP رد شد؛ علت داخلی بدون افشای کد یا شناسه |
| `OTP_VERIFY_SUCCEEDED` | نشست ساخته شد |

### مراحل (stage)

`otp_request_received`, `configuration_validation`, `rate_limit_lookup`, `user_lookup`, `otp_generation`, `otp_storage`, `telegram_delivery`, `cooldown_storage`, `otp_verify_received`, `otp_lookup`, `otp_verification`, `verify_user_lookup`, `otp_consume`, `session_creation`.

### اطلاعاتی که هرگز نباید Log شوند

- مقدار BOT_TOKEN، OTP_PEPPER یا هر Secret
- OTP خام یا hash آن
- Session Token یا hash نشست
- بدنهٔ درخواست یا پاسخ خام Telegram API
- Telegram ID، نام، username یا دادهٔ خصوصی کاربر

شرح فنی خطا محدود و الگوهای توکن و شناسه‌های عددی از آن حذف می‌شوند. برای خطای Telegram فقط این فیلدهای کنترل‌شده ثبت می‌شوند:

- `httpStatus`
- `telegramErrorCode`
- `telegramDescription`
- `retryAfter`

## بررسی در Cloudflare Dashboard

1. وارد Cloudflare Dashboard شو.
2. **Workers & Pages** → Worker با نام دقیق `monitoring-shoma-site`.
3. **Logs** → **Live** را باز کن.
4. یک درخواست آزمایشی انجام بده و با `requestId` پاسخ یا مرورگر، رویدادهای همان درخواست را فیلتر کن.
5. برای خطای تلگرام، رویدادهای `AUTH_DIAGNOSTIC_FAILURE`، `AUTH_DIAGNOSTIC_DETAILS` و `OTP_DELIVERY_FAILED` را بررسی کن.
6. `httpStatus: null` یعنی Fetch پیش از دریافت پاسخ HTTP شکست خورده؛ status عددی همراه `telegramErrorCode` یعنی Telegram API پاسخ داده است.
7. اگر `AUTH_CONFIG_MISSING` ثبت شد، فقط نام‌های `missingBindings` را بررسی کن؛ مقدار Secretها را هرگز کپی یا منتشر نکن.

## تست‌ها

آزمون‌های mock در `worker/tests/auth-diagnostics.test.js` قرار دارند. آن‌ها مسیرهای تنظیمات ناقص، Binding دیتابیس ناموجود، خطای D1، خطای KV، کاربر ناشناخته/غیرفعال، cooldown، خطای API تلگرام، خطای شبکه، ارسال پذیرفته‌شده، requestId و حذف داده‌های حساس از لاگ را پوشش می‌دهند.

این تست‌ها جای آزمون واقعی Cloudflare، D1 زنده یا Telegram API را نمی‌گیرند. پس از انتشار Worker باید یک تست کنترل‌شده و بررسی Runtime Logs انجام شود.

## استقرار

GitHub Actions در این مخزن فقط Frontend استاتیک را روی GitHub Pages منتشر می‌کند و Worker را Deploy نمی‌کند. پس از merge، Worker باید جداگانه از Cloudflare Dashboard یا روش استقرار مجاز پروژه منتشر شود. هیچ تغییری در Telegram webhook لازم نیست.
