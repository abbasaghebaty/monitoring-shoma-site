-- Canonical baseline for a fresh shop-manager database.
-- Idempotent CREATE statements also permit a verified pre-existing schema to be adopted
-- without dropping or rewriting its tables or rows. Existing table definitions are NOT altered.
-- Run schema preflight before applying this migration to any pre-existing database.

CREATE TABLE IF NOT EXISTS users (
  telegram_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'employee')),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'عدد',
  package_quantity INTEGER,
  weight REAL,
  weight_unit TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_prices (
  product_id TEXT PRIMARY KEY REFERENCES products(product_id) ON DELETE RESTRICT,
  purchase_price INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  sell_price INTEGER NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  consumer_price INTEGER NOT NULL DEFAULT 0 CHECK (consumer_price >= 0),
  market_price INTEGER NOT NULL DEFAULT 0 CHECK (market_price >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  product_id TEXT PRIMARY KEY REFERENCES products(product_id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id TEXT NOT NULL REFERENCES products(product_id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  sale_date TEXT NOT NULL,
  sale_time TEXT NOT NULL,
  sale_channel TEXT NOT NULL,
  purchase_price INTEGER NOT NULL,
  sell_price INTEGER NOT NULL,
  consumer_price INTEGER NOT NULL,
  amount_paid INTEGER NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_method TEXT NOT NULL,
  total_amount INTEGER GENERATED ALWAYS AS (quantity * sell_price) STORED,
  balance_amount INTEGER GENERATED ALWAYS AS (quantity * sell_price - amount_paid) STORED,
  discount_amount INTEGER GENERATED ALWAYS AS (MAX(consumer_price - sell_price, 0) * quantity) STORED,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  customer_name TEXT
);

CREATE TABLE IF NOT EXISTS debts (
  sale_id INTEGER PRIMARY KEY REFERENCES sales(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL REFERENCES users(telegram_id) ON DELETE RESTRICT,
  check_in TEXT NOT NULL,
  check_out TEXT,
  duration_minutes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_attendance_open
  ON attendance(telegram_id, check_in DESC) WHERE check_out IS NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_user
  ON attendance(telegram_id, check_in DESC);
CREATE INDEX IF NOT EXISTS idx_sales_date_time
  ON sales(sale_date DESC, sale_time DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_sales_channel_date
  ON sales(sale_channel, sale_date DESC);
CREATE INDEX IF NOT EXISTS idx_sales_product
  ON sales(product_id);
CREATE INDEX IF NOT EXISTS idx_debts_status_created
  ON debts(status, created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_product_initialize
AFTER INSERT ON products
BEGIN
  INSERT INTO inventory (product_id, quantity) VALUES (NEW.product_id, 0);
  INSERT INTO product_prices (product_id) VALUES (NEW.product_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_inventory_updated_at
AFTER UPDATE OF quantity ON inventory
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE inventory SET updated_at = datetime('now') WHERE product_id = NEW.product_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_prices_updated_at
AFTER UPDATE OF purchase_price, sell_price, consumer_price, market_price ON product_prices
WHEN NEW.updated_at = OLD.updated_at
BEGIN
  UPDATE product_prices SET updated_at = datetime('now') WHERE product_id = NEW.product_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_check_stock
BEFORE INSERT ON sales
BEGIN
  SELECT RAISE(ABORT, 'INSUFFICIENT_STOCK')
  WHERE COALESCE((SELECT quantity FROM inventory WHERE product_id = NEW.product_id), 0) < NEW.quantity;
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_update_stock
AFTER INSERT ON sales
BEGIN
  UPDATE inventory
  SET quantity = quantity - NEW.quantity
  WHERE product_id = NEW.product_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_create_debt
AFTER INSERT ON sales
WHEN NEW.balance_amount > 0
BEGIN
  INSERT INTO debts (sale_id, amount) VALUES (NEW.id, NEW.balance_amount);
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_prevent_update
BEFORE UPDATE ON sales
BEGIN
  SELECT RAISE(ABORT, 'sales records are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_prevent_delete
BEFORE DELETE ON sales
BEGIN
  SELECT RAISE(ABORT, 'sales records are immutable');
END;
