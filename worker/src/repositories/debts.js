import { parsePagination } from "../validation/common.js";
export async function listDebts(db, url) {
  const { limit, offset } = parsePagination(url);
  const status = url.searchParams.get("status");
  const where = status === "open" || status === "settled" ? "WHERE d.status = ?" : "";
  const params = where ? [status] : [];
  const { results = [] } = await db.prepare(`
    SELECT d.sale_id, d.amount, d.status, d.created_at, s.customer_name,
           s.sale_date, s.total_amount, s.amount_paid, s.balance_amount,
           s.product_id, p.name AS product_name
    FROM debts d JOIN sales s ON s.id = d.sale_id
    JOIN products p ON p.product_id = s.product_id
    ${where} ORDER BY d.created_at DESC LIMIT ? OFFSET ?
  `).bind(...params, limit, offset).all();
  const total = await db.prepare(`SELECT COUNT(*) AS total FROM debts d ${where}`).bind(...params).first();
  return { items: results, pagination: { limit, offset, total: Number(total?.total || 0) } };
}
