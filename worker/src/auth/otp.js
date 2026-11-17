import { json } from "../utils/response.js";
import { randomOtp, sha256 } from "./crypto.js";

const OTP_TTL = 300;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

async function sendTelegramMessage(env, telegramId, text) {
  if (!env.BOT_TOKEN) {
    const error = new Error("BOT_TOKEN is not configured");
    error.code = "BOT_TOKEN_MISSING";
    throw error;
  }

  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramId, text, protect_content: true }),
  });

  // Telegram can return HTTP 200 with { ok: false }; check both layers.
  let result = null;
  try {
    result = await response.json();
  } catch {
    // Keep the diagnostic below useful without logging the raw response body.
  }

  if (!response.ok || result?.ok !== true) {
    const error = new Error("Telegram delivery failed");
    error.httpStatus = response.status;
    error.telegramErrorCode = Number.isInteger(result?.error_code) ? result.error_code : null;
    error.telegramDescription = typeof result?.description === "string"
      ? result.description.slice(0, 300)
      : "Telegram returned an invalid or non-JSON response";
    throw error;
  }
}

export async function requestOtp(request, env) {
  const body = await request.json().catch(() => ({}));
  const telegramId = String(body.telegramId || "").trim();
  if (!/^\d{5,15}$/.test(telegramId)) {
    return json({ ok: false, error: { code: "INVALID_INPUT", message: "شناسه تلگرام معتبر نیست." } }, 400);
  }
  const cooldownKey = `otp-cooldown:${telegramId}`;
  if (await env.SITE_AUTH_KV.get(cooldownKey)) {
    return json({ ok: true, data: { message: "اگر حساب فعال و مجاز باشد، کد ورود ارسال می‌شود." } });
  }
  const user = await env.DB.prepare(
    "SELECT telegram_id, full_name, is_active FROM users WHERE telegram_id = ? LIMIT 1"
  ).bind(Number(telegramId)).first();

  // Keep the public response identical for unknown, inactive, and rate-limited accounts.
  if (user && Number(user.is_active) === 1) {
    const code = randomOtp();
    const record = { hash: await sha256(`${telegramId}:${code}:${env.OTP_PEPPER || env.BOT_TOKEN}`), attempts: 0 };
    await env.SITE_AUTH_KV.put(`otp:${telegramId}`, JSON.stringify(record), { expirationTtl: OTP_TTL });
    await env.SITE_AUTH_KV.put(cooldownKey, "1", { expirationTtl: RESEND_SECONDS });
    try {
      await sendTelegramMessage(env, telegramId, `کد ورود به پنل مدیریت فروشگاه شما: ${code}\nاعتبار: ۵ دقیقه\nاین کد را در اختیار دیگران قرار ندهید.`);
    } catch (error) {
      // A failed delivery must not leave an unusable OTP or block an immediate retry.
      await Promise.all([
        env.SITE_AUTH_KV.delete(`otp:${telegramId}`),
        env.SITE_AUTH_KV.delete(cooldownKey),
      ]).catch((cleanupError) => {
        console.error("OTP cleanup failed", {
          message: cleanupError instanceof Error ? cleanupError.message : "Unknown cleanup error",
        });
      });

      // Never log the bot token, OTP, request body, or raw Telegram response.
      console.error("OTP delivery failed", {
        code: error?.code || "TELEGRAM_DELIVERY_FAILED",
        httpStatus: Number.isInteger(error?.httpStatus) ? error.httpStatus : null,
        telegramErrorCode: Number.isInteger(error?.telegramErrorCode) ? error.telegramErrorCode : null,
        telegramDescription: typeof error?.telegramDescription === "string"
          ? error.telegramDescription
          : (error?.code === "BOT_TOKEN_MISSING" ? "BOT_TOKEN is not configured" : "Unknown Telegram delivery error"),
      });
    }
  }
  return json({ ok: true, data: { message: "اگر حساب فعال و مجاز باشد، کد ورود ارسال می‌شود." } });
}

export async function verifyOtp(request, env) {
  const body = await request.json().catch(() => ({}));
  const telegramId = String(body.telegramId || "").trim();
  const code = String(body.code || "").trim();
  if (!/^\d{5,15}$/.test(telegramId) || !/^\d{6}$/.test(code)) {
    return json({ ok: false, error: { code: "INVALID_OTP", message: "کد ورود معتبر نیست یا منقضی شده است." } }, 401);
  }
  const key = `otp:${telegramId}`;
  const raw = await env.SITE_AUTH_KV.get(key);
  if (!raw) return json({ ok: false, error: { code: "INVALID_OTP", message: "کد ورود معتبر نیست یا منقضی شده است." } }, 401);
  const record = JSON.parse(raw);
  if (record.attempts >= MAX_ATTEMPTS) {
    await env.SITE_AUTH_KV.delete(key);
    return json({ ok: false, error: { code: "INVALID_OTP", message: "کد ورود معتبر نیست یا منقضی شده است." } }, 401);
  }
  const expected = await sha256(`${telegramId}:${code}:${env.OTP_PEPPER || env.BOT_TOKEN}`);
  if (expected !== record.hash) {
    record.attempts += 1;
    await env.SITE_AUTH_KV.put(key, JSON.stringify(record), { expirationTtl: OTP_TTL });
    return json({ ok: false, error: { code: "INVALID_OTP", message: "کد ورود معتبر نیست یا منقضی شده است." } }, 401);
  }
  await env.SITE_AUTH_KV.delete(key);
  const user = await env.DB.prepare(
    "SELECT telegram_id, full_name, username, role, is_active FROM users WHERE telegram_id = ? LIMIT 1"
  ).bind(Number(telegramId)).first();
  if (!user || Number(user.is_active) !== 1) {
    return json({ ok: false, error: { code: "INVALID_OTP", message: "کد ورود معتبر نیست یا منقضی شده است." } }, 401);
  }
  const token = (await import("./crypto.js")).randomToken();
  const tokenHash = await sha256(token);
  const session = { telegramId: Number(user.telegram_id), createdAt: Date.now(), role: user.role };
  await env.SITE_AUTH_KV.put(`session:${tokenHash}`, JSON.stringify(session), { expirationTtl: 43200 });
  return json({ ok: true, data: { token, user: { telegramId: user.telegram_id, fullName: user.full_name, username: user.username, role: user.role } } });
}
