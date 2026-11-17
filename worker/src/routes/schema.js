import { json } from "../utils/response.js";

function authorized(request, env) {
  const expected = env.SCHEMA_INSPECTION_TOKEN;
  const actual = request.headers.get("Authorization") || "";
  return Boolean(expected && actual === `Bearer ${expected}`);
}

// Returns schema metadata only; never reads customer, sales, or attendance records.
export async function schemaRoutes(request, env) {
  if (!env.SCHEMA_INSPECTION_TOKEN) {
    return json({ ok: false, error: { code: "INSPECTION_NOT_CONFIGURED", message: "توکن موقت بررسی schema تنظیم نشده است." } }, 503);
  }
  if (!authorized(request, env)) {
    return json({ ok: false, error: { code: "UNAUTHORIZED", message: "دسترسی مجاز نیست." } }, 401);
  }
  const { results: tables = [] } = await env.DB.prepare(
    `SELECT name, sql FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name`
  ).all();
  const { results: indexes = [] } = await env.DB.prepare(
    `SELECT name, tbl_name AS table_name, sql FROM sqlite_master
     WHERE type = 'index' AND sql IS NOT NULL ORDER BY tbl_name, name`
  ).all();
  const { results: triggers = [] } = await env.DB.prepare(
    `SELECT name, tbl_name AS table_name, sql FROM sqlite_master
     WHERE type = 'trigger' ORDER BY tbl_name, name`
  ).all();
  const columns = {};
  for (const table of tables) {
    const safeName = String(table.name).replace(/"/g, '""');
    const { results = [] } = await env.DB.prepare(`PRAGMA table_info("${safeName}")`).all();
    columns[table.name] = results;
  }
  return json({ ok: true, tables, columns, indexes, triggers, generatedAt: new Date().toISOString() });
}
