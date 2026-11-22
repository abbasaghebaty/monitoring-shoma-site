// Request-scoped diagnostics. Never pass request bodies, OTPs, tokens, or user records here.
export function createRequestContext(request) {
  const requestId = crypto.randomUUID();
  const rayHeader = request.headers.get("cf-ray") || "";
  const rayId = rayHeader.split("-")[0].slice(0, 64) || null;
  return {
    requestId,
    rayId,
    startedAt: Date.now(),
    stage: "request_received",
  };
}

function safeTechnicalMessage(error) {
  const message = typeof error?.message === "string" ? error.message : "Unknown error";
  return message
    .replace(/bot\d+:[A-Za-z0-9_-]+/gi, "[REDACTED_BOT_TOKEN]")
    .replace(/\b\d{5,15}\b/g, "[REDACTED_ID]")
    .replace(/\b\d{6}\b/g, "[REDACTED_CODE]")
    .slice(0, 300);
}

export function logEvent(context, level, event, fields = {}) {
  const record = {
    timestamp: new Date().toISOString(),
    level,
    event,
    requestId: context?.requestId || null,
    rayId: context?.rayId || null,
    stage: context?.stage || null,
    ...fields,
  };
  const output = JSON.stringify(record);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

export function logFailure(context, { errorCode, stage, error, dependency, httpStatus }) {
  if (context) context.stage = stage || context.stage;
  logEvent(context, "error", "AUTH_DIAGNOSTIC_FAILURE", {
    errorCode,
    errorType: error?.name || typeof error,
    technicalMessage: safeTechnicalMessage(error),
    dependency: dependency || null,
    dependencyStatus: httpStatus ?? null,
  });
}

export async function withRequestMetadata(response, context) {
  const headers = new Headers(response.headers);
  headers.set("X-Request-ID", context.requestId);
  if (context.rayId) headers.set("X-CF-Ray", context.rayId);

  const contentType = headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  try {
    const payload = await response.clone().json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      payload.requestId = context.requestId;
      payload.meta = { ...(payload.meta || {}), requestId: context.requestId };
      if (context.rayId) payload.meta.rayId = context.rayId;

      if (payload.ok === false) {
        const previousError = payload.error && typeof payload.error === "object" ? payload.error : {};
        payload.error = {
          errorCode: previousError.errorCode || previousError.code || "INTERNAL_001",
          message: previousError.message || "خطای داخلی سرویس",
          requestId: context.requestId,
          httpStatus: response.status,
        };
      }
    }
    return new Response(JSON.stringify(payload), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch {
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
