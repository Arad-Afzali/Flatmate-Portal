# Flatmate Portal — Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                         │
│                                                                 │
│  ┌─────────────┐  ┌───────────┐  ┌──────────────────────────┐  │
│  │ index.html   │  │ style.css │  │ app.js                   │  │
│  │ (App Shell)  │  │ (Styles)  │  │ (All client logic)       │  │
│  └─────────────┘  └───────────┘  └──────────────────────────┘  │
│                                                                 │
│  ┌──────────────────┐  ┌─────────────────────────────────────┐  │
│  │ service-worker.js │  │ manifest.json (PWA installability) │  │
│  │ (Caching + Push)  │  └─────────────────────────────────────┘  │
│  └──────────────────┘                                           │
│                                                                 │
│  Hosted on: GitHub Pages (static files)                         │
│  URL: https://<user>.github.io/Flatmate-Portal/                 │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │  HTTPS / JSON (REST API)
                         │  Authorization: Bearer <username>.<hmac>
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                  CLOUDFLARE WORKER (Serverless)                  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ index.js (single file)                                   │    │
│  │                                                         │    │
│  │  • Request Router (path + method matching)              │    │
│  │  • CORS middleware (Access-Control-Allow-Origin: *)      │    │
│  │  • Auth middleware (HMAC-SHA256 token verification)      │    │
│  │  • CRUD endpoints for tasks, announcements              │    │
│  │  • Admin endpoints (schedule, leaderboard, activity)    │    │
│  │  • Push subscription management                         │    │
│  │  • Web Push encryption (RFC 8291 aes128gcm)             │    │
│  │  • VAPID JWT generation (ES256)                         │    │
│  │  • Cron handler (trash reminders)                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│  Bindings:                                                      │
│  ├── DB (D1 Database)                                           │
│  └── Secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,              │
│               VAPID_SUBJECT, ADMIN_TOKEN, USER_PASSWORDS        │
│                                                                 │
│  Cron Triggers: 0 8 * * * and 0 19 * * * (UTC)                 │
│  = 9/10 AM and 8/9 PM Rome time (CET+1 / CEST+2)              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         │  SQL (via D1 binding)
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    CLOUDFLARE D1 (SQLite)                        │
│                                                                 │
│  Tables:                                                        │
│  ├── tasks              (pending/in_progress/completed items)   │
│  ├── push_subscriptions (Web Push subscription per user)        │
│  ├── announcements      (broadcast messages)                    │
│  ├── kv                 (key-value store for trash schedule)    │
│  ├── leaderboard_scores (persistent per-user scores)            │
│  └── activity_log       (audit trail, last 100 entries)         │
│                                                                 │
│  Database name: flatmate-portal-db                              │
└─────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Authentication Flow

```
Browser                          Worker                        D1
  │                                │                            │
  │  POST /login                   │                            │
  │  {username, password}          │                            │
  │ ─────────────────────────────► │                            │
  │                                │  Compare password against  │
  │                                │  USER_PASSWORDS secret     │
  │                                │                            │
  │                                │  createToken(username)     │
  │                                │  = username + "." +        │
  │                                │    HMAC-SHA256(username,   │
  │                                │    ADMIN_TOKEN)            │
  │                                │                            │
  │  {success, token, isAdmin}     │                            │
  │ ◄───────────────────────────── │                            │
  │                                │                            │
  │  Stored in localStorage:       │                            │
  │  flatmate_username, flatmate_token                          │
```

### 2. Task Lifecycle

```
1. User adds item  →  POST /items  →  INSERT into tasks (status='pending')
                                     →  broadcastPush() to all subscribers

2. User claims item →  PATCH /items/:id/pickup  →  UPDATE status='in_progress', picked_up_by=user

3. User completes  →  PATCH /items/:id/complete  →  UPDATE status='completed', completed_by=user
                                                   →  INCREMENT leaderboard_scores

4. Auto-cleanup    →  On every GET /items and cron  →  DELETE completed tasks older than 24h
```

### 3. Push Notification Flow

```
Browser                          Worker                     Push Service
  │                                │                            │
  │  POST /subscribe               │                            │
  │  {subscription}                │                            │
  │ ─────────────────────────────► │                            │
  │                                │  UPSERT push_subscriptions │
  │                                │                            │
  │  (later, on event trigger)     │                            │
  │                                │  createVapidJwt()          │
  │                                │  encryptPayload()          │
  │                                │  POST to sub.endpoint      │
  │                                │ ──────────────────────────►│
  │                                │                            │
  │  (push event in SW)            │                            │
  │ ◄──────────────────────────────────────────────────────────│
  │  showNotification()            │                            │
```

### 4. Cron Trigger (Trash Reminder)

```
Cloudflare Cron (0 8 * * *, 0 19 * * *)
  │
  ▼
Worker scheduled() handler
  │
  ├── Auto-delete completed tasks > 24h
  ├── Read trash schedule from D1 kv table
  ├── Get today's day-of-week (0-6)
  ├── Look up assigned user for today
  └── targetedPush() to that user only
```

## Communication Protocol

- **Transport**: HTTPS only
- **Data Format**: JSON request/response bodies
- **Auth Header**: `Authorization: Bearer <username>.<hmac-signature>`
- **CORS**: Fully open (`Access-Control-Allow-Origin: *`) since frontend is on a different domain
- **Push Encryption**: RFC 8291 aes128gcm with ephemeral ECDH keys

## Key Architectural Patterns

1. **Single-file backend** — entire API in one `index.js` using manual path matching (no router library)
2. **Single-file frontend logic** — all UI behavior in one `app.js` with vanilla DOM manipulation
3. **No build step** — neither frontend nor backend requires compilation/bundling
4. **Stateless tokens** — HMAC-signed, no server-side session storage
5. **Event-driven push** — notifications triggered by data mutations (add, edit, broadcast)
6. **Cache-first PWA** — service worker pre-caches shell assets, passthrough (no caching) for cross-origin API calls
7. **Auto-cleanup** — completed tasks are automatically deleted after 24 hours
