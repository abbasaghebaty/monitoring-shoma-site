import { parsePagination } from "../validation/common.js";

const PRODUCT_SELECT = [
  "SELECT p.product_id, p.name, p.unit, p.package_quantity, p.weight, p.weight_unit,",
  "p.description, p.barcode, p.category_id, p.brand_id, p.min_stock, p.is_active, p.created_at,",
  "COALESCE(pp.purchase_price,0) AS purchase_price, COALESCE(pp.sell_price,0) AS sell_price,",
  "COALESCE(pp.consumer_price,0) AS consumer_price, COALESCE(pp.market_price,0) AS market_price,",
  "COALESCE(i.quantity,0) AS quantity, pp.updated_at AS price_updated_at, i.updated_at AS inventory_updated_at,",
  "c.name AS category_name, b.name AS brand_name",
  "FROM products p LEFT JOIN product_prices pp ON pp.product_id=p.product_id",
  "LEFT JOIN inventory i ON i.product_id=p.product_id",
  "LEFT JOIN product_categories c ON c.id=p.category_id",
  "LEFT JOIN product_brands b ON b.id=p.brand_id",
].join(" ");

const PRODUCT_FIELDS = ["name", "unit", "package_quantity", "weight", "weight_unit", "description", "barcode", "category_id", "brand_id", "min_stock", "is_active"];
const PRICE_FIELDS = ["purchase_price", "sell_price", "consumer_price", "market_price"];
const SNAPSHOT_FIELDS = [...PRODUCT_FIELDS, ...PRICE_FIELDS];

export class ProductConflictError extends Error {
  constructor() { super("Product changed since it was loaded"); this.name = "ProductConflictError"; }
}
export class ProductPriceRowMissingError extends Error {
  constructor() { super("Product price row is missing"); this.name = "ProductPriceRowMissingError"; }
}
export class ProductNoChangesError extends Error {
  constructor() { super("No effective product changes"); this.name = "ProductNoChangesError"; }
}

export async function listProducts(db, url) {
  const { limit, offset } = parsePagination(url);
  const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const stock = url.searchParams.get("stock");
  const clauses = [];
  const params = [];
  if (search) { clauses.push("(p.name LIKE ? OR p.product_id LIKE ?)"); params.push("%" + search + "%", "%" + search + "%"); }
  if (stock === "in_stock") clauses.push("COALESCE(i.quantity,0) > 0");
  if (stock === "out_of_stock") clauses.push("COALESCE(i.quantity,0) = 0");
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const { results = [] } = await db.prepare(PRODUCT_SELECT + " " + where + " ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?").bind(...params, limit, offset).all();
  const total = await db.prepare("SELECT COUNT(*) AS total FROM products p LEFT JOIN inventory i ON i.product_id=p.product_id " + where).bind(...params).first();
  return { items: results, pagination: { limit, offset, total: Number(total?.total || 0) } };
}

export async function getProduct(db, productId) {
  return db.prepare(PRODUCT_SELECT + " WHERE p.product_id=? LIMIT 1").bind(productId).first();
}

async function getProductSnapshot(db, productId) {
  return db.prepare(
    "SELECT p.product_id, p.name, p.unit, p.package_quantity, p.weight, p.weight_unit, p.description, " +
    "p.barcode, p.category_id, p.brand_id, p.min_stock, p.is_active, " +
    "pp.product_id AS price_row_product_id, pp.purchase_price, pp.sell_price, pp.consumer_price, pp.market_price " +
    "FROM products p LEFT JOIN product_prices pp ON pp.product_id=p.product_id WHERE p.product_id=? LIMIT 1"
  ).bind(productId).first();
}

function normalizeProductValue(field, value) {
  if (field === "package_quantity" || field === "weight") return value === "" || value == null ? null : Number(value);
  if (field === "min_stock" || field === "is_active") return Number(value);
  if (["barcode", "category_id", "brand_id"].includes(field)) return value == null || value === "" ? null : String(value).trim();
  if (["name", "unit", "weight_unit", "description"].includes(field)) return value == null || value === "" ? null : String(value).trim();
  return value;
}

function snapshotPredicate() {
  return [
    ...PRODUCT_FIELDS.map((field) => "p." + field + " IS ?"),
    ...PRICE_FIELDS.map((field) => "pp." + field + " IS ?"),
  ].join(" AND ");
}
function snapshotValues(current) { return SNAPSHOT_FIELDS.map((field) => current[field]); }

function auditFailureGuardSql() {
  // If the immediately preceding conditional UPDATE changed zero rows, this INSERT
  // intentionally violates NOT NULL and aborts the same D1 transaction.
  return "INSERT INTO product_audit_log (actor_telegram_id, product_id, operation, previous_values, new_values, request_id) " +
    "SELECT NULL, NULL, NULL, NULL, NULL, NULL WHERE changes() = 0";
}

async function validateProductRelations(db, values) {
  if (values.category_id) {
    const category = await db.prepare("SELECT id FROM product_categories WHERE id=? AND is_active=1").bind(values.category_id).first();
    if (!category) throw new Error("PRODUCT_CATEGORY_INVALID");
  }
  if (values.brand_id) {
    const brand = await db.prepare("SELECT id FROM product_brands WHERE id=? AND is_active=1").bind(values.brand_id).first();
    if (!brand) throw new Error("PRODUCT_BRAND_INVALID");
  }
}

