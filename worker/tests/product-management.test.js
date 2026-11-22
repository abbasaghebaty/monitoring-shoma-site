import test from "node:test";
import assert from "node:assert/strict";
import { validateProductDraft } from "../src/validation/products.js";
import {
  createProduct, updateProduct, getProduct, listProducts,
  ProductConflictError, ProductPriceRowMissingError, ProductNoChangesError,
} from "../src/repositories/products.js";
import { productWriteRoutes } from "../src/routes/products.js";
import { canManage } from "../src/auth/permissions.js";
import { router } from "../src/router.js";
import { createSqliteD1 } from "./helpers/sqlite-d1.js";

function setup() {
  const testDb = createSqliteD1();
  testDb.sqlite.prepare("INSERT INTO users (telegram_id, full_name, role) VALUES (?, ?, ?)").run(1001, "Test Manager", "manager");
  return testDb;
}
const auditContext = (requestId) => ({ actorTelegramId: 1001, requestId });
const user = { telegram_id: 1001, role: "manager" };

test("product draft validation follows the schema and rejects unsupported fields", () => {
  assert.deepEqual(validateProductDraft({ product_id: "P-100", name: "مایع شوینده", unit: "عدد", purchase_price: 120, sell_price: 150 }, { creating: true }), {});
  assert.ok(validateProductDraft({ product_id: "P-1", name: "", purchase_price: -1 }, { creating: true }).name);
  assert.ok(validateProductDraft({ product_id: "P-1", name: "کالا", barcode: "123" }, { creating: true }).barcode);
  assert.ok(validateProductDraft({ product_id: "P-1", name: "کالا" }).product_id);
});

test("SQLite trigger initializes prices and inventory; product create and audit are atomic", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  const product = await createProduct(DB, {
    product_id: "P-100", name: "مایع شوینده", unit: "عدد", package_quantity: 2, weight: 1.5,
    weight_unit: "لیتر", description: "توضیح", purchase_price: 120, sell_price: 150, consumer_price: 160, market_price: 155,
  }, auditContext("create-100"));
  assert.equal(product.product_id, "P-100");
  assert.equal(product.sell_price, 150);
  assert.equal(sqlite.prepare("SELECT quantity FROM inventory WHERE product_id=?").get("P-100").quantity, 0);
  assert.equal(sqlite.prepare("SELECT purchase_price FROM product_prices WHERE product_id=?").get("P-100").purchase_price, 120);
  const audit = sqlite.prepare("SELECT * FROM product_audit_log WHERE request_id=?").get("create-100");
  assert.equal(audit.actor_telegram_id, 1001);
  assert.equal(audit.operation, "CREATE");
  assert.equal(audit.previous_values, null);
  assert.equal(JSON.parse(audit.new_values).sell_price, 150);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log").get().n, 1);
});

test("duplicate product IDs return 409 without a second audit event", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-DUP", name: "کالا" }, auditContext("duplicate-first"));
  const request = new Request("https://worker.test/api/v1/products", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: "P-DUP", name: "کالای تکراری" }),
  });
  const response = await productWriteRoutes(request, { DB }, new URL(request.url), user, { requestId: "duplicate-second" });
  assert.equal(response.status, 409);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log").get().n, 1);
});

test("updating one price preserves unrelated prices and records only changed values", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-200", name: "مایع", purchase_price: 100, sell_price: 120, consumer_price: 130, market_price: 125 }, auditContext("create-200"));
  const updated = await updateProduct(DB, "P-200", { sell_price: 135 }, auditContext("update-200"));
  assert.equal(updated.purchase_price, 100);
  assert.equal(updated.sell_price, 135);
  assert.equal(updated.consumer_price, 130);
  assert.equal(updated.market_price, 125);
  const audit = sqlite.prepare("SELECT * FROM product_audit_log WHERE request_id=?").get("update-200");
  assert.deepEqual(JSON.parse(audit.previous_values), { sell_price: 120 });
  assert.deepEqual(JSON.parse(audit.new_values), { sell_price: 135 });
});

test("missing price row is detected and never reported as success", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-MISSING", name: "کالا" }, auditContext("create-missing"));
  sqlite.prepare("DELETE FROM product_prices WHERE product_id=?").run("P-MISSING");
  await assert.rejects(updateProduct(DB, "P-MISSING", { sell_price: 10 }, auditContext("missing-price")), ProductPriceRowMissingError);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log").get().n, 1);
});

