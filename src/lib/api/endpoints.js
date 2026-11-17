import { apiRequest } from "./client";

const query = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  return search.toString();
};

export const api = {
  health: () => apiRequest("/health"),
  dashboard: () => apiRequest("/api/v1/dashboard/summary"),
  products: (params) => apiRequest("/api/v1/products?" + query(params)),
  inventory: (params) => apiRequest("/api/v1/inventory?" + query(params)),
  sales: (params) => apiRequest("/api/v1/sales?" + query(params)),
  purchases: (params) => apiRequest("/api/v1/purchases?" + query(params)),
  customers: (params) => apiRequest("/api/v1/customers?" + query(params)),
  suppliers: (params) => apiRequest("/api/v1/suppliers?" + query(params)),
  expenses: (params) => apiRequest("/api/v1/expenses?" + query(params)),
  reports: (params) => apiRequest("/api/v1/reports?" + query(params)),
  invoices: (params) => apiRequest("/api/v1/invoices?" + query(params)),
};
