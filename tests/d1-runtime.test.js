import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  createProduct,
  updateProduct,
  getProduct,
  ProductConflictError,
} from "../worker/src/repositories/products.js";
import { productWriteRoutes } from "../worker/src/routes/products.js";
import { listInventory } from "../worker/src/repositories/inventory.js";
import { listSales } from "../worker/src/repositories/sales.js";
import { listDebts } from "../worker/src/repositories/debts.js";
import { listCustomers } from "../worker/src/repositories/customers.js";
import { listAttendance } from "../worker/src/repositories/attendance.js";
import { dashboardRoutes } from "../worker/src/routes/dashboard.js";

const actorTelegramId = 7001001;
const manager = { telegram_id: actorTelegramId, role: "manager" };
const context = (requestId) => ({ actorTelegramId, requestId });
const id = (prefix) => prefix + "-" + crypto.randomUUID();

function splitSqlStatements(sql) {
  const statements = [];
  let current = "";
  let insideTrigger = false;

  for (const line of sql.split(String.fromCharCode(10))) {
    const trimmed = line.trim();
    const upper = trimmed.toUpperCase();
    if (!trimmed || trimmed.startsWith("--") || upper.startsWith("PRAGMA ")) continue;

    if (upper.startsWith("CREATE TRIGGER ")) insideTrigger = true;
    current += (current ? String.fromCharCode(10) : "") + line;

    if (insideTrigger) {
      if (upper === "END;" || upper === "END") {
        statements.push(current.trim().replace(/;$/, ""));
        current = "";
        insideTrigger = false;
      }
    } else if (trimmed.endsWith(";")) {
      statements.push(current.trim().replace(/;$/, ""));
      current = "";
    }
  }

  if (current.trim()) throw new Error("Incomplete migration SQL statement");
  return statements;
}

async function applyStatements(sql) {
  for (const statement of splitSqlStatements(sql)) {
    await env.DB.prepare(statement).run();
  }
}

beforeAll(async () => {
  // cloudflareTest uses the local Miniflare D1 binding from wrangler.toml.
  // The actual ordered baseline and audit migrations are executed statement-by-statement
  // because D1Database.exec() accepts newline-separated queries, not multiline SQL blocks.
  const before = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
  ).all();
  if (before.results.length !== 0) throw new Error("D1 test binding must start empty; found: " + before.results.map((row) => row.name).join(", "));

  await applyStatements(env.TEST_BASELINE_SQL);
  // Baseline is intentionally safe to re-run; this catches accidental non-idempotent DDL.
  await applyStatements(env.TEST_BASELINE_SQL);
  await applyStatements(env.TEST_AUDIT_MIGRATION_SQL);
  await env.DB.prepare(
    "INSERT INTO users (telegram_id, full_name, role, is_active) VALUES (?, ?, 'manager', 1)"
  ).bind(actorTelegramId, "D1 Integration Manager").run();
});

async function auditCount(productId) {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM product_audit_log WHERE product_id = ?"
  ).bind(productId).first();
  return Number(row.count);
}

function barrierDatabase(db, expectedReaders = 2) {
  let readers = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      let bound = statement;
      const wrapper = {
        __d1Statement() { return bound; },
        bind(...values) { bound = statement.bind(...values); return wrapper; },
        async first(...args) {
          const result = await bound.first(...args);
          if (sql.includes("price_row_product_id")) {
            readers += 1;
            if (readers === expectedReaders) release();
            await gate;
          }
          return result;
        },
        all: (...args) => bound.all(...args),
        run: (...args) => bound.run(...args),
        raw: (...args) => bound.raw(...args),
      };
      return wrapper;
    },
    batch: (statements) => db.batch(statements.map((statement) => statement.__d1Statement())),
  };
}

