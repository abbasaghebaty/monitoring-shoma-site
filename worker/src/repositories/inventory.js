import { parsePagination } from "../validation/common.js";
export async function listInventory(db, url) {
  const { limit, offset } = parsePagination(url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const where = q ? "WHERE p.name LIKE ?" : "";
  const params = q ? [`%${q}%`] : [];
  const { results = [] } = await db.prepare(`
    SELECT p.product_id, p.name, p.unit, i.quantity, i.updated_at,
           pp.purchase_price, pp.sell_price, pp.consumer_price, pp.market_price
    FROM inventory i JOIN products p ON p.product_id = i.product_id
    LEFT JOIN product_prices pp ON pp.product_id = p.product_id
    ${where} ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();
  const total = await db.prepare(`SELECT COUNT(*) AS total FROM inventory i JOIN products p ON p.product_id = i.product_id ${where}`).bind(...params).first();
  return { items: results, pagination: { limit, offset, total: Number(total?.total || 0) } };
}
