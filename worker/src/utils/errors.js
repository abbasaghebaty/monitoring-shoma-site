import { json } from "./response.js";

export const AUTH_ERRORS = Object.freeze({
  CONFIG_MISSING: { errorCode: "CONFIG_001", status: 503, message: "سرویس ورود موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید." },
  DB_UNAVAILABLE: { errorCode: "DB_001", status: 503, message: "ارتباط با پایگاه داده موقتاً برقرار نیست. لطفاً کمی بعد دوباره تلاش کنید." },
  DB_QUERY_FAILED: { errorCode: "DB_002", status: 500, message: "در پردازش درخواست خطایی رخ داد. کد پیگیری را به مدیر سامانه اعلام کنید." },
  KV_UNAVAILABLE: { errorCode: "KV_001", status: 503, message: "سرویس ورود موقتاً در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید." },
  OTP_GENERATION_FAILED: { errorCode: "OTP_001", status: 500, message: "تولید کد ورود با خطا روبه‌رو شد. لطفاً دوباره تلاش کنید." },
  OTP_STORAGE_FAILED: { errorCode: "OTP_002", status: 503, message: "ذخیره موقت اطلاعات ورود انجام نشد. لطفاً کمی بعد دوباره تلاش کنید." },
  OTP_RATE_LIMITED: { errorCode: "OTP_003", status: 429, message: "تعداد درخواست‌های ورود بیش از حد مجاز است. کمی بعد دوباره تلاش کنید." },
  OTP_INVALID: { errorCode: "OTP_004", status: 401, message: "کد ورود معتبر نیست یا منقضی شده است." },
  OTP_SESSION_FAILED: { errorCode: "OTP_005", status: 503, message: "ساخت نشست ورود موقتاً ممکن نیست. لطفاً دوباره تلاش کنید." },
  TELEGRAM_DELIVERY_FAILED: { errorCode: "TG_001", status: 502, message: "ارسال کد تأیید انجام نشد. لطفاً وضعیت ارتباط خود با ربات را بررسی کنید." },
  TELEGRAM_CHAT_UNAVAILABLE: { errorCode: "TG_002", status: 502, message: "ربات تلگرام به گفت‌وگوی خصوصی شما دسترسی ندارد. ربات را باز کنید و /start را بزنید." },
  NETWORK_FAILED: { errorCode: "NET_001", status: 503, message: "ارتباط با سرویس ارسال پیام موقتاً برقرار نیست. لطفاً کمی بعد دوباره تلاش کنید." },
  INTERNAL: { errorCode: "INTERNAL_001", status: 500, message: "خطای داخلی سرویس رخ داد. کد پیگیری را به مدیر سامانه اعلام کنید." },
});

export function errorResponse(error, extra = {}) {
  return json({
    ok: false,
    error: {
      errorCode: error.errorCode,
      message: error.message,
      ...extra,
    },
  }, error.status);
}

export function publicOtpOutcome() {
  // Same status and body for unknown, inactive, rate-limited, delivered and failed delivery.
  // This intentionally prevents account enumeration and does not claim that a message was sent.
  return json({
    status: "unconfirmed",
    data: {
      message: "درخواست بررسی شد. اگر حساب فعال و مجاز باشد، در صورت امکان کد ورود از طریق تلگرام در اختیارتان قرار می‌گیرد. اگر کدی دریافت کردید، آن را وارد کنید.",
    },
  }, 202);
}
