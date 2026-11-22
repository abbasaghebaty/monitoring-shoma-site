import { json } from "../utils/response.js";
import { requestOtp, verifyOtp } from "../auth/otp.js";
import { revokeSession } from "../auth/session.js";
import { requireSession } from "../middleware/auth.js";
export async function authRoutes(request, env, url, context = null) {
  if (url.pathname === "/api/v1/auth/request-otp" && request.method === "POST") return requestOtp(request, env, context);
  if (url.pathname === "/api/v1/auth/verify-otp" && request.method === "POST") return verifyOtp(request, env, context);
  if (url.pathname === "/api/v1/auth/logout" && request.method === "POST") {
    await revokeSession(request, env);
    return json({ ok: true, data: { loggedOut: true } });
  }
  if (url.pathname === "/api/v1/auth/me" && request.method === "GET") {
    const auth = await requireSession(request, env);
    if (auth.response) return auth.response;
    return json({ ok: true, data: { user: { telegramId: auth.user.telegram_id, fullName: auth.user.full_name, username: auth.user.username, role: auth.user.role } } });
  }
  if (url.pathname.startsWith("/api/v1/auth/")) return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "روش درخواست مجاز نیست." } }, 405);
  return null;
}
