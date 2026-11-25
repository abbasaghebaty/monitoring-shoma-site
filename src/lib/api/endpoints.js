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
  users: (params) => apiRequest("/api/v1/users?" + query(params)),
  products: (params) => apiRequest("/api/v1/products?" + query(params)),
  productPrices: (params) => apiRequest("/api/v1/product-prices?" + query(params)),
  product: (id) => apiRequest("/api/v1/products/" + encodeURIComponent(id)),
  createProduct: (draft) => apiRequest("/api/v1/products", { method: "POST", body: JSON.stringify(draft) }),
  updateProduct: (productId, draft) => apiRequest("/api/v1/products/" + encodeURIComponent(productId), { method: "PATCH", body: JSON.stringify(draft) }),
  inventory: (params) => apiRequest("/api/v1/inventory?" + query(params)),
  sales: (params) => apiRequest("/api/v1/sales?" + query(params)),
  sale: (id) => apiRequest("/api/v1/sales/" + encodeURIComponent(id)),
  createSale: (draft) => apiRequest("/api/v1/sales", { method: "POST", body: JSON.stringify(draft) }),
  debts: (params) => apiRequest("/api/v1/debts?" + query(params)),
  settleDebt: (saleId) => apiRequest("/api/v1/debts/" + encodeURIComponent(saleId) + "/settle", { method: "POST" }),
  customers: (params) => apiRequest("/api/v1/customers?" + query(params)),
  createCustomer: (draft) => apiRequest("/api/v1/customers", { method: "POST", body: JSON.stringify(draft) }),
  updateCustomer: (id, draft) => apiRequest("/api/v1/customers/" + encodeURIComponent(id), { method: "PATCH", body: JSON.stringify(draft) }),
  attendance: (params) => apiRequest("/api/v1/attendance?" + query(params)),
  checkIn: () => apiRequest("/api/v1/attendance/check-in", { method: "POST" }),
  checkOut: () => apiRequest("/api/v1/attendance/check-out", { method: "POST" }),
  adjustInventory: (draft) => apiRequest("/api/v1/inventory/adjust", { method: "POST", body: JSON.stringify(draft) }),
  salesReport: (params) => apiRequest("/api/v1/reports/sales?" + query(params)),
};
