import { router } from "./router.js";
import { corsHeaders, isAllowedOrigin } from "./middleware/cors.js";
import { errorResponse, AUTH_ERRORS } from "./utils/errors.js";
import { createRequestContext, logEvent, logFailure, withRequestMetadata } from "./utils/diagnostics.js";

export default {
  async fetch(request, env) {
    const context = createRequestContext(request);
    const origin = request.headers.get("Origin") || "";
    const requestPath = new URL(request.url).pathname;
    const finish = (response) => withRequestMetadata(response, context);

    logEvent(context, "info", "SITE_API_INCOMING", {
      method: request.method,
      path: requestPath,
      hasOrigin: Boolean(origin),
    });

    if (origin && !isAllowedOrigin(origin, env)) {
      logEvent(context, "warn", "SITE_API_ORIGIN_REJECTED", { path: requestPath, errorCode: "CONFIG_003" });
      return finish(errorResponse({
        errorCode: "CONFIG_003",
        status: 403,
        message: "مبدأ درخواست مجاز نیست.",
      }));
    }

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(origin, env)) {
        const headers = new Headers({ "X-Request-ID": context.requestId });
        return new Response(null, { status: 403, headers });
      }
      logEvent(context, "info", "SITE_API_PREFLIGHT_OK", { path: requestPath });
      const headers = new Headers(corsHeaders(origin));
      headers.set("X-Request-ID", context.requestId);
      if (context.rayId) headers.set("X-CF-Ray", context.rayId);
      return new Response(null, { status: 204, headers });
    }

    try {
      const response = await router(request, env, context);
      const headers = new Headers(response.headers);
      if (origin) {
        for (const [key, value] of Object.entries(corsHeaders(origin))) headers.set(key, value);
      }
      return finish(new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }));
    } catch (error) {
      logFailure(context, {
        errorCode: AUTH_ERRORS.INTERNAL.errorCode,
        stage: context.stage || "router",
        error,
        dependency: "Worker runtime",
      });
      return finish(errorResponse(AUTH_ERRORS.INTERNAL));
    }
  },
};
