import { parsePagination } from "../validation/common.js";

const PRODUCT_SELECT = [
  "SELECT p.product_id, p.name, p.unit, p.package_quantity, p.weight, p.weight_unit,",
  "p.description, p.created_at,",
  "COALESCE(pp.purchase_price,0) AS purchase_price, COALESCE(pp.sell_price,0) AS sell_price,",
  "COALESCE(pp.consumer_price,0) AS consumer_price, COALESCE(pp.market_price,0) AS market_price,",
  "COALESCE(i.quantity,0) AS quantity, pp.updated_at AS price_updated_at, i.updated_at AS inventory_updated_at",
  "FROM products p LEFT JOIN product_prices pp ON pp.product_id=p.product_id",
  "LEFT JOIN inventory i ON i.product_id=p.product_id",
].join(" ");

export async function listProducts(db, url) {
  const { limit, offset } = parsePagination(url);
  const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const stock = url.searchParams.get("stock");
  const clauses = [];
  const params = [];
  if (search) {
    clauses.push("(p.name LIKE ? OR p.product_id LIKE ?)");
    params.push("%" + search + "%", "%" + search + "%");
  }
  if (stock === "in_stock") clauses.push("COALESCE(i.quantity,0) > 0");
  if (stock === "out_of_stock") clauses.push("COALESCE(i.quantity,0) = 0");
  const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
  const { results = [] } = await db.prepare(
    PRODUCT_SELECT + " " + where + " ORDER BY p.name COLLATE NOCASE LIMIT ? OFFSET ?"
  ).bind(...params, limit, offset).all();
  const total = await db.prepare(
    "SELECT COUNT(*) AS total FROM products p LEFT JOIN inventory i ON i.product_id=p.product_id " + where
  ).bind(...params).first();
  return { items: results, pagination: { limit, offset, total: Number(total?.total || 0) } };
}

export async function getProduct(db, productId) {
  return db.prepare(PRODUCT_SELECT + " WHERE p.product_id=? LIMIT 1").bind(productId).first();
}

export async function createProduct(db, draft) {
  const productId = String(draft.product_id).trim();
  const statements = [
    db.prepare("INSERT INTO products (product_id, name, unit, package_quantity, weight, weight_unit, description) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(
        productId,
        String(draft.name).trim(),
        String(draft.unit || "عدد").trim(),
        draft.package_quantity === "" || draft.package_quantity == null ? null : Number(draft.package_quantity),
        draft.weight === "" || draft.weight == null ? null : Number(draft.weight),
        draft.weight_unit ? String(draft.weight_unit).trim() : null,
        draft.description ? String(draft.description).trim() : null,
      ),
    // trg_product_initialize creates the price row; update it in the same D1 batch.
    db.prepare("UPDATE product_prices SET purchase_price=?, sell_price=?, consumer_price=?, market_price=? WHERE product_id=?")
      .bind(
        Number(draft.purchase_price ?? 0),
        Number(draft.sell_price ?? 0),
        Number(draft.consumer_price ?? 0),
        Number(draft.market_price ?? 0),
        productId,
      ),
  ];
  await db.batch(statements);
  return getProduct(db, productId);
}

export async function updateProduct(db, productId, draft) {
  const current = await getProduct(db, productId);
  if (!current) return null;
  const productFields = ["name", "unit", "package_quantity", "weight", "weight_unit", "description"];
  const assignments = [];
  const values = [];
  for (const field of productFields) {
    if (!Object.prototype.hasOwnProperty.call(draft, field)) continue;
    assignments.push(field + "=?");
    const value = draft[field];
    values.push(
      (field === "package_quantity" || field === "weight") && (value === "" || value == null)
        ? null
        : ["name", "unit", "weight_unit", "description"].includes(field)
          ? (value == null || value === "" ? null : String(value).trim())
          : Number(value),
    );
  }
  const priceFields = ["purchase_price", "sell_price", "consumer_price", "market_price"];
  const hasPrices = priceFields.some((field) => Object.prototype.hasOwnProperty.call(draft, field));
  const statements = [];
  if (assignments.length) {
    statements.push(db.prepare("UPDATE products SET " + assignments.join(", ") + " WHERE product_id=?").bind(...values, productId));
  }
  if (hasPrices) {
    statements.push(db.prepare("UPDATE product_prices SET purchase_price=?, sell_price=?, consumer_price=?, market_price=? WHERE product_id=?")
      .bind(
        Number(draft.purchase_price ?? current.purchase_price),
        Number(draft.sell_price ?? current.sell_price),
        Number(draft.consumer_price ?? current.consumer_price),
        Number(draft.market_price ?? current.market_price),
        productId,
      ));
  }
  if (statements.length) await db.batch(statements);
  return getProduct(db, productId);
}
