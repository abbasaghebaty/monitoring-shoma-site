import { json } from "../utils/response.js";
import { AUTH_ERRORS, errorResponse, publicOtpOutcome } from "../utils/errors.js";
import { logEvent, logFailure } from "../utils/diagnostics.js";
import { randomOtp, randomToken, sha256 } from "./crypto.js";
import { isValidRole } from "./permissions.js";

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

async function consumeRateLimit(db, keyHash, now, windowSeconds, maxRequests) {
  const row = await db.prepare(`
    INSERT INTO auth_rate_limits (key_hash, window_started_at, request_count, updated_at)
    VALUES (?, ?, 1, ?)
    ON CONFLICT(key_hash) DO UPDATE SET
      request_count = CASE
        WHEN excluded.updated_at - auth_rate_limits.window_started_at >= ? THEN 1
        ELSE auth_rate_limits.request_count + 1
      END,
      window_started_at = CASE
        WHEN excluded.updated_at - auth_rate_limits.window_started_at >= ? THEN excluded.updated_at
        ELSE auth_rate_limits.window_started_at
      END,
      updated_at = excluded.updated_at
    WHERE excluded.updated_at - auth_rate_limits.window_started_at >= ?
       OR auth_rate_limits.request_count < ?
    RETURNING request_count
  `).bind(
    keyHash, now, now, windowSeconds, windowSeconds, windowSeconds, maxRequests
  ).first();
  return Boolean(row);
}

