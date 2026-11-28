-- Additive integrity and authentication primitives.
-- The partial unique index intentionally fails if legacy duplicate open shifts exist;
-- inspect them before applying this migration. No attendance rows are rewritten.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_one_open_per_user
  ON attendance(telegram_id)
  WHERE check_out IS NULL;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_rate_limits_updated
  ON auth_rate_limits(updated_at);

CREATE TABLE IF NOT EXISTS auth_otp_challenges (
  telegram_id INTEGER PRIMARY KEY REFERENCES users(telegram_id) ON DELETE RESTRICT,
  otp_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_auth_otp_expiry
  ON auth_otp_challenges(expires_at);