export async function createProduct(db, draft, { actorTelegramId, requestId } = {}) {
  const productId = String(draft.product_id).trim();
  const base = {
    product_id: productId,
    name: String(draft.name).trim(),
    unit: String(draft.unit || "عدد").trim(),
    package_quantity: draft.package_quantity === "" || draft.package_quantity == null ? null : Number(draft.package_quantity),
    weight: draft.weight === "" || draft.weight == null ? null : Number(draft.weight),
    weight_unit: draft.weight_unit ? String(draft.weight_unit).trim() : null,
    description: draft.description ? String(draft.description).trim() : null,
    barcode: draft.barcode ? String(draft.barcode).trim() : null,
    category_id: draft.category_id ? String(draft.category_id).trim() : null,
    brand_id: draft.brand_id ? String(draft.brand_id).trim() : null,
    min_stock: Number(draft.min_stock ?? 0),
    is_active: Number(draft.is_active ?? 1),
  };
  await validateProductRelations(db, base);
  const prices = Object.fromEntries(PRICE_FIELDS.map((field) => [field, Number(draft[field] ?? 0)]));
  const newValues = { ...base, ...prices };
  const auditRequestId = requestId || crypto.randomUUID();

  await db.batch([
    db.prepare("INSERT INTO products (product_id, name, unit, package_quantity, weight, weight_unit, description, barcode, category_id, brand_id, min_stock, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(base.product_id, base.name, base.unit, base.package_quantity, base.weight, base.weight_unit, base.description, base.barcode, base.category_id, base.brand_id, base.min_stock, base.is_active),
    // trg_product_initialize creates the price row and zero-quantity inventory row.
    db.prepare("UPDATE product_prices SET purchase_price=?, sell_price=?, consumer_price=?, market_price=? WHERE product_id=?")
      .bind(prices.purchase_price, prices.sell_price, prices.consumer_price, prices.market_price, productId),
    // The audit insert must see exactly one row changed by the preceding price UPDATE.
    // Otherwise NULL actor violates NOT NULL and rolls back product + trigger rows.
    db.prepare(
      "INSERT INTO product_audit_log (actor_telegram_id, product_id, operation, previous_values, new_values, request_id) " +
      "VALUES (CASE WHEN changes() = 1 THEN ? ELSE NULL END, ?, 'CREATE', NULL, ?, ?)"
    ).bind(Number(actorTelegramId), productId, JSON.stringify(newValues), auditRequestId),
  ]);
  return getProduct(db, productId);
}

export async function updateProduct(db, productId, draft, { actorTelegramId, requestId } = {}) {
  const current = await getProductSnapshot(db, productId);
  if (!current) return null;
  if (!current.price_row_product_id) throw new ProductPriceRowMissingError();

  const previousValues = {};
  const newValues = {};
  const changedProduct = {};
  const changedPrices = {};
  for (const field of PRODUCT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(draft, field)) continue;
    const value = normalizeProductValue(field, draft[field]);
    if (Object.is(value, current[field])) continue;
    previousValues[field] = current[field]; newValues[field] = value; changedProduct[field] = value;
  }
  for (const field of PRICE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(draft, field)) continue;
    const value = Number(draft[field]);
    if (Object.is(value, current[field])) continue;
    previousValues[field] = current[field]; newValues[field] = value; changedPrices[field] = value;
  }
  if (!Object.keys(newValues).length) throw new ProductNoChangesError();
  await validateProductRelations(db, changedProduct);

  const auditRequestId = requestId || crypto.randomUUID();
  const predicateParams = [productId, ...snapshotValues(current)];
  const statements = [
    // This first statement is the full-snapshot compare-and-swap guard.
    // A stale snapshot or missing price row makes actor NULL and aborts the batch.
    db.prepare(
      "INSERT INTO product_audit_log (actor_telegram_id, product_id, operation, previous_values, new_values, request_id) " +
      "VALUES (CASE WHEN EXISTS (SELECT 1 FROM products p INNER JOIN product_prices pp ON pp.product_id=p.product_id " +
      "WHERE p.product_id=? AND " + snapshotPredicate() +
      ") THEN ? ELSE NULL END, ?, 'UPDATE', ?, ?, ?)"
    ).bind(...predicateParams, Number(actorTelegramId), productId, JSON.stringify(previousValues), JSON.stringify(newValues), auditRequestId),
  ];

  if (Object.keys(changedProduct).length) {
    const fields = Object.keys(changedProduct);
    statements.push(
      db.prepare("UPDATE products SET " + fields.map((field) => field + "=?").join(", ") +
        " WHERE product_id=? AND " + PRODUCT_FIELDS.map((field) => field + " IS ?").join(" AND "))
        .bind(...fields.map((field) => changedProduct[field]), productId, ...PRODUCT_FIELDS.map((field) => current[field])),
      db.prepare(auditFailureGuardSql()),
    );
  }
  if (Object.keys(changedPrices).length) {
    const fields = Object.keys(changedPrices);
    statements.push(
      db.prepare("UPDATE product_prices SET " + fields.map((field) => field + "=?").join(", ") +
        " WHERE product_id=? AND " + PRICE_FIELDS.map((field) => field + " IS ?").join(" AND "))
        .bind(...fields.map((field) => changedPrices[field]), productId, ...PRICE_FIELDS.map((field) => current[field])),
      db.prepare(auditFailureGuardSql()),
    );
  }

  // D1 batch is one transaction. Audit, changed columns, and each CAS guard commit or roll back together.
  try {
    await db.batch(statements);
  } catch (error) {
    // The audit/CAS guards intentionally fail this constraint when the observed snapshot is stale.
    if (/NOT NULL constraint failed: product_audit_log\.actor_telegram_id/i.test(String(error?.message || ""))) {
      throw new ProductConflictError();
    }
    throw error;
  }
  return getProduct(db, productId);
}