describe("Cloudflare D1 runtime product integrity", () => {
  it("initializes every application table from an empty D1 database using ordered migrations", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
    ).all();
    expect(tables.results.map((row) => row.name)).toEqual([
      "attendance", "customers", "debts", "inventory", "product_audit_log",
      "product_prices", "products", "sales", "users",
    ]);

    // Verify real FK enforcement rather than relying only on PRAGMA metadata.
    await expect(env.DB.prepare(
      "INSERT INTO attendance (telegram_id, check_in) VALUES (?, ?)"
    ).bind(-123456, "2026-11-22T08:00:00Z").run()).rejects.toThrow();
    await expect(env.DB.prepare(
      "INSERT INTO product_audit_log (actor_telegram_id, product_id, operation, previous_values, new_values, request_id) VALUES (?, ?, 'CREATE', NULL, '{}', ?)"
    ).bind(actorTelegramId, "missing-product", id("fk-audit")).run()).rejects.toThrow();
  });

  it("preserves sales, stock, debt, customer and attendance query contracts", async () => {
    const productId = id("D1-SCHEMA-COMPAT");
    await createProduct(env.DB, {
      product_id: productId, name: "schema contract", purchase_price: 10, sell_price: 20,
    }, context(id("schema-create")));
    await env.DB.prepare("UPDATE inventory SET quantity=5 WHERE product_id=?").bind(productId).run();

    const sale = await env.DB.prepare(
      "INSERT INTO sales (product_id, quantity, sale_date, sale_time, sale_channel, purchase_price, sell_price, consumer_price, amount_paid, payment_method, customer_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).bind(productId, 2, "2026-11-22", "10:00:00", "in_store", 10, 20, 25, 10, "cash", "Test customer").run();

    const inventory = await env.DB.prepare("SELECT quantity FROM inventory WHERE product_id=?").bind(productId).first();
    const debt = await env.DB.prepare("SELECT sale_id, amount, status FROM debts WHERE sale_id=?").bind(Number(sale.meta.last_row_id)).first();
    expect(inventory.quantity).toBe(3);
    expect(debt.amount).toBe(30);
    expect(debt.status).toBe("open");

    await env.DB.prepare("INSERT INTO customers (name, phone, note) VALUES (?, ?, ?)").bind("Test customer", null, null).run();
    await env.DB.prepare("INSERT INTO attendance (telegram_id, check_in) VALUES (?, ?)").bind(actorTelegramId, "2026-11-22T08:00:00Z").run();

    const queryUrl = new URL("https://worker.test/api/v1");
    expect((await listInventory(env.DB, queryUrl)).items).toHaveLength(1);
    expect((await listSales(env.DB, queryUrl)).items).toHaveLength(1);
    expect((await listDebts(env.DB, queryUrl)).items).toHaveLength(1);
    expect((await listCustomers(env.DB, queryUrl)).items).toHaveLength(1);
    expect((await listAttendance(env.DB, queryUrl)).items).toHaveLength(1);
    const dashboard = await dashboardRoutes(new Request("https://worker.test/api/v1/dashboard/summary"), { DB: env.DB }, new URL("https://worker.test/api/v1/dashboard/summary"), manager);
    expect((await dashboard.json()).data.products.count).toBe(1);

    await expect(env.DB.prepare("UPDATE sales SET amount_paid=20 WHERE id=?").bind(Number(sale.meta.last_row_id)).run()).rejects.toThrow(/immutable/);
    await expect(env.DB.prepare("DELETE FROM sales WHERE id=?").bind(Number(sale.meta.last_row_id)).run()).rejects.toThrow(/immutable/);
  });

  it("runs the product initialization trigger and records one atomic CREATE audit event", async () => {
    const productId = id("D1-CREATE");
    const requestId = id("create-request");
    const product = await createProduct(env.DB, {
      product_id: productId, name: "D1 product", purchase_price: 11, sell_price: 15,
      consumer_price: 18, market_price: 17,
    }, context(requestId));

    expect(product.sell_price).toBe(15);
    const inventory = await env.DB.prepare(
      "SELECT quantity FROM inventory WHERE product_id = ?"
    ).bind(productId).first();
    expect(inventory.quantity).toBe(0);
    expect(await auditCount(productId)).toBe(1);
    const audit = await env.DB.prepare(
      "SELECT actor_telegram_id, operation, previous_values, new_values, request_id FROM product_audit_log WHERE request_id = ?"
    ).bind(requestId).first();
    expect(audit.actor_telegram_id).toBe(actorTelegramId);
    expect(audit.operation).toBe("CREATE");
    expect(audit.previous_values).toBeNull();
    expect(JSON.parse(audit.new_values).sell_price).toBe(15);
    expect(audit.request_id).toBe(requestId);
  });

  it("rolls back product and trigger rows when a later D1 batch statement fails", async () => {
    const productId = id("D1-BATCH-ROLLBACK");
    await expect(env.DB.batch([
      env.DB.prepare("INSERT INTO products (product_id, name) VALUES (?, ?)").bind(productId, "rollback"),
      env.DB.prepare(
        "INSERT INTO product_audit_log (actor_telegram_id, product_id, operation, previous_values, new_values, request_id) VALUES (?, ?, 'CREATE', NULL, '{}', ?)"
      ).bind(-999, productId, id("bad-fk")),
    ])).rejects.toThrow();

    const product = await env.DB.prepare("SELECT product_id FROM products WHERE product_id = ?").bind(productId).first();
    const price = await env.DB.prepare("SELECT product_id FROM product_prices WHERE product_id = ?").bind(productId).first();
    const inventory = await env.DB.prepare("SELECT product_id FROM inventory WHERE product_id = ?").bind(productId).first();
    expect(product).toBeNull();
    expect(price).toBeNull();
    expect(inventory).toBeNull();
  });

  it("rolls back an audit row when a later conditional product update affects zero rows", async () => {
    const productId = id("D1-GUARD");
    await createProduct(env.DB, { product_id: productId, name: "before", sell_price: 10 }, context(id("guard-create")));
    await env.DB.exec(
      "CREATE TRIGGER test_ignore_product_update BEFORE UPDATE ON products BEGIN SELECT RAISE(IGNORE); END"
    );

    await expect(updateProduct(env.DB, productId, { name: "after" }, context(id("guard-update")))).rejects.toThrow();

    await env.DB.exec("DROP TRIGGER test_ignore_product_update");
    expect((await getProduct(env.DB, productId)).name).toBe("before");
    expect(await auditCount(productId)).toBe(1);
  });

  it("rolls back a product update if its audit insert fails", async () => {
    const productId = id("D1-AUDIT-FAIL");
    const repeatedRequestId = id("unique-audit-request");
    await createProduct(env.DB, { product_id: productId, name: "before", sell_price: 20 }, context(repeatedRequestId));

    await expect(updateProduct(env.DB, productId, { sell_price: 21 }, context(repeatedRequestId))).rejects.toThrow();

    expect((await getProduct(env.DB, productId)).sell_price).toBe(20);
    expect(await auditCount(productId)).toBe(1);
  });

  it("uses D1 affected-row counts to reject zero-row conditional updates", async () => {
    const result = await env.DB.prepare(
      "UPDATE product_prices SET sell_price = ? WHERE product_id = ?"
    ).bind(99, id("missing")).run();
    expect(Number(result.meta.changes)).toBe(0);
  });

  it("rejects UPDATE and DELETE against audit records using the migration triggers", async () => {
    const productId = id("D1-IMMUTABLE");
    const requestId = id("immutable-request");
    await createProduct(env.DB, { product_id: productId, name: "immutable" }, context(requestId));

    await expect(env.DB.prepare(
      "UPDATE product_audit_log SET operation = 'UPDATE' WHERE request_id = ?"
    ).bind(requestId).run()).rejects.toThrow(/append-only/);
    await expect(env.DB.prepare(
      "DELETE FROM product_audit_log WHERE request_id = ?"
    ).bind(requestId).run()).rejects.toThrow(/append-only/);
    expect(await auditCount(productId)).toBe(1);
  });

  it("serializes concurrent D1 requests and returns one conflict without a lost update", async () => {
    const productId = id("D1-CONCURRENT");
    await createProduct(env.DB, {
      product_id: productId, name: "concurrent", sell_price: 100, purchase_price: 50,
    }, context(id("concurrent-create")));

    // Force both requests to observe the same pre-write snapshot before either may batch.
    const sharedSnapshotDb = barrierDatabase(env.DB);
    const results = await Promise.allSettled([
      updateProduct(sharedSnapshotDb, productId, { sell_price: 110 }, context(id("concurrent-a"))),
      updateProduct(sharedSnapshotDb, productId, { purchase_price: 60 }, context(id("concurrent-b"))),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected.reason).toBeInstanceOf(ProductConflictError);
    const finalProduct = await getProduct(env.DB, productId);
    expect(
      (finalProduct.sell_price === 110 && finalProduct.purchase_price === 50) ||
      (finalProduct.sell_price === 100 && finalProduct.purchase_price === 60)
    ).toBe(true);
    expect(await auditCount(productId)).toBe(2);
  });

  it("returns HTTP 409 for the losing concurrent PATCH request", async () => {
    const productId = id("D1-HTTP-RACE");
    await createProduct(env.DB, { product_id: productId, name: "race", sell_price: 10, purchase_price: 5 }, context(id("http-race-create")));
    const db = barrierDatabase(env.DB);
    const url = "https://worker.test/api/v1/products/" + encodeURIComponent(productId);
    const makeRequest = (body) => new Request(url, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const responses = await Promise.all([
      productWriteRoutes(makeRequest({ sell_price: 12 }), { DB: db }, new URL(url), manager, { requestId: id("http-a") }),
      productWriteRoutes(makeRequest({ purchase_price: 7 }), { DB: db }, new URL(url), manager, { requestId: id("http-b") }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await auditCount(productId)).toBe(2);
  });
});
