# Flatmate Portal — Backend API (Cloudflare Worker)

## Overview

The backend is a single Cloudflare Worker file (`worker/index.js`) using **ES Modules syntax**. It handles all API routing, authentication, database operations, push notification encryption/delivery, and cron-triggered trash reminders.

**Runtime**: Cloudflare Workers (V8 isolate, not Node.js)
**Module format**: ES Modules (`export default { fetch, scheduled }`)
**Database binding**: `env.DB` (Cloudflare D1)
**No external dependencies** — uses only Web Crypto API and Fetch API

## Configuration

### wrangler.toml

```toml
name = "flatmate-portal-worker"
main = "index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "flatmate-portal-db"
database_id = "<YOUR_D1_DATABASE_ID>"

[triggers]
crons = ["0 8 * * *", "0 19 * * *"]   # 9/10 AM & 8/9 PM Rome (CET+1 / CEST+2)
```

### Environment Secrets (set via `wrangler secret put`)

| Secret             | Description                                              | Example                                    |
|--------------------|----------------------------------------------------------|--------------------------------------------|
| `VAPID_PUBLIC_KEY` | Base64url-encoded 65-byte uncompressed ECDSA public key  | `BDbtLlG3bt...`                            |
| `VAPID_PRIVATE_KEY`| Base64url-encoded 32-byte private key scalar             | `abc123...`                                |
| `VAPID_SUBJECT`    | Contact URI for VAPID identification                     | `mailto:you@example.com`                   |
| `ADMIN_TOKEN`      | Secret key for HMAC-SHA256 token signing                 | `openssl rand -hex 24` output              |
| `USER_PASSWORDS`   | JSON object mapping username → password                  | `{"Arad":"p1","Amir":"p2",...}`            |

### Hardcoded Constants

```javascript
const ALLOWED_USERS = ['Arad', 'Amir', 'Aien', 'Sattar', 'Ali', 'Gokol'];

const TRASH_SCHEDULE = {
  0: 'Aien',    // Sunday
  1: 'Ali',     // Monday
  2: null,      // Tuesday — no collection
  3: 'Amir',    // Wednesday
  4: 'Gokol',   // Thursday
  5: 'Sattar',  // Friday
  6: 'Arad',    // Saturday
};
```

The trash schedule fallback is used only if the D1 `kv` table has no `trash_schedule` entry.

---

## API Endpoints

### Public Endpoints (No auth required)

#### `POST /login`

Authenticates a user and returns a signed token.

**Request Body:**
```json
{ "username": "Arad", "password": "secret123" }
```

**Response (200):**
```json
{ "success": true, "username": "Arad", "token": "Arad.<hmac-signature>", "isAdmin": true }
```

**Response (401):**
```json
{ "error": "Invalid credentials" }
```

**Logic:**
1. Parse `USER_PASSWORDS` secret (JSON string)
2. Compare `passwords[username] === password` (exact string match)
3. Generate token = `username` + `.` + base64url(HMAC-SHA256(username, ADMIN_TOKEN))
4. Return token + `isAdmin` flag (true only for `"Arad"`)

---

#### `GET /items`

Returns all tasks and leaderboard scores. Also auto-deletes completed tasks older than 24 hours.

**Response:**
```json
{
  "pending": [
    {
      "id": 1,
      "title": "Buy milk",
      "category": "grocery",
      "is_emergency": 0,
      "status": "pending",
      "requested_by": "Amir",
      "completed_by": null,
      "picked_up_by": null,
      "created_at": "2025-03-30 12:00:00"
    }
  ],
  "completed": [...],
  "leaderboard": { "Arad": 5, "Amir": 3, "Aien": 2, "Sattar": 1, "Ali": 0, "Gokol": 4 }
}
```

**Logic:**
1. `DELETE FROM tasks WHERE status = 'completed' AND completed_at < datetime('now', '-24 hours')`
2. SELECT pending/in_progress tasks ordered by `is_emergency DESC, created_at DESC`
3. SELECT completed tasks ordered by `created_at DESC`
4. SELECT all scores from `leaderboard_scores`, initialize missing users to 0

---

#### `GET /announcements`

Returns the latest 3 announcements.

**Response:**
```json
{
  "announcements": [
    { "id": 1, "message": "House meeting tomorrow", "sent_by": "Arad", "created_at": "..." }
  ]
}
```

---

#### `GET /admin/schedule`

Returns the current trash schedule (readable by all, editable by admin only).

**Response:**
```json
{
  "schedule": { "0": "Aien", "1": "Ali", "2": null, "3": "Amir", "4": "Gokol", "5": "Sattar", "6": "Arad" }
}
```

---

### Authenticated Endpoints (Bearer token required)

All write operations require `Authorization: Bearer <token>` header. Token is verified via `getUserFromRequest()` → `verifyToken()`.

#### `POST /items`

Add a new task item. Broadcasts push notification to all subscribers.

**Request Body:**
```json
{ "title": "Buy milk", "category": "grocery", "is_emergency": false, "username": "Amir" }
```

> **Note**: The `username` field in the body is sent by the frontend but **ignored by the server**. The server extracts the username from the `Authorization` Bearer token via `getUserFromRequest()`. The `requested_by` column is populated from the token, not the body.

**Validation:**
- `title` required, used as-is
- `category` must be one of: `grocery`, `repair`, `general` (defaults to `general`)
- `is_emergency` stored as integer `0` or `1`

