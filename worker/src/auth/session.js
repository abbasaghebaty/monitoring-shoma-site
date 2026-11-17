import { sha256 } from "./crypto.js";
export async function getSession(request, env) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer ([a-f0-9]{64})$/i);
  if (!match || !env.SITE_AUTH_KV) return null;
  const key = `session:${await sha256(match[1])}`;
  const raw = await env.SITE_AUTH_KV.get(key);
  if (!raw) return null;
  const session = JSON.parse(raw);
  if (Date.now() - session.createdAt > 12 * 60 * 60 * 1000) {
    await env.SITE_AUTH_KV.delete(key);
    return null;
  }
  return { ...session, key };
}
export async function revokeSession(request, env) {
  const session = await getSession(request, env);
  if (session?.key) await env.SITE_AUTH_KV.delete(session.key);
}
