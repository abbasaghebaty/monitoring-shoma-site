import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const fixtureUrl = new URL("../fixtures/product-schema.sql", import.meta.url);
const migrationUrl = new URL("../../migrations/0001_product_audit_log.sql", import.meta.url);

export function createSqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(readFileSync(fixtureUrl, "utf8"));
  sqlite.exec(readFileSync(migrationUrl, "utf8"));

  const DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...nextValues) { values = nextValues; return this; },
        async first() { return sqlite.prepare(sql).get(...values) ?? null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        execute() {
          const result = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { DB, sqlite, close: () => sqlite.close() };
}
