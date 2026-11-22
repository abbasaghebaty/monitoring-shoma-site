import { json } from "../utils/response.js";
import { AUTH_ERRORS, errorResponse, publicOtpAccepted } from "../utils/errors.js";
import { logEvent, logFailure } from "../utils/diagnostics.js";
import { randomOtp, randomToken, sha256 } from "./crypto.js";

const OTP_TTL = 300;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

function setStage(context, stage) {
  if (context) context.stage = stage;
}

function logOtpFailure(context, errorCode, stage, error, dependency, metadata = {}) {
  logFailure(context, { errorCode, stage, error, dependency, httpStatus: error?.httpStatus });
  if (Object.keys(metadata).length) {
    logEvent(context, "error", "AUTH_DIAGNOSTIC_DETAILS", {
      errorCode,
      ...metadata,
    });
  }
}

function missingConfig(env, includeBot = true) {
  const missing = [];
  if (!env.DB) missing.push("DB");
  if (!env.SITE_AUTH_KV) missing.push("SITE_AUTH_KV");
  if (!env.OTP_PEPPER) missing.push("OTP_PEPPER");
  if (includeBot && !env.BOT_TOKEN) missing.push("BOT_TOKEN");
  return missing;
}

function configFailure(context, missing) {
  logEvent(context, "error", "AUTH_CONFIG_MISSING", {
    errorCode: AUTH_ERRORS.CONFIG_MISSING.errorCode,
    missingBindings: missing,
  });
  return errorResponse(AUTH_ERRORS.CONFIG_MISSING);
}

async function sendTelegramMessage(env, telegramId, message) {
  if (!env.BOT_TOKEN) {
    const error = new Error("BOT_TOKEN is not configured");
    error.code = "BOT_TOKEN_MISSING";
    throw error;
  }

  let response;
  try {
    response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: telegramId, text: message, protect_content: true }),
    });
  } catch (cause) {
    const error = new Error("Telegram API fetch failed");
    error.name = cause?.name || "FetchError";
    error.code = "NETWORK_FAILED";
    throw error;
  }

  let result = null;
  try {
    result = await response.json();
  } catch {
    // A non-JSON response is still a failed Telegram delivery; do not log its raw body.
  }

  if (!response.ok || result?.ok !== true) {
    const error = new Error(
      typeof result?.description === "string" ? result.description.slice(0, 300) : "Telegram returned an invalid response"
    );
    error.code = "TELEGRAM_REJECTED";
    error.httpStatus = response.status;
    error.telegramErrorCode = Number.isInteger(result?.error_code) ? result.error_code : null;
    error.telegramDescription = typeof result?.description === "string" ? result.description.slice(0, 300) : null;
    error.retryAfter = Number.isInteger(result?.parameters?.retry_after) ? result.parameters.retry_after : null;
    throw error;
  }

  return result.result;
}

async function safeDeleteOtp(env, key, context) {
  try {
    await env.SITE_AUTH_KV.delete(key);
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "otp_cleanup", error, "KV");
  }
}