**Side effects:**
- `broadcastPush()` with title "📋 New Item Added" (or "🚨" if emergency)
- `logActivity()` recording the add action

---

#### `PUT /items/:id`

Edit an existing item. Partial updates supported.

**Request Body (all optional):**
```json
{ "title": "Updated title", "category": "repair", "is_emergency": true }
```

**Side effects:**
- `broadcastPush()` with "✏️ Item Updated"
- `logActivity()`

---

#### `PATCH /items/:id/pickup`

Claim a pending item ("I'm on it!"). Sets `status = 'in_progress'` and `picked_up_by = username`.

**Condition:** Only works if current status is `'pending'`.

**Side effects:** `logActivity()` recording the pickup action

---

#### `PATCH /items/:id/complete`

Mark item as completed.

**Side effects:**
- Sets `completed_by`, `completed_at = datetime('now')`
- Increments user's score in `leaderboard_scores` (UPSERT with `score + 1`)
- `logActivity()`

---

#### `DELETE /items/:id`

Delete any item (pending or completed).

**Side effects:** `logActivity()`

---

#### `POST /announcements`

Send a broadcast announcement.

**Request Body:**
```json
{ "message": "House meeting at 6pm" }
```

**Validation:** Message trimmed and capped at 200 characters.

**Side effects:**
- `broadcastPush()` with title "📢 <username>"
- `logActivity()`

---

#### `POST /subscribe`

Save or update a user's Web Push subscription.

**Request Body:**
```json
{
  "username": "Amir",
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": { "p256dh": "...", "auth": "..." }
  }
}
```

> **Note**: The `username` field in the body is sent by the frontend but **ignored by the server**. The server extracts the username from the `Authorization` Bearer token via `getUserFromRequest()`, same as `POST /items`.

**Storage:** UPSERT into `push_subscriptions` — one subscription per user (`UNIQUE(username)`).

---

### Admin-Only Endpoints (user must be "Arad")

All admin endpoints check `if (user !== 'Arad') return 401`.

#### `POST /admin/test-notify`
Broadcasts a test push notification to all subscribers.

#### `POST /admin/send-trash`
Manually sends a trash reminder push to a specific user.
**Body:** `{ "username": "Ali" }`

#### `PUT /admin/schedule`
Updates the trash schedule.
**Body:** `{ "schedule": { "0": "Aien", "1": "Ali", ... } }`
**Storage:** UPSERT into `kv` table with key `'trash_schedule'`.

**Side effects:**
- `logActivity()` with action `'schedule updated'`

#### `GET /admin/leaderboard`
Returns all leaderboard scores (admin view).

#### `PUT /admin/leaderboard`
Adjust a user's score.
**Body:** `{ "username": "Ali", "delta": 1 }` (or negative to subtract)
**Constraint:** Score cannot go below 0 (`MAX(0, score + delta)`).

**Side effects:**
- `logActivity()` with action `'leaderboard adjusted'`

#### `DELETE /admin/leaderboard`
Reset all scores to zero (deletes all rows from `leaderboard_scores`).

**Side effects:**
- `logActivity()` with action `'leaderboard reset'`

#### `GET /admin/activity-log`
Returns last 100 activity entries ordered by most recent.

#### `DELETE /admin/announcements/:id`
Delete a specific announcement.

#### `DELETE /admin/announcements`
Clear all announcements.

---

## Internal Helper Functions

### CORS

```javascript
function corsHeaders() → { 'Access-Control-Allow-Origin': '*', ... }
function handleOptions() → Response(null, 204)  // preflight
function json(data, status) → Response(JSON.stringify(data))
```

All responses include CORS headers. `OPTIONS` requests return `204 No Content`.

### Base64-URL Encoding

```javascript
function toB64Url(buf)   // ArrayBuffer/Uint8Array → base64url string
function fromB64Url(str) // base64url string → Uint8Array
```

### Token Management

```javascript
async function createToken(username, env)       // → "username.base64url-hmac"
async function verifyToken(token, env)          // → username or null
async function getUserFromRequest(request, env) // extracts Bearer token, verifies
```

### Push Notification

```javascript
async function createVapidJwt(endpoint, env)                    // ES256 JWT for VAPID
async function encryptPayload(plaintextStr, p256dhB64, authB64) // RFC 8291 aes128gcm
async function sendPush(subscriptionJSON, payload, env)         // encrypt + POST to endpoint
async function broadcastPush(db, payload, env)                  // push to ALL subscribers
async function targetedPush(db, username, payload, env)         // push to ONE user
```

### Activity & Schedule

```javascript
async function logActivity(db, username, action, detail)  // INSERT into activity_log
async function getSchedule(db)                            // read from kv, fallback to const
```

---

## Worker Export

```javascript
export default {
  async fetch(request, env, ctx) {
    // Routes all HTTP requests via handleRequest()
    // Catches and returns 500 on any unhandled error
  },

  async scheduled(event, env, ctx) {
    // Cron handler:
    // 1. Auto-delete completed tasks > 24h
    // 2. Read trash schedule
    // 3. Send targeted push to today's assigned user
  },
};
```

---

## Error Handling

- All endpoints wrapped in try/catch at the top level (returns `500 Internal Server Error`)
- Auth failures return `401 Unauthorized`
- Validation failures return `400 Bad Request` with descriptive error
- Unknown routes return `404 Not Found`
- Expired/invalid push subscriptions (404/410 from push service) are auto-deleted from DB
- `ctx.waitUntil()` used for non-blocking side effects (push notifications, activity logging)
