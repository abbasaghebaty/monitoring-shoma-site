import { json } from "./utils/response.js";
import { authRoutes } from "./routes/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { resourceRoutes } from "./routes/resources.js";
import { requireSession } from "./middleware/auth.js";

export async function router(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    await env.DB.prepare("SELECT 1 AS connected").first();
    return json({ ok: true, service: "shoma-api", environment: env.APP_ENV || "unknown", database: "connected" });
  }
  const auth = await authRoutes(request, env, url);
  if (auth) return auth;
  if (!url.pathname.startsWith("/api/v1/")) return json({ ok: false, error: { code: "NOT_FOUND", message: "مسیر پیدا نشد" } }, 404);
  if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "این مرحله فقط خواندنی است" } }, 405);
  const access = await requireSession(request, env);
  if (access.response) return access.response;
  const dashboard = await dashboardRoutes(request, env, url, access.user);
  if (dashboard) return dashboard;
  const resource = await resourceRoutes(request, env, url, access.user);
  if (resource) return resource;
  return json({ ok: false, error: { code: "NOT_FOUND", message: "مسیر API پیدا نشد" } }, 404);
}
