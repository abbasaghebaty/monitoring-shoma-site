import { apiRequest } from "./client";
const query = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  return search.toString();
};
export const api = {
  requestOtp: (telegramId) => apiRequest("/api/v1/auth/request-otp", { method: "POST", body: JSON.stringify({ telegramId }) }),
  verifyOtp: (telegramId, code) => apiRequest("/api/v1/auth/verify-otp", { method: "POST", body: JSON.stringify({ telegramId, code }) }),
  logout: () => apiRequest("/api/v1/auth/logout", { method: "POST" }),
  me: () => apiRequest("/api/v1/auth/me"),
  health: () => apiRequest("/health"),
  dashboard: () => apiRequest("/api/v1/dashboard/summary"),
  products: (params) => apiRequest("/api/v1/products?" + query(params)),
  inventory: (params) => apiRequest("/api/v1/inventory?" + query(params)),
  sales: (params) => apiRequest("/api/v1/sales?" + query(params)),
  debts: (params) => apiRequest("/api/v1/debts?" + query(params)),
  customers: (params) => apiRequest("/api/v1/customers?" + query(params)),
  attendance: (params) => apiRequest("/api/v1/attendance?" + query(params)),
  salesReport: (params) => apiRequest("/api/v1/reports/sales?" + query(params)),
};
