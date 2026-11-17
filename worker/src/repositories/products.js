import { parsePagination } from "../validation/common.js";
export async function listProducts(db, url) {
  const { limit, offset } = parsePagination(url);
  const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const where = search ? "WHERE p.name LIKE ?" : "";
  const params = search ? [`%${search}%`] : [];
  const { results = [] } = await db.prepare(`
    SELECT p.product_id, p.name, p.unit, p.package_quantity, p.weight, p.weight_unit,
      p.description, p.created_at,
      COALESCE(pp.purchase_price,0) AS purchase_price,
      COALESCE(pp.sell_price,0) AS sell_price,
      COALESCE(pp.consumer_price,0) AS consumer_price,
      COALESCE(pp.market_price,0) AS market_price,
      COALESCE(i.quantity,0) AS quantity,
      pp.updated_at AS price_updated_at, i.updated_at AS inventory_updated_at
    FROM products p
    LEFT JOIN product_prices pp ON pp.product_id=p.product_id
    LEFT JOIN inventory i ON i.product_id=p.product_id
    ${where} ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();
  const total = await db.prepare(`SELECT COUNT(*) AS total FROM products p ${where}`).bind(...params).first();
  return { items: results, pagination: { limit, offset, total: Number(total?.total || 0) } };
}
