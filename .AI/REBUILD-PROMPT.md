# Flatmate Portal — AI Rebuild Prompt

> **Purpose**: This file is a self-contained prompt that, combined with the other `.AI/*.md` files in this directory, contains everything needed for an AI to rebuild this exact project from scratch.

---

## Prompt

Build a **Progressive Web App called "Flatmate Portal"** for 6 flatmates to manage shared household tasks. The app must be built with the exact technology stack and architecture described below. Do NOT use any frontend frameworks — use only vanilla HTML, CSS, and JavaScript.

### Technology Stack (Mandatory)

- **Frontend**: Single HTML file + single JS file + single CSS file (no build tools, no npm, no bundler)
- **Backend**: Single Cloudflare Worker file (ES Modules syntax, `export default { fetch, scheduled }`)
- **Database**: Cloudflare D1 (SQLite-compatible), bound as `env.DB`
- **Hosting**: Frontend on GitHub Pages, backend on Cloudflare Workers
- **Push Notifications**: Web Push with VAPID (RFC 8292), payload encryption (RFC 8291 aes128gcm) — implemented from scratch using Web Crypto API, no libraries
- **Authentication**: HMAC-SHA256 signed bearer tokens (stateless, no sessions)
- **PWA**: Service Worker with cache-first strategy + Web App Manifest
- **CI/CD**: GitHub Actions for auto-deploy frontend + daily D1 backup

### Users

Exactly 6 hardcoded users: `Arad` (admin), `Amir`, `Aien`, `Sattar`, `Ali`, `Gokol`

### Features to Implement

1. **Login system**: Dropdown to select name + password field. Passwords stored as Cloudflare Worker secret (JSON object). On success, return HMAC-SHA256 signed token. Store token in `localStorage`.

2. **Task management**:
   - Add items with title (required, max 200 chars client-side via `maxlength` attribute — no server-side cap), category (general/grocery/repair), and urgent flag
   - "I'm on it!" pickup button sets status to `in_progress` with `picked_up_by`
   - Complete button sets status to `completed`, increments leaderboard score
   - Edit button opens modal with pre-filled fields
   - Delete button with `confirm()` dialog
   - Auto-delete completed tasks older than 24 hours (on GET and cron)
   - Broadcast push notification on add/edit

3. **Leaderboard**: Persistent per-user scores in `leaderboard_scores` table. Incremented by 1 on each task completion. Admin can adjust (+/-) or reset all.

4. **Trash schedule**: Weekly day-of-week → user mapping stored in D1 `kv` table. Cron triggers at 8 AM and 7 PM UTC send targeted push to the assigned user. Admin can edit via UI.

5. **Announcements/Broadcasts**: Any authenticated user can send a message (max 200 chars). Stored in `announcements` table. Latest 3 shown. Push notification to all. Admin can delete individual or clear all.

6. **Push notifications**:
   - VAPID JWT generation using ECDSA P-256 (ES256), signed with Web Crypto API
   - Payload encryption: ECDH key exchange + HKDF + AES-128-GCM (RFC 8291 aes128gcm format)
   - Send via POST to subscription endpoint with proper headers
   - Auto-cleanup of expired subscriptions (404/410 responses)
   - Emergency items get `Urgency: high`, triple vibration, `requireInteraction: true`

7. **Admin panel** (visible only to `Arad`):
   - Collapsible section with dark indigo theme
   - Test notification button
   - Trash schedule editor (7 dropdowns, Mon-Sun)
   - Announcement management (per-item delete, clear all)
   - Leaderboard management (per-user +/- buttons)
   - Activity log (last 100 entries)

8. **PWA**:
   - Service worker: cache-first for same-origin shell assets, passthrough for API
   - Cache versioned (e.g., `flatmate-portal-v5`)
   - Manual update approval: don't call `skipWaiting()` on install
   - Show "⬆ Update" button when new SW is waiting
   - Click triggers `SKIP_WAITING` message → page reload
   - Manifest: `display: standalone`, portrait, dark navy bg, indigo theme

9. **Activity logging**: Every write action (`added`, `edited`, `completed`, `deleted`, `picked up`, `broadcast`, `schedule updated`, `leaderboard adjusted`, `leaderboard reset`) logged to `activity_log` table with username, action, detail, timestamp. Admin can view last 100 entries.

