import { parsePagination } from "../validation/common.js";

// All SQL identifiers are selected from this static allowlist; request input is never
// interpolated as a table or column name.
const ENTITIES = Object.freeze({
  categories: {
    type: "category",
    table: "product_categories",
    fields: ["name", "parent_id", "description", "is_active"],
    required: ["name"],
    select: "SELECT c.*, p.name AS parent_name FROM product_categories c LEFT JOIN product_categories p ON p.id=c.parent_id",
    order: "c.name COLLATE NOCASE",
    search: ["c.name", "c.description"],
    count: "SELECT COUNT(*) AS total FROM product_categories c",
  },
  brands: {
    type: "brand",
    table: "product_brands",
    fields: ["name", "description", "is_active"],
    required: ["name"],
    select: "SELECT * FROM product_brands",
    order: "name COLLATE NOCASE",
    search: ["name", "description"],
    count: "SELECT COUNT(*) AS total FROM product_brands",
  },
  warehouses: {
    type: "warehouse",
    table: "warehouses",
    fields: ["name", "code", "address", "manager_name", "status"],
    required: ["name", "code"],
    select: "SELECT * FROM warehouses",
    order: "name COLLATE NOCASE",
    search: ["name", "code", "address"],
    count: "SELECT COUNT(*) AS total FROM warehouses",
  },
  locations: {
    type: "location",
    table: "warehouse_locations",
    fields: ["warehouse_id", "code", "name", "zone", "shelf", "capacity", "status"],
    required: ["warehouse_id", "code", "name"],
    select: "SELECT l.*, w.name AS warehouse_name FROM warehouse_locations l JOIN warehouses w ON w.id=l.warehouse_id",
    order: "w.name COLLATE NOCASE, l.code COLLATE NOCASE",
    search: ["l.code", "l.name", "l.zone", "w.name"],
    count: "SELECT COUNT(*) AS total FROM warehouse_locations l JOIN warehouses w ON w.id=l.warehouse_id",
  },
});

export function getInventoryEntity(key) {
  return ENTITIES[key] || null;
}

function cleanDraft(config, draft, creating) {
  const values = {};
  for (const field of config.fields) {
    if (!Object.hasOwn(draft, field)) continue;
    let value = draft[field];
    if (["is_active", "capacity"].includes(field)) {
      value = value === "" || value == null ? (field === "capacity" ? null : 1) : Number(value);
    } else if (value === "") {
      value = null;
    } else if (typeof value === "string") {
      value = value.trim();
    }
    values[field] = value;
  }
  if (creating) {
    for (const field of config.required) {
      if (!values[field]) throw new Error("REQUIRED_FIELD:" + field);
    }
  }
  return values;
}

async function validateRelations(db, key, values, currentId = null) {
  if (key === "categories" && values.parent_id) {
    let parentId = values.parent_id;
    const visited = new Set([currentId].filter(Boolean));
    while (parentId) {
      if (visited.has(parentId)) throw new Error("CATEGORY_CYCLE");
      visited.add(parentId);
      const parent = await db.prepare(
        "SELECT id, parent_id, is_active FROM product_categories WHERE id=?"
      ).bind(parentId).first();
      if (!parent || Number(parent.is_active) !== 1) throw new Error("RELATED_RECORD_INVALID");
      parentId = parent.parent_id;
    }
  }
  if (key === "locations" && values.warehouse_id) {
    const warehouse = await db.prepare(
      "SELECT id FROM warehouses WHERE id=? AND status='active'"
    ).bind(values.warehouse_id).first();
    if (!warehouse) throw new Error("RELATED_RECORD_INVALID");
  }
}

export async function listInventoryEntity(db, key, url) {
  const config = getInventoryEntity(key);
  if (!config) return null;
  const { limit, offset } = parsePagination(url);
  const search = (url.searchParams.get("q") || "").trim().slice(0, 100);
  const where = search
    ? " WHERE (" + config.search.map((field) => field + " LIKE ?").join(" OR ") + ")"
    : "";
  const params = search ? config.search.map(() => "%" + search + "%") : [];
  const rows = await db.prepare(
    config.select + where + " ORDER BY " + config.order + " LIMIT ? OFFSET ?"
  ).bind(...params, limit, offset).all();
  const total = await db.prepare(config.count + where).bind(...params).first();
  return {
    items: rows.results || [],
    pagination: { limit, offset, total: Number(total?.total || 0) },
  };
}

