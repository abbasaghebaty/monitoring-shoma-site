const PRODUCTION_API_BASE_URL = "https://monitoring-shoma-site.abbas-aghebaty.workers.dev";

export const APP_CONFIG = {
  name: "شما",
  description: "سامانه مدیریت فروشگاه شما",
  currency: "تومان",
  locale: "fa-IR",
  timeZone: "Asia/Tehran",
  // GitHub Actions may override this with VITE_API_BASE_URL.
  // Keep a verified production fallback so the Pages site never calls its own static origin.
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || PRODUCTION_API_BASE_URL,
  environment: import.meta.env.VITE_APP_ENV || "development",
};