10. **Dark mode**: Automatic via `@media (prefers-color-scheme: dark)` — no toggle. Override all CSS variables for dark theme.

11. **Daily D1 backup**: GitHub Actions cron at 2 AM UTC, exports D1 to SQL, pushes to private backup repo.

### Database Schema

Create exactly these 6 tables:

```sql
-- tasks: id, title, category, is_emergency, status, requested_by, completed_by, picked_up_by, completed_at, created_at
-- push_subscriptions: id, username (UNIQUE), subscription_object
-- announcements: id, message, sent_by, created_at
-- kv: key (PK), value
-- leaderboard_scores: username (PK), score
-- activity_log: id, username, action, detail, created_at
```

(See DATABASE.md for full DDL)

### API Endpoints

(See BACKEND-API.md for full specification)

**Public**: `POST /login`, `GET /items`, `GET /announcements`, `GET /admin/schedule`
**Authenticated**: `POST /items`, `PUT /items/:id`, `PATCH /items/:id/pickup`, `PATCH /items/:id/complete`, `DELETE /items/:id`, `POST /announcements`, `POST /subscribe`
**Admin only**: `POST /admin/test-notify`, `POST /admin/send-trash`, `PUT /admin/schedule`, `GET/PUT/DELETE /admin/leaderboard`, `GET /admin/activity-log`, `DELETE /admin/announcements[/:id]`

### UI Design

(See UI-COMPONENTS.md and FRONTEND.md for full specification)

- Indigo primary color (`#4f46e5`)
- Card-based layout, max-width 640px
- Login: centered card on gradient background (#667eea → #764ba2)
- Dashboard: sticky header, vertical card stack, FAB bottom-right
- Modals: dark overlay, centered card, tabs for add modal
- Task items: bordered cards with category tags, action buttons
- Emergency items: red border + pink background
- In-progress items: yellow border + warm background
- Admin panel: dark indigo theme independent of system preference
- Responsive: smaller padding/fonts at <420px

### Worker Configuration (wrangler.toml)

```toml
name = "flatmate-portal-worker"
main = "index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "flatmate-portal-db"
database_id = "<ID>"

[triggers]
crons = ["0 8 * * *", "0 19 * * *"]
```

### Secrets Required

- `VAPID_PUBLIC_KEY` — 65-byte uncompressed EC public key, base64url
- `VAPID_PRIVATE_KEY` — 32-byte EC private scalar, base64url
- `VAPID_SUBJECT` — mailto: URI
- `ADMIN_TOKEN` — random hex string for HMAC signing
- `USER_PASSWORDS` — JSON: `{"Arad":"...","Amir":"...",...}`

### Important Implementation Details

1. Worker uses `ctx.waitUntil()` for non-blocking push notifications and activity logging
2. CORS is fully open (`Access-Control-Allow-Origin: *`)
3. Route matching uses regex (`path.match(/^\/items\/(\d+)$/)`)
4. Admin is hardcoded as `'Arad'` — checked on every admin endpoint
5. `escapeHtml()` uses DOM-based approach (create span, set textContent, read innerHTML)
6. `timeAgo()` returns "just now", "Xm ago", "Xh ago", "Xd ago"
7. Calendar-based datetime comparison: `datetime('now', '-24 hours')` for auto-cleanup
8. Completed tasks auto-deleted on both `GET /items` and cron `scheduled()` handler
9. Push subscription is UPSERT — one per user, new subscription replaces old
10. Task ordering: emergency first, then by creation date descending

### File-by-File Reference

For complete implementation details of each file, refer to:
- **OVERVIEW.md** — Project summary and file structure
- **ARCHITECTURE.md** — System diagram, data flows, communication protocol
- **BACKEND-API.md** — Full API reference, helper functions, Worker export
- **FRONTEND.md** — HTML structure, JS logic, CSS design system
- **DATABASE.md** — Complete schema DDL, table specifications, auto-cleanup logic
- **DEPLOYMENT.md** — CI/CD workflows, deployment steps, local dev setup
- **PWA-AND-PUSH.md** — Service worker, manifest, VAPID, encryption details
- **AUTHENTICATION.md** — Token format, password handling, authorization levels, secrets
- **UI-COMPONENTS.md** — Screen maps, user flows, component hierarchy