export async function requestOtp(request, env, context = null) {
  setStage(context, "otp_request_received");
  logEvent(context, "info", "OTP_REQUEST_RECEIVED");

  const body = await request.json().catch(() => ({}));
  const telegramId = String(body.telegramId || "").trim();
  if (!/^\d{5,15}$/.test(telegramId)) {
    return errorResponse({
      errorCode: "AUTH_003",
      status: 400,
      message: "شناسه تلگرام معتبر نیست.",
    });
  }

  const missing = missingConfig(env, true);
  if (missing.length) return configFailure(context, missing);
  logEvent(context, "info", "OTP_CONFIG_OK", { dependencyStatus: "configured" });

  const cooldownKey = `otp-cooldown:${telegramId}`;
  let isCoolingDown;
  try {
    setStage(context, "rate_limit_lookup");
    isCoolingDown = Boolean(await env.SITE_AUTH_KV.get(cooldownKey));
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.KV_UNAVAILABLE.errorCode, "rate_limit_lookup", error, "KV");
    return errorResponse(AUTH_ERRORS.KV_UNAVAILABLE);
  }

  if (isCoolingDown) {
    logEvent(context, "warn", "OTP_RATE_LIMITED", {
      errorCode: AUTH_ERRORS.OTP_RATE_LIMITED.errorCode,
      outcome: "generic_response",
    });
    return publicOtpAccepted();
  }
  logEvent(context, "info", "OTP_COOLDOWN_CLEAR");

  let user;
  try {
    setStage(context, "user_lookup");
    user = await env.DB.prepare(
      "SELECT telegram_id, full_name, is_active FROM users WHERE telegram_id = ? LIMIT 1"
    ).bind(Number(telegramId)).first();
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.DB_QUERY_FAILED.errorCode, "user_lookup", error, "D1");
    return errorResponse(AUTH_ERRORS.DB_QUERY_FAILED);
  }

  const isActive = Boolean(user && Number(user.is_active) === 1);
  logEvent(context, "info", "OTP_USER_LOOKUP", { found: Boolean(user), active: isActive });

  // Do not reveal whether a Telegram ID exists or is active to the caller.
  if (!user) {
    logEvent(context, "warn", "AUTH_USER_NOT_FOUND", { errorCode: "AUTH_001" });
    return publicOtpAccepted();
  }
  if (!isActive) {
    logEvent(context, "warn", "AUTH_USER_INACTIVE", { errorCode: "AUTH_002" });
    return publicOtpAccepted();
  }

  let code;
  let record;
  try {
    setStage(context, "otp_generation");
    code = randomOtp();
    record = {
      hash: await sha256(`${telegramId}:${code}:${env.OTP_PEPPER}`),
      attempts: 0,
    };
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_GENERATION_FAILED.errorCode, "otp_generation", error, "WebCrypto");
    return errorResponse(AUTH_ERRORS.OTP_GENERATION_FAILED);
  }

  const otpKey = `otp:${telegramId}`;
  try {
    setStage(context, "otp_storage");
    await env.SITE_AUTH_KV.put(otpKey, JSON.stringify(record), { expirationTtl: OTP_TTL });
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "otp_storage", error, "KV");
    return errorResponse(AUTH_ERRORS.OTP_STORAGE_FAILED);
  }

  try {
    setStage(context, "telegram_delivery");
    logEvent(context, "info", "OTP_TELEGRAM_SEND_START", { dependency: "Telegram Bot API" });
    await sendTelegramMessage(
      env,
      telegramId,
      `کد ورود به پنل مدیریت فروشگاه شما: ${code}\nاعتبار: ۵ دقیقه\nاین کد را در اختیار دیگران قرار ندهید.`
    );
    logEvent(context, "info", "OTP_TELEGRAM_SEND_OK", { dependencyStatus: "accepted" });
  } catch (error) {
    await safeDeleteOtp(env, otpKey, context);
    await safeDeleteOtp(env, cooldownKey, context);

    const chatUnavailable = /chat not found|bot was blocked by the user|user is deactivated|can't initiate conversation/i
      .test(error.telegramDescription || error.message || "");
    const errorCode = error.code === "NETWORK_FAILED"
      ? AUTH_ERRORS.NETWORK_FAILED.errorCode
      : chatUnavailable
        ? AUTH_ERRORS.TELEGRAM_CHAT_UNAVAILABLE.errorCode
        : AUTH_ERRORS.TELEGRAM_DELIVERY_FAILED.errorCode;

    logOtpFailure(context, errorCode, "telegram_delivery", error, "Telegram Bot API", {
      telegramHttpStatus: Number.isInteger(error.httpStatus) ? error.httpStatus : null,
      telegramErrorCode: Number.isInteger(error.telegramErrorCode) ? error.telegramErrorCode : null,
      telegramDescription: typeof error.telegramDescription === "string"
        ? error.telegramDescription.replace(/\b\d{5,15}\b/g, "[REDACTED_ID]").slice(0, 300)
        : null,
      retryAfter: Number.isInteger(error.retryAfter) ? error.retryAfter : null,
    });
    logEvent(context, "error", "OTP_DELIVERY_FAILED", {
      errorCode,
      dependency: "Telegram Bot API",
      dependencyStatus: error.code === "NETWORK_FAILED" ? "no_response" : "rejected",
    });

    // Preserve identical public behavior for unknown/inactive accounts and delivery failures.
    return publicOtpAccepted();
  }

  try {
    setStage(context, "cooldown_storage");
    await env.SITE_AUTH_KV.put(cooldownKey, "1", { expirationTtl: RESEND_SECONDS });
  } catch (error) {
    // Telegram has already accepted the message; keep the OTP valid and report this internally.
    logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "cooldown_storage", error, "KV");
  }

  logEvent(context, "info", "OTP_REQUEST_COMPLETED", { outcome: "delivery_accepted" });
  return publicOtpAccepted();
}

