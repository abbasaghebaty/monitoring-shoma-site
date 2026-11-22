import { APP_CONFIG } from "../../config/app";

let accessToken = null;
export const setAccessToken = (token) => { accessToken = token || null; };
export const clearAccessToken = () => { accessToken = null; };

export class ApiError extends Error {
  constructor(message, status = 0, payload = null, requestId = null, errorCode = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.requestId = requestId;
    this.errorCode = errorCode;
  }
}

export async function apiRequest(path, options = {}) {
  if (!APP_CONFIG.apiBaseUrl) throw new ApiError("نشانی API در تنظیمات انتشار ثبت نشده است.");
  const base = APP_CONFIG.apiBaseUrl.endsWith("/") ? APP_CONFIG.apiBaseUrl : APP_CONFIG.apiBaseUrl + "/";
  const url = new URL(path.replace(/^\//, ""), base);
  const headers = {
    Accept: "application/json",
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...options.headers,
  };
  let response;
  try {
    response = await fetch(url, { ...options, headers, cache: "no-store", credentials: "omit" });
  } catch {
    throw new ApiError("ارتباط با سرور برقرار نشد. اتصال اینترنت و آدرس API را بررسی کنید.");
  }

  const payload = await response.json().catch(() => null);
  const requestId = payload?.error?.requestId || payload?.requestId || response.headers.get("X-Request-ID") || null;
  if (!response.ok || payload?.ok === false) {
    if (response.status === 401) clearAccessToken();
    throw new ApiError(
      payload?.error?.message || "ارتباط با سرویس با خطا روبه‌رو شد.",
      response.status,
      payload,
      requestId,
      payload?.error?.errorCode || payload?.error?.code || null,
    );
  }
  return payload?.data ?? payload;
}
