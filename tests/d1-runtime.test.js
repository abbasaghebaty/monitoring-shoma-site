import { beforeAll, describe, expect, it } from "vitest";
import { env } from "cloudflare:workers";
import {
  createProduct,
  updateProduct,
  getProduct,
  ProductConflictError,
} from "../worker/src/repositories/products.js";
import { productWriteRoutes } from "../worker/src/routes/products.js";

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

  if (current.trim()) throw new Error("Incomplete SQL fixture statement");
  return statements;
}

async function applyStatements(sql) {
  for (const statement of splitSqlStatements(sql)) {
    await env.DB.prepare(statement).run();
  }
}

beforeAll(async () => {
  // cloudflareTest uses the local Miniflare D1 binding from wrangler.toml.
  // The fixture and actual audit migration are executed statement-by-statement
  // because D1Database.exec() accepts newline-separated queries, not multiline SQL blocks.
  await applyStatements(env.TEST_PRODUCT_SCHEMA_SQL);
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
    batch: (statements) => db.batch(statements),
  };
}

describe("Cloudflare D1 runtime product integrity", () => {
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
