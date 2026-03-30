# Flatmate Portal — Database Schema (Cloudflare D1)

## Overview

The database is **Cloudflare D1** (SQLite-compatible, serverless). It is bound to the Worker as `env.DB` via the `[[d1_databases]]` binding in `wrangler.toml`.

**Database name**: `flatmate-portal-db`

Schema is initialized via `worker/schema.sql` using:
```bash
# Local
npm run db:init
# Remote (production)
npm run db:init:remote
```

The SQL file uses `CREATE TABLE IF NOT EXISTS` for idempotent execution.

---

## Tables

### 1. `tasks`

Stores all household task items (pending, in-progress, and completed).

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  category      TEXT    NOT NULL DEFAULT 'general',
  is_emergency  INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'pending',
  requested_by  TEXT    NOT NULL,
  completed_by  TEXT,
  picked_up_by  TEXT,
  completed_at  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| Column        | Type    | Default           | Description                                          |
|---------------|---------|-------------------|------------------------------------------------------|
| `id`          | INTEGER | AUTO              | Primary key                                          |
| `title`       | TEXT    | —                 | Task description (max 200 chars enforced client-side)|
| `category`    | TEXT    | `'general'`       | One of: `general`, `grocery`, `repair`               |
| `is_emergency`| INTEGER | `0`               | Boolean flag: `0` = normal, `1` = urgent             |
| `status`      | TEXT    | `'pending'`       | One of: `pending`, `in_progress`, `completed`        |
| `requested_by`| TEXT    | —                 | Username who created the task                        |
| `completed_by`| TEXT    | NULL              | Username who completed the task                      |
| `picked_up_by`| TEXT    | NULL              | Username who claimed the task                        |
| `completed_at`| TEXT    | NULL              | ISO datetime when completed                          |
| `created_at`  | TEXT    | `datetime('now')` | ISO datetime when created                            |

**Auto-cleanup**: Completed tasks older than 24 hours are automatically deleted on every `GET /items` request and on every cron run.

**Status transitions**:
```
pending → in_progress → completed
pending → completed (direct completion without pickup)
```

---

### 2. `push_subscriptions`

Stores Web Push subscription objects (one per user).

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  username            TEXT NOT NULL,
  subscription_object TEXT NOT NULL,
  UNIQUE(username)
);
```

| Column               | Type    | Description                                     |
|----------------------|---------|-------------------------------------------------|
| `id`                 | INTEGER | Primary key                                     |
| `username`           | TEXT    | One of the 6 allowed users                      |
| `subscription_object`| TEXT   | Full JSON push subscription (endpoint + keys)   |

**UNIQUE constraint**: Ensures one subscription per user. New subscriptions UPSERT (replace) the old one via `ON CONFLICT(username) DO UPDATE`.

**Cleanup**: Expired subscriptions (HTTP 404/410 from push service) are auto-deleted by `sendPush()`.

---

### 3. `announcements`

Stores broadcast messages.

```sql
CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message    TEXT    NOT NULL,
  sent_by    TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| Column      | Type    | Description                          |
|-------------|---------|--------------------------------------|
| `id`        | INTEGER | Primary key                          |
| `message`   | TEXT    | Announcement text (max 200 chars)    |
| `sent_by`   | TEXT    | Username who sent it                 |
| `created_at`| TEXT    | ISO datetime when created            |

**Query**: Latest 3 announcements returned by `GET /announcements` (`ORDER BY created_at DESC LIMIT 3`).

---

### 4. `kv`

Generic key-value store. Currently used only for the trash schedule.

```sql
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```

| Key               | Value Type         | Description                          |
|-------------------|--------------------|--------------------------------------|
| `trash_schedule`  | JSON string        | `{"0":"Aien","1":"Ali",...}` mapping |

**UPSERT**: `INSERT ... ON CONFLICT(key) DO UPDATE SET value = excluded.value`

---

### 5. `leaderboard_scores`

Persistent per-user task completion scores.

```sql
CREATE TABLE IF NOT EXISTS leaderboard_scores (
  username TEXT PRIMARY KEY,
  score    INTEGER NOT NULL DEFAULT 0
);
```

| Column    | Type    | Description                          |
|-----------|---------|--------------------------------------|
| `username`| TEXT    | Primary key, one of the 6 users      |
| `score`   | INTEGER | Cumulative completion count           |

**Increment on complete**: `INSERT ... ON CONFLICT(username) DO UPDATE SET score = score + 1`
**Admin adjust**: `ON CONFLICT(username) DO UPDATE SET score = MAX(0, score + delta)`
**Admin reset**: `DELETE FROM leaderboard_scores` (removes all rows)

---

### 6. `activity_log`

Audit trail of all portal actions.

```sql
CREATE TABLE IF NOT EXISTS activity_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    NOT NULL,
  action     TEXT    NOT NULL,
  detail     TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

| Column      | Type    | Description                                  |
|-------------|---------|----------------------------------------------|
| `id`        | INTEGER | Primary key                                  |
| `username`  | TEXT    | Who performed the action                     |
| `action`    | TEXT    | Action type: `added`, `completed`, `deleted`, `picked up`, `edited`, `broadcast`, `schedule updated`, `leaderboard adjusted`, `leaderboard reset` |
| `detail`    | TEXT    | Contextual info (task title, message excerpt) |
| `created_at`| TEXT    | ISO datetime                                 |

**Query**: Last 100 entries, `ORDER BY created_at DESC LIMIT 100`.

---

## Schema Notes

1. **No foreign keys** — usernames are validated at the application layer against `ALLOWED_USERS`
2. **No indexes** beyond primary keys — dataset is small enough (6 users) that sequential scans are negligible
3. **Datetime format**: SQLite `datetime('now')` produces `YYYY-MM-DD HH:MM:SS` in UTC
4. **Boolean representation**: SQLite has no native boolean; uses `INTEGER` with `0`/`1`
5. **The schema.sql file is incomplete** — it only contains `tasks` and `push_subscriptions`, and even the `tasks` table is missing two columns (`picked_up_by TEXT` and `completed_at TEXT`) and its status comment says `'pending' or 'completed'` but the Worker also uses `'in_progress'`. The other 4 tables (`announcements`, `kv`, `leaderboard_scores`, `activity_log`) must be added to schema.sql for clean deploys. Use the "Full Complete Schema" section below for production deployments.

## Full Complete Schema (for clean deployment)

```sql
CREATE TABLE IF NOT EXISTS tasks (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL,
  category      TEXT    NOT NULL DEFAULT 'general',
  is_emergency  INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'pending',
  requested_by  TEXT    NOT NULL,
  completed_by  TEXT,
  picked_up_by  TEXT,
  completed_at  TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  username            TEXT NOT NULL,
  subscription_object TEXT NOT NULL,
  UNIQUE(username)
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
```
