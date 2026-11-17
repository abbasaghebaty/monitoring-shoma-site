import { json } from "./utils/response.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { resourceRoutes } from "./routes/resources.js";
import { schemaRoutes } from "./routes/schema.js";

export async function router(request, env) {
  const url = new URL(request.url);
  if (url.pathname === "/health") {
    return json({ ok: true, service: "shoma-api", environment: env.APP_ENV || "unknown" });
  }
  if (!url.pathname.startsWith("/api/v1/")) return json({ ok: false, error: { code: "NOT_FOUND", message: "مسیر پیدا نشد" } }, 404);
  if (url.pathname === "/api/v1/admin/schema") {
    if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "فقط GET مجاز است" } }, 405);
    return schemaRoutes(request, env);
  }
  if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "این مرحله فقط خواندنی است" } }, 405);
  const dashboard = await dashboardRoutes(request, env, url);
  if (dashboard) return dashboard;
  const resource = await resourceRoutes(request, env, url);
  if (resource) return resource;
  return json({ ok: false, error: { code: "NOT_FOUND", message: "مسیر API پیدا نشد" } }, 404);
}
