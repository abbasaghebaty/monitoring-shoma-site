const PRODUCTION_API_BASE_URL = "https://monitoring-shoma-site.abbas-aghebaty.workers.dev";

export const APP_CONFIG = {
  name: "شما",
  description: "سامانه مدیریت فروشگاه شما",
  currency: "تومان",
  locale: "fa-IR",
  timeZone: "Asia/Tehran",
  // Production Pages builds must always call the verified Cloudflare Worker.
  // VITE_API_BASE_URL is intentionally limited to non-production builds.
  apiBaseUrl: import.meta.env.PROD
    ? PRODUCTION_API_BASE_URL
    : (import.meta.env.VITE_API_BASE_URL || PRODUCTION_API_BASE_URL),
  environment: import.meta.env.VITE_APP_ENV || (import.meta.env.PROD ? "production" : "development"),
};
