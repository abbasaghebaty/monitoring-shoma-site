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
  assert.deepEqual(validateProductDraft({ product_id: "P-1", name: "کالا", barcode: "123", min_stock: 5, is_active: 0 }, { creating: true }), {});
  assert.ok(validateProductDraft({ product_id: "P-1", name: "کالا", min_stock: -1 }, { creating: true }).min_stock);
  assert.ok(validateProductDraft({ product_id: "P-1", name: "کالا", is_active: 2 }, { creating: true }).is_active);
  assert.ok(validateProductDraft({ product_id: "P-1", name: "کالا" }).product_id);
});

test("SQLite trigger initializes prices and inventory; product create and audit are atomic", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  const product = await createProduct(DB, {
    product_id: "P-100", name: "مایع شوینده", unit: "عدد", package_quantity: 2, weight: 1.5,
    weight_unit: "لیتر", description: "توضیح", barcode: "62600010001", min_stock: 4, is_active: 0,
    purchase_price: 120, sell_price: 150, consumer_price: 160, market_price: 155,
  }, auditContext("create-100"));
  assert.equal(product.product_id, "P-100");
  assert.equal(product.sell_price, 150);
  assert.equal(product.barcode, "62600010001");
  assert.equal(product.min_stock, 4);
  assert.equal(product.is_active, 0);
  assert.equal(sqlite.prepare("SELECT quantity FROM inventory WHERE product_id=?").get("P-100").quantity, 0);
  assert.equal(sqlite.prepare("SELECT purchase_price FROM product_prices WHERE product_id=?").get("P-100").purchase_price, 120);
  const audit = sqlite.prepare("SELECT * FROM product_audit_log WHERE request_id=?").get("create-100");
  assert.equal(audit.actor_telegram_id, 1001);
  assert.equal(audit.operation, "CREATE");
  assert.equal(audit.previous_values, null);
  assert.equal(JSON.parse(audit.new_values).sell_price, 150);
  assert.equal(JSON.parse(audit.new_values).barcode, "62600010001");
  assert.equal(JSON.parse(audit.new_values).min_stock, 4);
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

test("product metadata updates are audited and preserve unrelated fields", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  const { createInventoryEntity } = await import("../src/repositories/inventory-workspace.js");
  const category = await createInventoryEntity(DB,"categories",{name:"Laundry"},1001,"category-for-product");
  const brand = await createInventoryEntity(DB,"brands",{name:"Shoma"},1001,"brand-for-product");
  await createProduct(DB,{product_id:"P-META",name:"Detergent",sell_price:70},auditContext("meta-create"));
  const updated = await updateProduct(DB,"P-META",{barcode:"62600020002",category_id:category.id,brand_id:brand.id,min_stock:8,is_active:0},auditContext("meta-update"));
  assert.equal(updated.category_id,category.id); assert.equal(updated.brand_id,brand.id);
  assert.equal(updated.category_name,"Laundry"); assert.equal(updated.brand_name,"Shoma");
  assert.equal(updated.min_stock,8); assert.equal(updated.is_active,0); assert.equal(updated.sell_price,70);
  const audit=sqlite.prepare("SELECT previous_values,new_values FROM product_audit_log WHERE request_id=?").get("meta-update");
  assert.deepEqual(JSON.parse(audit.previous_values),{barcode:null,category_id:null,brand_id:null,min_stock:0,is_active:1});
  assert.deepEqual(JSON.parse(audit.new_values),{barcode:"62600020002",category_id:category.id,brand_id:brand.id,min_stock:8,is_active:0});
});

test("duplicate barcode is rejected by the database without overwriting another product", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB,{product_id:"P-BAR-1",name:"One",barcode:"62600030003"},auditContext("barcode-one"));
  await assert.rejects(createProduct(DB,{product_id:"P-BAR-2",name:"Two",barcode:" 62600030003 "},auditContext("barcode-two")));
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM products WHERE barcode IS NOT NULL").get().n,1);
});