export async function verifyOtp(request, env, context = null) {
  setStage(context, "otp_verify_received");
  logEvent(context, "info", "OTP_VERIFY_REQUEST_RECEIVED");

  const body = await request.json().catch(() => ({}));
  const telegramId = String(body.telegramId || "").trim();
  const code = String(body.code || "").trim();
  if (!/^\d{5,15}$/.test(telegramId) || !/^\d{6}$/.test(code)) {
    return errorResponse(AUTH_ERRORS.OTP_INVALID);
  }

  const missing = missingConfig(env, false);
  if (missing.length) return configFailure(context, missing);

  const key = `otp:${telegramId}`;
  let raw;
  try {
    setStage(context, "otp_lookup");
    raw = await env.SITE_AUTH_KV.get(key);
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.KV_UNAVAILABLE.errorCode, "otp_lookup", error, "KV");
    return errorResponse(AUTH_ERRORS.KV_UNAVAILABLE);
  }
  if (!raw) {
    logEvent(context, "warn", "OTP_VERIFY_REJECTED", { errorCode: AUTH_ERRORS.OTP_INVALID.errorCode, reason: "missing_or_expired" });
    return errorResponse(AUTH_ERRORS.OTP_INVALID);
  }

  let record;
  try {
    record = JSON.parse(raw);
    if (!record || typeof record.hash !== "string" || !Number.isInteger(record.attempts)) throw new Error("Invalid OTP record");
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "otp_record_parse", error, "KV");
    await safeDeleteOtp(env, key, context);
    return errorResponse(AUTH_ERRORS.OTP_STORAGE_FAILED);
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await safeDeleteOtp(env, key, context);
    return errorResponse(AUTH_ERRORS.OTP_INVALID);
  }

  let expected;
  try {
    setStage(context, "otp_verification");
    expected = await sha256(`${telegramId}:${code}:${env.OTP_PEPPER}`);
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_GENERATION_FAILED.errorCode, "otp_verification", error, "WebCrypto");
    return errorResponse(AUTH_ERRORS.OTP_GENERATION_FAILED);
  }

  if (expected !== record.hash) {
    record.attempts += 1;
    try {
      await env.SITE_AUTH_KV.put(key, JSON.stringify(record), { expirationTtl: OTP_TTL });
    } catch (error) {
      logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "otp_attempt_update", error, "KV");
      return errorResponse(AUTH_ERRORS.OTP_STORAGE_FAILED);
    }
    logEvent(context, "warn", "OTP_VERIFY_REJECTED", { errorCode: AUTH_ERRORS.OTP_INVALID.errorCode, reason: "mismatch" });
    return errorResponse(AUTH_ERRORS.OTP_INVALID);
  }

  let user;
  try {
    setStage(context, "verify_user_lookup");
    user = await env.DB.prepare(
      "SELECT telegram_id, full_name, username, role, is_active FROM users WHERE telegram_id = ? LIMIT 1"
    ).bind(Number(telegramId)).first();
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.DB_QUERY_FAILED.errorCode, "verify_user_lookup", error, "D1");
    return errorResponse(AUTH_ERRORS.DB_QUERY_FAILED);
  }

  if (!user || Number(user.is_active) !== 1) {
    await safeDeleteOtp(env, key, context);
    logEvent(context, "warn", "OTP_VERIFY_REJECTED", { errorCode: AUTH_ERRORS.OTP_INVALID.errorCode, reason: "user_unavailable" });
    return errorResponse(AUTH_ERRORS.OTP_INVALID);
  }

  try {
    setStage(context, "otp_consume");
    await env.SITE_AUTH_KV.delete(key);
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "otp_consume", error, "KV");
    return errorResponse(AUTH_ERRORS.OTP_STORAGE_FAILED);
  }

  try {
    setStage(context, "session_creation");
    const token = randomToken();
    const tokenHash = await sha256(token);
    const session = { telegramId: Number(user.telegram_id), createdAt: Date.now(), role: user.role };
    await env.SITE_AUTH_KV.put(`session:${tokenHash}`, JSON.stringify(session), { expirationTtl: 43200 });
    logEvent(context, "info", "OTP_VERIFY_SUCCEEDED", { outcome: "session_created" });
    return json({
      ok: true,
      data: {
        token,
        user: {
          telegramId: user.telegram_id,
          fullName: user.full_name,
          username: user.username,
          role: user.role,
        },
      },
    });
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_SESSION_FAILED.errorCode, "session_creation", error, "KV/WebCrypto");
    return errorResponse(AUTH_ERRORS.OTP_SESSION_FAILED);
  }
}
