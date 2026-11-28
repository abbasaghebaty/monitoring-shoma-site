import { json } from "../utils/response.js";
import { canRead } from "../auth/permissions.js";
import { listProducts } from "../repositories/products.js";
import { listProductPrices } from "../repositories/product-prices.js";
import { listInventory } from "../repositories/inventory.js";
import { listSales } from "../repositories/sales.js";
import { listDebts } from "../repositories/debts.js";
import { listCustomers } from "../repositories/customers.js";
import { listAttendance } from "../repositories/attendance.js";

const resources = new Map([
  ["/api/v1/products", ["products", listProducts]],
  ["/api/v1/product-prices", ["productPrices", listProductPrices]],
  ["/api/v1/inventory", ["inventory", listInventory]],
  ["/api/v1/sales", ["sales", listSales]],
  ["/api/v1/debts", ["debts", listDebts]],
  ["/api/v1/customers", ["customers", listCustomers]],
  ["/api/v1/attendance", ["attendance", listAttendance]],
]);

function hideCostFields(product) {
  if (!product) return product;
  const { purchase_price, consumer_price, market_price, ...safe } = product;
  return safe;
}

export async function resourceRoutes(request, env, url, user) {
  const productDetail = url.pathname.match(/^\/api\/v1\/products\/([^/]+)$/);
  if (productDetail) {
    if (!canRead(user.role, "products")) return json({ok:false,error:{code:"FORBIDDEN",message:"برای مشاهده کالاها مجوز ندارید."}},403);
    let productId;
    try { productId = decodeURIComponent(productDetail[1]); } catch { return json({ok:false,error:{code:"INVALID_ID",message:"شناسه کالا معتبر نیست."}},400); }
    const row = await env.DB.prepare(
      "SELECT p.product_id,p.name,p.unit,p.package_quantity,p.weight,p.weight_unit,p.description,p.created_at," +
      "pp.purchase_price,pp.sell_price,pp.consumer_price,pp.market_price,i.quantity," +
      "i.updated_at AS inventory_updated_at,pp.updated_at AS price_updated_at " +
      "FROM products p LEFT JOIN product_prices pp ON pp.product_id=p.product_id " +
      "LEFT JOIN inventory i ON i.product_id=p.product_id WHERE p.product_id=? LIMIT 1"
    ).bind(productId).first();
    const product = user.role === "employee" ? hideCostFields(row) : row;
    return row ? json({ok:true,data:{product}}) : json({ok:false,error:{code:"NOT_FOUND",message:"کالا پیدا نشد."}},404);
  }

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
  const ownAttendanceId = resource === "attendance" && user.role === "employee" ? user.telegram_id : null;
  const data = await handler(env.DB, url, ownAttendanceId);
  if (resource === "products" && user.role === "employee") {
    data.items = (data.items || []).map(hideCostFields);
  }
  if (resource === "inventory" && user.role === "employee") {
    data.items = (data.items || []).map(({ purchase_price, ...safe }) => safe);
  }
  return json({ ok:true, data });
}
