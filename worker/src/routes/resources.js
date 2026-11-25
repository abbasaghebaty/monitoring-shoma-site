import { json } from "../utils/response.js";
import { canRead } from "../auth/permissions.js";
import { listProducts } from "../repositories/products.js";
import { listInventory } from "../repositories/inventory.js";
import { listSales } from "../repositories/sales.js";
import { listDebts } from "../repositories/debts.js";
import { listCustomers } from "../repositories/customers.js";
import { listAttendance } from "../repositories/attendance.js";
const resources = new Map([
  ["/api/v1/products", ["products", listProducts]],
  ["/api/v1/inventory", ["inventory", listInventory]],
  ["/api/v1/sales", ["sales", listSales]],
  ["/api/v1/debts", ["debts", listDebts]],
  ["/api/v1/customers", ["customers", listCustomers]],
  ["/api/v1/attendance", ["attendance", listAttendance]],
]);
export async function resourceRoutes(request, env, url, user) {
  const detail = url.pathname.match(/^\/api\/v1\/sales\/(\d+)$/);
  if (detail) {
    if (!canRead(user.role, "sales")) return json({ ok:false, error:{code:"FORBIDDEN",message:"برای مشاهده فروش مجوز ندارید."} },403);
    const row = await env.DB.prepare(`
      SELECT s.*, p.name AS product_name, d.amount AS debt_amount, d.status AS debt_status
      FROM sales s JOIN products p ON p.product_id=s.product_id
      LEFT JOIN debts d ON d.sale_id=s.id WHERE s.id=? LIMIT 1
    `).bind(Number(detail[1])).first();
    return row ? json({ok:true,data:row}) : json({ok:false,error:{code:"NOT_FOUND",message:"فروش پیدا نشد."}},404);
  }
  const match = resources.get(url.pathname);
  if (!match) return null;
  const [resource, handler] = match;
  if (!canRead(user.role, resource)) return json({ ok:false, error:{code:"FORBIDDEN",message:"برای مشاهده این بخش مجوز ندارید."} },403);
  // All authenticated roles have the same site access; attendance is not self-only.
  const data = await handler(env.DB, url);
  return json({ ok:true, data });
}
