import { APP_CONFIG } from "../../config/app";

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export async function apiRequest(path, options = {}) {
  if (!APP_CONFIG.apiBaseUrl) {
    throw new ApiError("نشانی API هنوز در تنظیمات پروژه ثبت نشده است.");
  }
  const url = new URL(path.replace(/^\//, ""), APP_CONFIG.apiBaseUrl.endsWith("/")
    ? APP_CONFIG.apiBaseUrl
    : APP_CONFIG.apiBaseUrl + "/");
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(payload?.error?.message || "ارتباط با سرویس با خطا روبه‌رو شد.", response.status, payload);
  }
  return payload;
}
