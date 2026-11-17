import { parsePagination } from "../validation/common.js";
export async function listCustomers(db, url) {
  const { limit, offset } = parsePagination(url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const where = q ? "WHERE name LIKE ? OR phone LIKE ?" : "";
  const params = q ? [`%${q}%`, `%${q}%`] : [];
  const { results = [] } = await db.prepare(`SELECT id, name, phone, note, created_at FROM customers ${where} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`).bind(...params, limit, offset).all();
  const total = await db.prepare(`SELECT COUNT(*) AS total FROM customers ${where}`).bind(...params).first();
  return { items: results, pagination: { limit, offset, total: Number(total?.total || 0) } };
}
