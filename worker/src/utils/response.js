export function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}
export function notReady(resource) {
  return json({
    ok: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: `مسیر ${resource} هنوز به ساختار واقعی دیتابیس متصل نشده است.`,
    },
  }, 501);
}
