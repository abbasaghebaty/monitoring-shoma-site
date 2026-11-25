-- Additive inventory workspace master-data schema. No existing records are rewritten.
ALTER TABLE products ADD COLUMN barcode TEXT;
ALTER TABLE products ADD COLUMN category_id TEXT REFERENCES product_categories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN brand_id TEXT REFERENCES product_brands(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0);
ALTER TABLE products ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));
CREATE TABLE product_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100), parent_id TEXT REFERENCES product_categories(id) ON DELETE RESTRICT, description TEXT, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')), CHECK(parent_id IS NULL OR parent_id<>id));
CREATE UNIQUE INDEX idx_product_categories_name_active ON product_categories(name COLLATE NOCASE) WHERE is_active=1;
CREATE INDEX idx_product_categories_parent ON product_categories(parent_id);
CREATE TABLE product_brands (id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100), description TEXT, is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)), created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')));
CREATE UNIQUE INDEX idx_product_brands_name_active ON product_brands(name COLLATE NOCASE) WHERE is_active=1;
CREATE TABLE warehouses (id TEXT PRIMARY KEY, name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 120), code TEXT NOT NULL UNIQUE CHECK(length(trim(code)) BETWEEN 1 AND 40), address TEXT, manager_name TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','maintenance')), created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')));
CREATE TABLE warehouse_locations (id TEXT PRIMARY KEY, warehouse_id TEXT NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT, code TEXT NOT NULL CHECK(length(trim(code)) BETWEEN 1 AND 40), name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100), zone TEXT, shelf TEXT, capacity INTEGER CHECK(capacity IS NULL OR capacity>=0), status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')), created_at TEXT NOT NULL DEFAULT(datetime('now')), updated_at TEXT NOT NULL DEFAULT(datetime('now')), UNIQUE(warehouse_id,code));
CREATE INDEX idx_warehouse_locations_warehouse ON warehouse_locations(warehouse_id,status);
CREATE TABLE inventory_workspace_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_telegram_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT, entity_type TEXT NOT NULL CHECK(entity_type IN ('category','brand','warehouse','location')), entity_id TEXT NOT NULL, operation TEXT NOT NULL CHECK(operation IN ('CREATE','UPDATE')), previous_values TEXT, new_values TEXT NOT NULL CHECK(json_valid(new_values) AND json_type(new_values)='object'), created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')), request_id TEXT NOT NULL UNIQUE CHECK(length(trim(request_id))>0), CHECK((operation='CREATE' AND previous_values IS NULL) OR (operation='UPDATE' AND previous_values IS NOT NULL AND json_valid(previous_values) AND json_type(previous_values)='object')));
CREATE INDEX idx_inventory_workspace_audit_entity ON inventory_workspace_audit(entity_type,entity_id,created_at DESC);
CREATE INDEX idx_inventory_workspace_audit_actor ON inventory_workspace_audit(actor_telegram_id,created_at DESC);
CREATE TRIGGER trg_inventory_workspace_audit_no_update
BEFORE UPDATE ON inventory_workspace_audit
BEGIN
  SELECT RAISE(ABORT,'inventory_workspace_audit is append-only');
END;
CREATE TRIGGER trg_inventory_workspace_audit_no_delete
BEFORE DELETE ON inventory_workspace_audit
BEGIN
  SELECT RAISE(ABORT,'inventory_workspace_audit is append-only');
END;
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_brand ON products(brand_id);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE UNIQUE INDEX idx_products_barcode_unique ON products(lower(trim(barcode))) WHERE barcode IS NOT NULL AND trim(barcode)<>'';
