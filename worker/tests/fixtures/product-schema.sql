PRAGMA foreign_keys = ON;

-- Isolated baseline fixture based on the confirmed product/user D1 schema contract.
CREATE TABLE users (
  telegram_id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL,
  username TEXT,
  role TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE products (
  product_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'عدد',
  package_quantity INTEGER,
  weight REAL,
  weight_unit TEXT,
  description TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE product_prices (
  product_id TEXT PRIMARY KEY REFERENCES products(product_id),
  purchase_price INTEGER NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  sell_price INTEGER NOT NULL DEFAULT 0 CHECK (sell_price >= 0),
  consumer_price INTEGER NOT NULL DEFAULT 0 CHECK (consumer_price >= 0),
  market_price INTEGER NOT NULL DEFAULT 0 CHECK (market_price >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE inventory (
  product_id TEXT PRIMARY KEY REFERENCES products(product_id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TRIGGER trg_product_initialize
AFTER INSERT ON products
BEGIN
  INSERT INTO inventory (product_id, quantity) VALUES (NEW.product_id, 0);
  INSERT INTO product_prices (product_id) VALUES (NEW.product_id);
END;
CREATE TRIGGER trg_prices_updated_at
AFTER UPDATE ON product_prices
BEGIN
  UPDATE product_prices SET updated_at = datetime('now') WHERE product_id = NEW.product_id;
END;
