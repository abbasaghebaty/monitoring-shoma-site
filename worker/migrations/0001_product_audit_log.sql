-- Product audit depends on the canonical users/products tables from 0000_baseline.sql.
-- Append-only for ordinary SQL clients; privileged DDL access can still bypass these guards.
CREATE TABLE product_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_telegram_id INTEGER NOT NULL,
  product_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE', 'UPDATE')),
  previous_values TEXT,
  new_values TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  request_id TEXT NOT NULL UNIQUE CHECK (length(trim(request_id)) > 0),
  CHECK (
    (operation = 'CREATE' AND previous_values IS NULL)
    OR
    (operation = 'UPDATE' AND previous_values IS NOT NULL
      AND json_valid(previous_values) AND json_type(previous_values) = 'object')
  ),
  CHECK (json_valid(new_values) AND json_type(new_values) = 'object'),
  FOREIGN KEY (actor_telegram_id) REFERENCES users(telegram_id) ON DELETE RESTRICT,
  FOREIGN KEY (product_id) REFERENCES products(product_id) ON DELETE RESTRICT
);

CREATE INDEX idx_product_audit_product_time
  ON product_audit_log(product_id, created_at DESC, id DESC);
CREATE INDEX idx_product_audit_actor_time
  ON product_audit_log(actor_telegram_id, created_at DESC, id DESC);

CREATE TRIGGER trg_product_audit_prevent_update
BEFORE UPDATE ON product_audit_log
BEGIN
  SELECT RAISE(ABORT, 'product_audit_log is append-only');
END;

CREATE TRIGGER trg_product_audit_prevent_delete
BEFORE DELETE ON product_audit_log
BEGIN
  SELECT RAISE(ABORT, 'product_audit_log is append-only');
END;
