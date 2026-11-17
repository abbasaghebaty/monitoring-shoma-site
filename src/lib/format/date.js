import { APP_CONFIG } from "../../config/app";

export function formatDate(value, options = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(APP_CONFIG.locale, {
    calendar: "persian",
    timeZone: APP_CONFIG.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options,
  }).format(date);
}
