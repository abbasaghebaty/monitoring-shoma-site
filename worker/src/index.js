import { router } from "./router.js";
import { corsHeaders, isAllowedOrigin } from "./middleware/cors.js";
import { json } from "./utils/response.js";
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const requestPath = new URL(request.url).pathname;
    console.log("SITE_API_INCOMING", { method: request.method, path: requestPath, hasOrigin: Boolean(origin) });
    if (origin && !isAllowedOrigin(origin, env)) {
      console.warn("SITE_API_ORIGIN_REJECTED", { path: requestPath });
      return json({ ok: false, error: { code: "ORIGIN_NOT_ALLOWED", message: "مبدأ درخواست مجاز نیست." } }, 403);
    }
    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin, env)) return new Response(null, { status: 403 });
      console.log("SITE_API_PREFLIGHT_OK", { path: requestPath });
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    try {
      const response = await router(request, env);
      const headers = new Headers(response.headers);
      if (origin) for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      console.error("Unhandled API error", error);
      return json({ ok: false, error: { code: "INTERNAL_ERROR", message: "خطای داخلی سرویس" } }, 500);
    }
  },
};
