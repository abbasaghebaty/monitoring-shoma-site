import { sha256 } from "./crypto.js";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const FUTURE_CLOCK_SKEW_MS = 60 * 1000;

async function discardSession(env, key) {
  try { await env.SITE_AUTH_KV.delete(key); } catch { /* Invalid sessions are denied even if cleanup is temporarily unavailable. */ }
}

export async function getSession(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer ([a-f0-9]{64})$/i);
  if (!match || !env.SITE_AUTH_KV) return null;

  const key = `session:${await sha256(match[1])}`;
  const raw = await env.SITE_AUTH_KV.get(key);
  if (!raw) return null;

  let session;
  try {
    session = JSON.parse(raw);
  } catch {
    await discardSession(env, key);
    return null;
  }

  const now = Date.now();
  const createdAt = Number(session?.createdAt);
  const telegramId = Number(session?.telegramId);
  const validShape =
    Number.isSafeInteger(telegramId) &&
    telegramId > 0 &&
    Number.isFinite(createdAt) &&
    createdAt > 0 &&
    createdAt <= now + FUTURE_CLOCK_SKEW_MS &&
    typeof session?.role === "string";

  if (!validShape || now - createdAt > SESSION_TTL_MS) {
    await discardSession(env, key);
    return null;
  }

  return { ...session, telegramId, createdAt, key };
}

export async function revokeSession(request, env) {
  const session = await getSession(request, env);
  if (session?.key) await env.SITE_AUTH_KV.delete(session.key);
}
