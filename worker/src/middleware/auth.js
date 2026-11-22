import { json } from "../utils/response.js";
import { getSession } from "../auth/session.js";
import { isValidRole } from "../auth/permissions.js";
export async function requireSession(request, env) {
  const session = await getSession(request, env);
  if (!session) return { response: json({ ok: false, error: { code: "UNAUTHORIZED", message: "برای ادامه وارد حساب شوید." } }, 401) };
  const user = await env.DB.prepare("SELECT telegram_id, full_name, username, role, is_active FROM users WHERE telegram_id = ? LIMIT 1").bind(session.telegramId).first();
  const invalidRole = !isValidRole(user?.role) || !isValidRole(session.role);
  if (invalidRole) {
    try { if (session.key) await env.SITE_AUTH_KV.delete(session.key); } catch {}
    return { response: json({ ok: false, error: { code: "FORBIDDEN", message: "نقش این حساب معتبر نیست." } }, 403) };
  }
  if (!user || Number(user.is_active) !== 1 || user.role !== session.role) {
    return { response: json({ ok: false, error: { code: "FORBIDDEN", message: "دسترسی این حساب فعال نیست." } }, 403) };
  }
  return { session, user };
}
