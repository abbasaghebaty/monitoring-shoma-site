import { json } from "../utils/response.js";
import { randomOtp, sha256 } from "./crypto.js";

const OTP_TTL = 300;
const RESEND_SECONDS = 60;
const MAX_ATTEMPTS = 5;

async function sendTelegramMessage(env, telegramId, text) {
  if (!env.BOT_TOKEN) {
    const error = new Error("BOT_TOKEN is not configured on monitoring-shoma-site");
    error.code = "BOT_TOKEN_MISSING";
    throw error;
  }

  const response = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: telegramId, text, protect_content: true }),
  });
  const result = await response.json().catch(() => null);

  // Telegram can return an API-level failure even when the HTTP response is successful.
  if (!response.ok || result?.ok !== true) {
    const error = new Error(result?.description || `Telegram API HTTP ${response.status}`);
    error.code = result?.error_code || response.status;
    error.retryAfter = result?.parameters?.retry_after;
    throw error;
  }

  return result.result;
}

export async function requestOtp(request, env) {
  const body = await request.json().catch(() => ({}));
  const telegramId = String(body.telegramId || "").trim();
  if (!/^\\d{5,15}$/.test(telegramId)) {
    return json({ ok: false, error: { code: "INVALID_INPUT", message: "شناسه تلگرام معتبر نیست." } }, 400);
  }

  if (!env.DB || !env.SITE_AUTH_KV || !env.OTP_PEPPER || !env.BOT_TOKEN) {
    console.error("OTP_CONFIG_MISSING", {
      database: Boolean(env.DB),
      authKv: Boolean(env.SITE_AUTH_KV),
      otpPepper: Boolean(env.OTP_PEPPER),
      botToken: Boolean(env.BOT_TOKEN),
    });
    return json({ ok: false, error: { code: "AUTH_NOT_CONFIGURED", message: "سرویس ورود در حال حاضر آماده نیست. با مدیر سامانه تماس بگیرید." } }, 503);
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
    const record = { hash: await sha256(`${telegramId}:${code}:${env.OTP_PEPPER}`), attempts: 0 };
    const otpKey = `otp:${telegramId}`;
    await env.SITE_AUTH_KV.put(otpKey, JSON.stringify(record), { expirationTtl: OTP_TTL });

    try {
      await sendTelegramMessage(env, telegramId, `کد ورود به پنل مدیریت فروشگاه شما: ${code}\\nاعتبار: ۵ دقیقه\\nاین کد را در اختیار دیگران قرار ندهید.`);
      // Start the resend cooldown only after Telegram confirms successful delivery.
      await env.SITE_AUTH_KV.put(cooldownKey, "1", { expirationTtl: RESEND_SECONDS });
    } catch (error) {
      await env.SITE_AUTH_KV.delete(otpKey);
      await env.SITE_AUTH_KV.delete(cooldownKey);
      console.error("OTP_DELIVERY_FAILED", {
        code: error.code || "TELEGRAM_REQUEST_FAILED",
        message: error.message,
        retryAfter: error.retryAfter || null,
      });
    }
  }

  return json({ ok: true, data: { message: "اگر حساب فعال و مجاز باشد، کد ورود ارسال می‌شود." } });
}

export async function verifyOtp(request, env) {
  const body = await request.json().catch(() => ({}));
  const telegramId = String(body.telegramId || "").trim();
  const code = String(body.code || "").trim();
  if (!/^\\d{5,15}$/.test(telegramId) || !/^\\d{6}$/.test(code)) {
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
  const expected = await sha256(`${telegramId}:${code}:${env.OTP_PEPPER}`);
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
