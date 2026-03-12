-- Flatmate Portal – Cloudflare D1 Schema
-- Run with: wrangler d1 execute flatmate-portal-db --file=./schema.sql

CREATE TABLE IF NOT EXISTS tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  category    TEXT    NOT NULL DEFAULT 'general',   -- 'grocery', 'repair', 'general'
  is_emergency INTEGER NOT NULL DEFAULT 0,           -- 0 = false, 1 = true
  status      TEXT    NOT NULL DEFAULT 'pending',    -- 'pending' or 'completed'
  requested_by TEXT   NOT NULL,                      -- one of the 6 allowed users
  completed_by TEXT,                                  -- who completed it (nullable)
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  username            TEXT NOT NULL,                  -- one of the 6 allowed users
  subscription_object TEXT NOT NULL,                  -- JSON push subscription
  UNIQUE(username)                                    -- one subscription per user
);