export async function requestOtp(request, env, context = null) {
  setStage(context, "otp_request_received");
  logEvent(context, "info", "OTP_REQUEST_RECEIVED");

  const body = await request.json().catch(() => ({}));
  const telegramId = String(body.telegramId || "").trim();
  if (!/^\d{5,15}$/.test(telegramId)) {
    return errorResponse({ errorCode: "AUTH_003", status: 400, message: "شناسه تلگرام معتبر نیست." });
  }

  setStage(context, "configuration_validation");
  const missing = missingConfig(env, true);
  if (missing.length) return configFailure(context, missing);

  const now = Math.floor(Date.now() / 1000);
  let code;
  let otpHash;
  try {
    setStage(context, "rate_limit_reservation");
    // Rate-limit keys are one-way hashes; raw Telegram IDs and IP addresses are not stored.
    const accountKey = await sha256(`otp-account:${telegramId}:${env.OTP_PEPPER}`);
    const accountAllowed = await consumeRateLimit(env.DB, accountKey, now, RESEND_SECONDS, 1);
    const ipAddress = request.headers.get("CF-Connecting-IP");
    let ipAllowed = true;
    if (ipAddress) {
      const ipKey = await sha256(`otp-ip:${ipAddress}:${env.OTP_PEPPER}`);
      ipAllowed = await consumeRateLimit(env.DB, ipKey, now, 15 * 60, 12);
    }
    await env.DB.prepare("DELETE FROM auth_rate_limits WHERE updated_at < ?").bind(now - 86400).run();
    await env.DB.prepare(
      "DELETE FROM auth_otp_challenges WHERE expires_at < ? OR (consumed_at IS NOT NULL AND consumed_at < ?)"
    ).bind(now - 86400, now - 86400).run();
    if (!accountAllowed || !ipAllowed) {
      logEvent(context, "warn", "OTP_RATE_LIMITED", { outcome: "generic_response" });
      return publicOtpOutcome();
    }
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.DB_QUERY_FAILED.errorCode, "rate_limit_reservation", error, "D1");
    return errorResponse(AUTH_ERRORS.DB_QUERY_FAILED);
  }

  let user;
  try {
    setStage(context, "user_lookup");
    user = await env.DB.prepare(
      "SELECT telegram_id, full_name, role, is_active FROM users WHERE telegram_id = ? LIMIT 1"
    ).bind(Number(telegramId)).first();
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.DB_QUERY_FAILED.errorCode, "user_lookup", error, "D1");
    return errorResponse(AUTH_ERRORS.DB_QUERY_FAILED);
  }

  const isActive = Boolean(user && Number(user.is_active) === 1);
  logEvent(context, "info", "OTP_USER_LOOKUP", { found: Boolean(user), active: isActive });
  if (!user || !isActive || !isValidRole(user.role)) {
    logEvent(context, "warn", "OTP_USER_UNAVAILABLE", { outcome: "generic_response" });
    return publicOtpOutcome();
  }

  try {
    setStage(context, "otp_generation");
    code = randomOtp();
    otpHash = await sha256(`${telegramId}:${code}:${env.OTP_PEPPER}`);
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_GENERATION_FAILED.errorCode, "otp_generation", error, "WebCrypto");
    return publicOtpOutcome();
  }

  try {
    setStage(context, "otp_storage");
    await env.DB.prepare(`
      INSERT INTO auth_otp_challenges (telegram_id, otp_hash, attempts, created_at, expires_at, consumed_at)
      VALUES (?, ?, 0, ?, ?, NULL)
      ON CONFLICT(telegram_id) DO UPDATE SET
        otp_hash=excluded.otp_hash,
        attempts=0,
        created_at=excluded.created_at,
        expires_at=excluded.expires_at,
        consumed_at=NULL
    `).bind(Number(telegramId), otpHash, now, now + OTP_TTL).run();
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "otp_storage", error, "D1");
    return publicOtpOutcome();
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
    try {
      await env.DB.prepare("DELETE FROM auth_otp_challenges WHERE telegram_id=? AND otp_hash=?")
        .bind(Number(telegramId), otpHash).run();
    } catch (cleanupError) {
      logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "otp_cleanup", cleanupError, "D1");
    }
    const chatUnavailable = /chat not found|bot was blocked by the user|user is deactivated|can't initiate conversation/i
      .test(error.telegramDescription || error.message || "");
    const errorCode = error.code === "NETWORK_FAILED"
      ? AUTH_ERRORS.NETWORK_FAILED.errorCode
      : chatUnavailable
        ? AUTH_ERRORS.TELEGRAM_CHAT_UNAVAILABLE.errorCode
        : AUTH_ERRORS.TELEGRAM_DELIVERY_FAILED.errorCode;
    logOtpFailure(context, errorCode, "telegram_delivery", error, "Telegram Bot API", {
      httpStatus: Number.isInteger(error.httpStatus) ? error.httpStatus : null,
      telegramErrorCode: Number.isInteger(error.telegramErrorCode) ? error.telegramErrorCode : null,
      telegramDescription: typeof error.telegramDescription === "string"
        ? error.telegramDescription.replace(/bot\d+:[A-Za-z0-9_-]+/gi, "[REDACTED_BOT_TOKEN]").replace(/\b\d{5,15}\b/g, "[REDACTED_ID]").slice(0, 300)
        : null,
      retryAfter: Number.isInteger(error.retryAfter) ? error.retryAfter : null,
    });
    logEvent(context, "error", "OTP_DELIVERY_FAILED", { errorCode, dependency: "Telegram Bot API" });
    return publicOtpOutcome();
  }

  logEvent(context, "info", "OTP_REQUEST_COMPLETED", { outcome: "delivery_accepted" });
  return publicOtpOutcome();
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
  const now = Math.floor(Date.now() / 1000);
  let expected;
  try {
    setStage(context, "otp_verification");
    expected = await sha256(`${telegramId}:${code}:${env.OTP_PEPPER}`);
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_GENERATION_FAILED.errorCode, "otp_verification", error, "WebCrypto");
    return errorResponse(AUTH_ERRORS.OTP_GENERATION_FAILED);
  }

  let challenge;
  try {
    setStage(context, "otp_lookup");
    challenge = await env.DB.prepare(
      "SELECT otp_hash, attempts, expires_at, consumed_at FROM auth_otp_challenges WHERE telegram_id=?"
    ).bind(Number(telegramId)).first();
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.DB_QUERY_FAILED.errorCode, "otp_lookup", error, "D1");
    return errorResponse(AUTH_ERRORS.DB_QUERY_FAILED);
  }

  let legacyKvChallenge = false;
  if (challenge) {
    if (challenge.consumed_at != null || Number(challenge.expires_at) <= now || Number(challenge.attempts) >= MAX_ATTEMPTS) {
      logEvent(context, "warn", "OTP_VERIFY_REJECTED", { errorCode: AUTH_ERRORS.OTP_INVALID.errorCode, reason: "expired_or_consumed" });
      return errorResponse(AUTH_ERRORS.OTP_INVALID);
    }

    if (expected === challenge.otp_hash) {
      let consumed;
      try {
        consumed = await env.DB.prepare(
          "UPDATE auth_otp_challenges SET consumed_at=? WHERE telegram_id=? AND otp_hash=? AND consumed_at IS NULL AND expires_at>? AND attempts<? RETURNING telegram_id"
        ).bind(now, Number(telegramId), expected, now, MAX_ATTEMPTS).first();
      } catch (error) {
        logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "otp_consume", error, "D1");
        return errorResponse(AUTH_ERRORS.OTP_STORAGE_FAILED);
      }
      if (!consumed) return errorResponse(AUTH_ERRORS.OTP_INVALID);
    } else {
      let attempt;
      try {
        attempt = await env.DB.prepare(
          "UPDATE auth_otp_challenges SET attempts=attempts+1, consumed_at=CASE WHEN attempts+1>=? THEN ? ELSE consumed_at END WHERE telegram_id=? AND otp_hash=? AND consumed_at IS NULL AND expires_at>? AND attempts<? RETURNING attempts"
        ).bind(MAX_ATTEMPTS, now, Number(telegramId), challenge.otp_hash, now, MAX_ATTEMPTS).first();
      } catch (error) {
        logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "otp_attempt_update", error, "D1");
        return errorResponse(AUTH_ERRORS.OTP_STORAGE_FAILED);
      }
      logEvent(context, "warn", "OTP_VERIFY_REJECTED", {
        errorCode: AUTH_ERRORS.OTP_INVALID.errorCode,
        reason: attempt && Number(attempt.attempts) >= MAX_ATTEMPTS ? "attempt_limit" : "mismatch",
      });
      return errorResponse(AUTH_ERRORS.OTP_INVALID);
    }
  } else {
    // Compatibility window for OTPs issued by the previous Worker version.
    let raw;
    try {
      raw = await env.SITE_AUTH_KV.get(key);
    } catch (error) {
      logOtpFailure(context, AUTH_ERRORS.KV_UNAVAILABLE.errorCode, "legacy_otp_lookup", error, "KV");
      return errorResponse(AUTH_ERRORS.KV_UNAVAILABLE);
    }
    if (!raw) return errorResponse(AUTH_ERRORS.OTP_INVALID);

    let record;
    try {
      record = JSON.parse(raw);
      if (!record || typeof record.hash !== "string" || !Number.isInteger(record.attempts)) throw new Error("Invalid OTP record");
    } catch (error) {
      logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "legacy_otp_parse", error, "KV");
      await safeDeleteOtp(env, key, context);
      return errorResponse(AUTH_ERRORS.OTP_STORAGE_FAILED);
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await safeDeleteOtp(env, key, context);
      return errorResponse(AUTH_ERRORS.OTP_INVALID);
    }
    if (expected !== record.hash) {
      record.attempts += 1;
      try {
        await env.SITE_AUTH_KV.put(key, JSON.stringify(record), { expirationTtl: OTP_TTL });
      } catch (error) {
        logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "legacy_otp_attempt_update", error, "KV");
        return errorResponse(AUTH_ERRORS.OTP_STORAGE_FAILED);
      }
      logEvent(context, "warn", "OTP_VERIFY_REJECTED", { errorCode: AUTH_ERRORS.OTP_INVALID.errorCode, reason: "legacy_mismatch" });
      return errorResponse(AUTH_ERRORS.OTP_INVALID);
    }
    legacyKvChallenge = true;
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

  if (!user || Number(user.is_active) !== 1 || !isValidRole(user.role)) {
    if (legacyKvChallenge) await safeDeleteOtp(env, key, context);
    logEvent(context, "warn", "OTP_VERIFY_REJECTED", { errorCode: AUTH_ERRORS.OTP_INVALID.errorCode, reason: "user_unavailable" });
    return errorResponse(AUTH_ERRORS.OTP_INVALID);
  }

  if (legacyKvChallenge) {
    try {
      await env.SITE_AUTH_KV.delete(key);
    } catch (error) {
      logOtpFailure(context, AUTH_ERRORS.OTP_STORAGE_FAILED.errorCode, "legacy_otp_consume", error, "KV");
      return errorResponse(AUTH_ERRORS.OTP_STORAGE_FAILED);
    }
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
        user: { telegramId: user.telegram_id, fullName: user.full_name, username: user.username, role: user.role },
      },
    });
  } catch (error) {
    logOtpFailure(context, AUTH_ERRORS.OTP_SESSION_FAILED.errorCode, "session_creation", error, "KV/WebCrypto");
    return errorResponse(AUTH_ERRORS.OTP_SESSION_FAILED);
  }
}
