import { APP_CONFIG } from "../../config/app";

export function formatMoney(value, { withUnit = true } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  const formatted = new Intl.NumberFormat(APP_CONFIG.locale, { maximumFractionDigits: 0 }).format(amount);
  return withUnit ? `${formatted} ${APP_CONFIG.currency}` : formatted;
}
