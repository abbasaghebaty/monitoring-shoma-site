import { json } from "./utils/response.js";
import { authRoutes } from "./routes/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { resourceRoutes } from "./routes/resources.js";
import { productWriteRoutes } from "./routes/products.js";
import { requireSession } from "./middleware/auth.js";

export async function router(request, env, context = null) {
  const url = new URL(request.url);
  if (url.pathname === "/health" && request.method === "GET") {
    await env.DB.prepare("SELECT 1 AS connected").first();
    return json({ ok: true, service: "monitoring-shoma-site", environment: env.APP_ENV || "unknown", database: "connected" });
  }
  const auth = await authRoutes(request, env, url, context);
  if (auth) return auth;
  if (!url.pathname.startsWith("/api/v1/")) return json({ ok: false, error: { code: "NOT_FOUND", message: "مسیر پیدا نشد" } }, 404);

  // Every private route, including product writes, passes through the existing session guard.
  const access = await requireSession(request, env);
  if (access.response) return access.response;

  const productWrite = await productWriteRoutes(request, env, url, access.user, context);
  if (productWrite) return productWrite;

  if (request.method !== "GET") return json({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "این مسیر فقط خواندنی است." } }, 405);
  const dashboard = await dashboardRoutes(request, env, url, access.user);
  if (dashboard) return dashboard;
  const resource = await resourceRoutes(request, env, url, access.user);
  if (resource) return resource;
  return json({ ok: false, error: { code: "NOT_FOUND", message: "مسیر API پیدا نشد" } }, 404);
}
