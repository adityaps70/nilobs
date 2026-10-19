-- NilObs server wallet and payments (worker/wallet.js, worker/pay.js).
-- The Worker also creates these itself on first use, so running this is optional:
--   npx wrangler d1 migrations apply nilobs --remote
CREATE TABLE IF NOT EXISTS wallets (user_id TEXT PRIMARY KEY, version INTEGER NOT NULL, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, provider TEXT NOT NULL, ref TEXT, product TEXT NOT NULL, currency TEXT NOT NULL, amount INTEGER NOT NULL, status TEXT NOT NULL, payment_ref TEXT, created_at INTEGER NOT NULL, paid_at INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS payments_ref ON payments (provider, ref);
CREATE INDEX IF NOT EXISTS payments_user ON payments (user_id);
-- one-way codes of Google accounts that have had the free starting credits (kept after an account is deleted)
CREATE TABLE IF NOT EXISTS starts (key TEXT PRIMARY KEY, at INTEGER NOT NULL);