test("stale concurrent updates conflict instead of overwriting a newer value", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-RACE", name: "کالا", sell_price: 100, purchase_price: 50 }, auditContext("race-create"));
  const results = await Promise.allSettled([
    updateProduct(DB, "P-RACE", { sell_price: 110 }, auditContext("race-a")),
    updateProduct(DB, "P-RACE", { purchase_price: 60 }, auditContext("race-b")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.ok(results.find((result) => result.status === "rejected").reason instanceof ProductConflictError);
  const product = await getProduct(DB, "P-RACE");
  assert.ok(product.sell_price === 110 || product.purchase_price === 60);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log WHERE product_id=?").get("P-RACE").n, 2);
});

test("audit insertion failure rolls back associated product and trigger rows", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-ORIGINAL", name: "اول" }, auditContext("same-request"));
  await assert.rejects(createProduct(DB, { product_id: "P-ROLLBACK", name: "دوم" }, auditContext("same-request")));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM products WHERE product_id=?").get("P-ROLLBACK").n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory WHERE product_id=?").get("P-ROLLBACK").n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log").get().n, 1);
});

test("later batch statement failure rolls back product insert and trigger-generated rows", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await assert.rejects(DB.batch([
    DB.prepare("INSERT INTO products (product_id, name) VALUES (?, ?)").bind("P-BATCH", "Batch"),
    DB.prepare("INSERT INTO product_audit_log (actor_telegram_id, product_id, operation, previous_values, new_values, request_id) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(999999, "P-BATCH", "CREATE", null, "{}", "fk-failure"),
  ]));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM products WHERE product_id=?").get("P-BATCH").n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_prices WHERE product_id=?").get("P-BATCH").n, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM inventory WHERE product_id=?").get("P-BATCH").n, 0);
});

test("zero-row updates are detected and the transactional guard aborts", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  const result = sqlite.prepare("UPDATE product_prices SET sell_price=? WHERE product_id=?").run(50, "not-found");
  assert.equal(Number(result.changes), 0);
  await assert.rejects(DB.batch([
    DB.prepare("UPDATE product_prices SET sell_price=? WHERE product_id=?").bind(50, "not-found"),
    DB.prepare("INSERT INTO product_audit_log (actor_telegram_id, product_id, operation, previous_values, new_values, request_id) SELECT NULL,NULL,NULL,NULL,NULL,NULL WHERE changes()=0"),
  ]));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log").get().n, 0);
});

test("audit records reject ordinary UPDATE and DELETE", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-IMMUTABLE", name: "کالا" }, auditContext("immutable"));
  assert.throws(() => sqlite.prepare("UPDATE product_audit_log SET operation='UPDATE' WHERE request_id='immutable'").run(), /append-only/);
  assert.throws(() => sqlite.prepare("DELETE FROM product_audit_log WHERE request_id='immutable'").run(), /append-only/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log").get().n, 1);
});

test("no-op edits are not reported as successful and create no audit event", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-NOOP", name: "کالا", sell_price: 50 }, auditContext("noop-create"));
  await assert.rejects(updateProduct(DB, "P-NOOP", { sell_price: 50 }, auditContext("noop-update")), ProductNoChangesError);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log").get().n, 1);
});

test("product search uses bound values and SQLite inventory rows", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-SEARCH", name: "شوینده" }, auditContext("search-create"));
  sqlite.prepare("UPDATE inventory SET quantity=5 WHERE product_id=?").run("P-SEARCH");
  const result = await listProducts(DB, new URL("https://worker.test/api/v1/products?q=P-SEARCH&stock=in_stock"));
  assert.equal(result.items.length, 1);
  assert.equal(result.pagination.total, 1);
});

test("employee and unauthenticated callers cannot write products", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  const request = new Request("https://worker.test/api/v1/products", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: "P-DENIED", name: "کالا" }),
  });
  const denied = await productWriteRoutes(request, { DB }, new URL(request.url), { ...user, role: "employee" }, { requestId: "denied" });
  assert.equal(denied.status, 403);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM products").get().n, 0);
  const unauthenticated = await router(request, { SITE_AUTH_KV: { async get() { return null; } } });
  assert.equal(unauthenticated.status, 401);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log").get().n, 0);
});

test("only owner and manager may manage products", () => {
  assert.equal(canManage("owner"), true);
  assert.equal(canManage("manager"), true);
  assert.equal(canManage("employee"), false);
  assert.equal(canManage("admin"), false);
});
