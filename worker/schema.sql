-- Flatmate Portal – Cloudflare D1 Schema
-- Run with: npm run db:init:remote

CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  category      TEXT    NOT NULL DEFAULT 'general',  -- 'grocery', 'repair', 'general'
  is_emergency  INTEGER NOT NULL DEFAULT 0,          -- 0 = false, 1 = true
  status        TEXT    NOT NULL DEFAULT 'pending',  -- 'pending', 'in_progress', 'completed'
  requested_by  TEXT    NOT NULL,
  completed_by  TEXT,
  picked_up_by  TEXT,
  completed_at  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  username            TEXT NOT NULL,
  subscription_object TEXT NOT NULL,                 -- JSON push subscription
  UNIQUE(username)                                   -- one subscription per user
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message    TEXT    NOT NULL,
  sent_by    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_scores (
  username TEXT PRIMARY KEY,
  score    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL,
  action     TEXT    NOT NULL,
  detail     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
