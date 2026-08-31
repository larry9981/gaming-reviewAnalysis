BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  username TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  app_id TEXT,
  status TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_ref TEXT UNIQUE,
  current_period_end BIGINT,
  billing_amount_cents BIGINT,
  cancel_at_period_end BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  app_id TEXT,
  provider TEXT NOT NULL,
  provider_session_id TEXT,
  status TEXT NOT NULL,
  expected_amount_cents BIGINT,
  currency TEXT,
  access_days BIGINT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS game_reports (
  app_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  risk_score INTEGER NOT NULL,
  verdict TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS trending_cache (
  cache_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_settings (
  provider TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS payment_events (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS expected_amount_cents BIGINT;
ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS currency TEXT;
ALTER TABLE checkout_sessions ADD COLUMN IF NOT EXISTS access_days BIGINT;
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS billing_amount_cents BIGINT;
ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS cancel_at_period_end BIGINT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS entitlements_user_idx ON entitlements (user_id);
CREATE INDEX IF NOT EXISTS checkout_user_idx ON checkout_sessions (user_id);
CREATE INDEX IF NOT EXISTS checkout_provider_idx ON checkout_sessions (provider_session_id);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS entitlements_provider_ref_idx ON entitlements (provider_ref);
CREATE UNIQUE INDEX IF NOT EXISTS payment_events_provider_idx ON payment_events (provider, provider_event_id, event_type, status);

COMMIT;
