export function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean);
}
export function isAllowedOrigin(origin, env) {
  return !origin || allowedOrigins(env).includes(origin);
}
export function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Expose-Headers": "X-Request-ID, X-CF-Ray",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}
