import { notReady } from "../utils/response.js";
export async function dashboardRoutes(request, env, url) {
  if (url.pathname === "/api/v1/dashboard/summary") return notReady("dashboard summary");
  return null;
}
