import { parsePagination } from "../validation/common.js";
export async function listAttendance(db, url, ownTelegramId = null) {
  const { limit, offset } = parsePagination(url);
  const from = url.searchParams.get("from"), to = url.searchParams.get("to");
  const clauses = [], values = [];
  if (ownTelegramId !== null) { clauses.push("a.telegram_id = ?"); values.push(ownTelegramId); }
  if (from) { clauses.push("date(a.check_in) >= date(?)"); values.push(from); }
  if (to) { clauses.push("date(a.check_in) <= date(?)"); values.push(to); }
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const { results = [] } = await db.prepare(`
    SELECT a.id, a.telegram_id, u.full_name, u.username, a.check_in, a.check_out,
           a.duration_minutes, a.created_at
    FROM attendance a JOIN users u ON u.telegram_id = a.telegram_id
    ${where} ORDER BY a.check_in DESC LIMIT ? OFFSET ?
  `).bind(...values, limit, offset).all();
  const count = await db.prepare(`SELECT COUNT(*) AS total FROM attendance a ${where}`).bind(...values).first();
  return { items: results, pagination: { limit, offset, total: Number(count?.total || 0) } };
}