export async function createInventoryEntity(db, key, draft, actorTelegramId, requestId) {
  const config = getInventoryEntity(key);
  if (!config) return null;
  const values = cleanDraft(config, draft, true);
  await validateRelations(db, key, values);

  const id = crypto.randomUUID();
  const fields = Object.keys(values);
  const insert = db.prepare(
    "INSERT INTO " + config.table + " (id, " + fields.join(", ") + ") VALUES (" +
    ["?", ...fields.map(() => "?")].join(", ") + ")"
  ).bind(id, ...fields.map((field) => values[field]));
  const audit = db.prepare(
    "INSERT INTO inventory_workspace_audit (actor_telegram_id, entity_type, entity_id, operation, previous_values, new_values, request_id) VALUES (?, ?, ?, 'CREATE', NULL, ?, ?)"
  ).bind(Number(actorTelegramId), config.type, id, JSON.stringify(values), requestId);

  await db.batch([insert, audit]);
  const idColumn = key === "categories" ? "c.id" : key === "locations" ? "l.id" : "id";
  return db.prepare(config.select + " WHERE " + idColumn + "=? LIMIT 1").bind(id).first();
}

export async function updateInventoryEntity(db, key, id, draft, actorTelegramId, requestId) {
  const config = getInventoryEntity(key);
  if (!config) return null;
  const current = await db.prepare(
    "SELECT * FROM " + config.table + " WHERE id=?"
  ).bind(id).first();
  if (!current) return null;

  if (!draft.updated_at || draft.updated_at !== current.updated_at) {
    const conflict = new Error("STALE_ENTITY");
    conflict.code = "STALE_ENTITY";
    throw conflict;
  }

  const values = cleanDraft(config, draft, false);
  const previous = {};
  const next = {};
  for (const [field, value] of Object.entries(values)) {
    if (!Object.is(current[field], value)) {
      previous[field] = current[field];
      next[field] = value;
    }
  }
  if (!Object.keys(next).length) throw new Error("NO_CHANGES");

  for (const [field, value] of Object.entries(next)) {
    if ((field === "name" || field === "code") && (!value || typeof value !== "string")) {
      throw new Error("INVALID_FIELD");
    }
    if (field === "capacity" && value != null && (!Number.isInteger(value) || value < 0)) {
      throw new Error("INVALID_FIELD");
    }
    if (field === "is_active" && ![0, 1].includes(value)) throw new Error("INVALID_FIELD");
    if (field === "status") {
      const allowed = key === "warehouses"
        ? ["active", "inactive", "maintenance"]
        : ["active", "inactive"];
      if (!allowed.includes(value)) throw new Error("INVALID_FIELD");
    }
  }
  await validateRelations(db, key, next, id);

  const fields = Object.keys(next);
  // Compare every editable field as well as updated_at. This prevents lost updates
  // even if two writes happen inside the same timestamp millisecond.
  const update = db.prepare(
    "UPDATE " + config.table + " SET " + fields.map((field) => field + "=?").join(", ") +
    ", updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND updated_at=? AND " +
    config.fields.map((field) => field + " IS ?").join(" AND ")
  ).bind(
    ...fields.map((field) => next[field]),
    id,
    current.updated_at,
    ...config.fields.map((field) => current[field])
  );
  const audit = db.prepare(
    "INSERT INTO inventory_workspace_audit (actor_telegram_id, entity_type, entity_id, operation, previous_values, new_values, request_id) " +
    "SELECT CASE WHEN changes()=1 THEN ? ELSE NULL END, ?, ?, 'UPDATE', ?, ?, ?"
  ).bind(
    Number(actorTelegramId), config.type, id,
    JSON.stringify(previous), JSON.stringify(next), requestId
  );

  try {
    await db.batch([update, audit]);
  } catch (error) {
    if (/NOT NULL constraint failed: inventory_workspace_audit\.actor_telegram_id/i.test(String(error?.message || ""))) {
      const conflict = new Error("STALE_ENTITY");
      conflict.code = "STALE_ENTITY";
      throw conflict;
    }
    throw error;
  }
  return db.prepare("SELECT * FROM " + config.table + " WHERE id=?").bind(id).first();
}