test("inactive or unknown category and brand references are rejected", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await assert.rejects(createProduct(DB,{product_id:"P-BAD-CAT",name:"Bad",category_id:"missing"},auditContext("bad-category")),/PRODUCT_CATEGORY_INVALID/);
  await assert.rejects(createProduct(DB,{product_id:"P-BAD-BRAND",name:"Bad",brand_id:"missing"},auditContext("bad-brand")),/PRODUCT_BRAND_INVALID/);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM products").get().n,0);
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

test("missing price row is detected and the API returns conflict instead of false success", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-MISSING", name: "کالا" }, auditContext("create-missing"));
  sqlite.prepare("DELETE FROM product_prices WHERE product_id=?").run("P-MISSING");
  await assert.rejects(updateProduct(DB, "P-MISSING", { sell_price: 10 }, auditContext("missing-price")), ProductPriceRowMissingError);
  const request = new Request("https://worker.test/api/v1/products/P-MISSING", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sell_price: 10 }),
  });
  const response = await productWriteRoutes(request, { DB }, new URL(request.url), user, { requestId: "missing-price-api" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.errorCode, "PRODUCT_PRICE_MISSING");
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

test("audit insertion failure rolls back a product update", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-UPD-ROLLBACK", name: "اول", sell_price: 10 }, auditContext("reuse-request"));
  await assert.rejects(updateProduct(DB, "P-UPD-ROLLBACK", { sell_price: 20 }, auditContext("reuse-request")));
  const current = await getProduct(DB, "P-UPD-ROLLBACK");
  assert.equal(current.sell_price, 10);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log WHERE product_id=?").get("P-UPD-ROLLBACK").n, 1);
});

test("concurrent PATCH requests expose one success and one HTTP 409 conflict", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-HTTP-RACE", name: "کالا", sell_price: 10, purchase_price: 5 }, auditContext("http-race-create"));
  const makeRequest = (body) => new Request("https://worker.test/api/v1/products/P-HTTP-RACE", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const responses = await Promise.all([
    productWriteRoutes(makeRequest({ sell_price: 12 }), { DB }, new URL("https://worker.test/api/v1/products/P-HTTP-RACE"), user, { requestId: "http-race-a" }),
    productWriteRoutes(makeRequest({ purchase_price: 7 }), { DB }, new URL("https://worker.test/api/v1/products/P-HTTP-RACE"), user, { requestId: "http-race-b" }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log WHERE product_id=?").get("P-HTTP-RACE").n, 2);
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

test("all valid roles can manage products while unauthenticated callers receive 401", async (t) => {
  const { DB, sqlite, close } = setup(); t.after(close);
  await createProduct(DB, { product_id: "P-BASE", name: "کالای پایه", sell_price: 20 }, auditContext("employee-base"));
  const employee = { ...user, role: "employee" };
  const createRequest = new Request("https://worker.test/api/v1/products", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_id: "P-NEW", name: "کالای جدید" }),
  });
  const created = await productWriteRoutes(createRequest, { DB }, new URL(createRequest.url), employee, { requestId: "employee-create" });
  assert.equal(created.status, 201);
  const updateRequest = new Request("https://worker.test/api/v1/products/P-BASE", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sell_price: 99 }),
  });
  const updated = await productWriteRoutes(updateRequest, { DB }, new URL(updateRequest.url), employee, { requestId: "employee-update" });
  assert.equal(updated.status, 200);
  assert.equal((await getProduct(DB, "P-BASE")).sell_price, 99);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM products WHERE product_id=?").get("P-NEW").n, 1);
  const unauthenticated = await router(createRequest, { SITE_AUTH_KV: { async get() { return null; } } });
  assert.equal(unauthenticated.status, 401);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM product_audit_log").get().n, 3);
});

test("all valid roles may manage products; unknown roles may not", () => {
  assert.equal(canManage("owner"), true);
  assert.equal(canManage("manager"), true);
  assert.equal(canManage("employee"), true);
  assert.equal(canManage("admin"), false);
});
