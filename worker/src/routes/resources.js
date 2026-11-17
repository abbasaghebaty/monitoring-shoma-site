import { notReady } from "../utils/response.js";

const routes = new Map([
  ["/api/v1/products", "products"],
  ["/api/v1/inventory", "inventory"],
  ["/api/v1/sales", "sales"],
  ["/api/v1/purchases", "purchases"],
  ["/api/v1/customers", "customers"],
  ["/api/v1/suppliers", "suppliers"],
  ["/api/v1/expenses", "expenses"],
  ["/api/v1/reports", "reports"],
  ["/api/v1/invoices", "invoices"],
]);
export async function resourceRoutes(request, env, url) {
  const resource = routes.get(url.pathname);
  return resource ? notReady(resource) : null;
}
