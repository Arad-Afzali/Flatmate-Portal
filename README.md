# Flatmate Portal

A PWA for 6 flatmates to manage shared tasks, with push notifications, a trash-day reminder, a persistent leaderboard, and an admin panel — hosted on **GitHub Pages** (frontend) + **Cloudflare Workers / D1** (backend).

---

## Features

- **Task management** — add, edit, pick up, and complete shared tasks with push notifications to all flatmates
- **Categories** — General, Cleaning, Groceries, Maintenance, Emergency
- **Leaderboard** — persistent points scored by completing tasks; admin can adjust or reset scores
- **Trash schedule** — weekly trash-day reminder with push notifications (cron-based); only assigned days are shown
- **Announcements** — admin can broadcast messages to all flatmates with push notifications
- **Activity log** — admin can view the last 100 actions across the portal
- **PWA** — installable on iOS and Android; update button appears automatically when a new version is available
- **Authentication** — per-user passwords verified server-side; HMAC-SHA256 signed tokens for all write operations

---

## Architecture

```
┌──────────────┐       HTTPS / JSON        ┌──────────────────────┐
│  GitHub Pages │ ◄──────────────────────► │  Cloudflare Worker    │
│  (PWA)        │   Bearer token on writes  │  REST API + Push      │
└──────────────┘                           └──────────┬───────────┘
                                                       │ SQL
                                                ┌──────▼──────┐
                                                │ Cloudflare D1│
                                                │   (SQLite)   │
                                                └──────────────┘
```

### D1 Tables

| Table | Purpose |
|-------|---------|
| `tasks` | Pending and completed task items |
| `push_subscriptions` | Web Push subscriptions per user |
| `announcements` | Broadcast messages |
| `kv` | Generic key-value store (e.g. trash schedule) |
| `leaderboard_scores` | Persistent per-user completion scores |
| `activity_log` | Audit trail of the last 100 portal actions |

---

## Prerequisites

| Tool | Install |
|------|---------|
| **Node.js** ≥ 18 | https://nodejs.org |
| **Wrangler CLI** | `npm i -g wrangler` |
| **Cloudflare account** | https://dash.cloudflare.com/sign-up |
| **GitHub account** | for GitHub Pages |

---

## Step 1 — Generate VAPID Keys

Web Push requires a VAPID key pair. Generate one:

```bash
npx web-push generate-vapid-keys
```

Save the output — you will need:
- **Public Key** (base64url, ~88 chars) → Worker secret **and** `frontend/app.js`
- **Private Key** (base64url, ~44 chars) → Worker secret only

---

## Step 2 — Deploy the Cloudflare Worker

### 2a. Authenticate

```bash
wrangler login
```

### 2b. Create the D1 database

```bash
wrangler d1 create flatmate-portal-db
```

Copy the **database_id** from the output and paste it into `worker/wrangler.toml`:

```toml
database_id = "<YOUR_D1_DATABASE_ID>"
```

### 2c. Initialise the schema

```bash
cd worker
npm install

# Local dev
npm run db:init

# Remote (production)
npm run db:init:remote
```

### 2d. Set secrets

```bash
wrangler secret put VAPID_PUBLIC_KEY   # paste your VAPID public key
wrangler secret put VAPID_PRIVATE_KEY  # paste your VAPID private key
wrangler secret put VAPID_SUBJECT      # e.g. mailto:you@example.com
wrangler secret put ADMIN_TOKEN        # random secret used to sign auth tokens (e.g. openssl rand -hex 24)
wrangler secret put USER_PASSWORDS     # JSON object of per-user passwords, e.g. {"Arad":"pass1","Amir":"pass2"}
```

> `ADMIN_TOKEN` is a server-side signing key — never share it. `USER_PASSWORDS` is a JSON string mapping each username to their password.

### 2e. Deploy

```bash
npm run deploy
```

Note the Worker URL — it will look like:
```
https://flatmate-portal-worker.<your-subdomain>.workers.dev
```

---

## Step 3 — Configure the Frontend

Open `frontend/app.js` and fill in the two config values at the top:

```js
const API_BASE = 'https://flatmate-portal-worker.<your-subdomain>.workers.dev';
const VAPID_PUBLIC_KEY = '<paste your VAPID public key here>';
```

Also update the `USERS` array and `TRASH_SCHEDULE` object to match your household.

### Add PWA Icons

Place PNG icons in `frontend/`:
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)
- `apple-touch-icon.png` (180×180)

You can generate them from any image using https://realfavicongenerator.net.

---

## Step 4 — Deploy to GitHub Pages

The repo includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically deploys the `frontend/` folder to GitHub Pages on every push to `main`.

1. Create a GitHub repo and push the project.
2. Go to **Settings → Pages** → set source to **GitHub Actions**.
3. Your PWA will be live at `https://<user>.github.io/<repo>/`.

> **Important:** If your Pages URL has a subpath (e.g. `/flatmate-portal/`), update `start_url` in `manifest.json` accordingly.

---

## Step 5 — Customise the Trash Schedule

The trash schedule is editable from the admin panel in the UI (no code change needed after initial setup). It can also be seeded directly in `worker/index.js` and `frontend/app.js` in the `TRASH_SCHEDULE` object.

The cron fires twice daily — **09:00 and 20:00 Rome time** (08:00 and 19:00 UTC) — and sends a push notification to the flatmate assigned to take out the trash that day. Days with no assigned person are hidden from the schedule view.

Cron triggers are configured in `worker/wrangler.toml`:
```toml
[triggers]
crons = ["0 8 * * *", "0 19 * * *"]
```

---

## Authentication

All write operations require a valid Bearer token obtained from `POST /login`.

```
Authorization: Bearer <username>.<hmac-signature>
```

Tokens are HMAC-SHA256 signed using `ADMIN_TOKEN` as the key and are verified server-side on every write request. Passwords are stored encrypted as a Cloudflare Worker Secret and never returned to the client.

The first user in `ALLOWED_USERS` whose username matches `'Arad'` (configurable in `worker/index.js`) is granted admin privileges.

---

## API Reference

### Public (no auth required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/items` | Fetch all items + leaderboard scores |
| GET | `/announcements` | Fetch latest 5 announcements |
| GET | `/trash-schedule` | Fetch the current trash schedule |
| POST | `/login` | Verify password, receive auth token |

### Authenticated (Bearer token required)

| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/items` | `{ title, category?, is_emergency? }` | Add item; broadcasts push |
| PUT | `/items/:id` | `{ title?, category?, is_emergency? }` | Edit item; broadcasts push |
| PATCH | `/items/:id/pickup` | — | Claim an item |
| PATCH | `/items/:id/complete` | — | Mark completed; increments leaderboard score |
| DELETE | `/items/:id` | — | Remove item |
| POST | `/subscribe` | `{ subscription }` | Save push subscription |

### Admin only

| Method | Path | Description |
|--------|------|-------------|
| POST | `/admin/broadcast` | Send announcement + push to all |
| PUT | `/admin/trash-schedule` | Update the weekly trash schedule |
| POST | `/admin/send-trash` | Manually trigger trash reminder push |
| GET | `/admin/leaderboard` | Get all leaderboard scores |
| PUT | `/admin/leaderboard` | Adjust a user's score (`{ username, delta }`) |
| DELETE | `/admin/leaderboard` | Reset all scores to zero |
| GET | `/admin/activity-log` | Fetch last 100 activity log entries |

---

## PWA Updates

When a new version is deployed, a yellow **⬆ Update** button appears in the header. Tapping it downloads the latest files and reloads. Update detection uses two mechanisms:

- **Service Worker change detection** — for changes to `service-worker.js`
- **ETag HEAD request** — for changes to HTML/JS/CSS (works on iOS Safari where SW updates are unreliable)

---

## Local Development

### Worker

```bash
cd worker
npm install
npm run dev          # starts wrangler dev server on localhost:8787
```

### Frontend

```bash
cd frontend
npx serve .          # or: python3 -m http.server 8080
```

Update `API_BASE` in `app.js` to `http://localhost:8787` for local testing.

> **Note:** Push notifications require HTTPS and won't work on `localhost`. Use `ngrok` or deploy to staging to test push.

---

## Project Structure

```
Flatmate Portal/
├── .github/
│   └── workflows/
│       └── deploy.yml        # Auto-deploy frontend to GitHub Pages
├── worker/
│   ├── index.js              # Cloudflare Worker — REST API, push, cron
│   ├── schema.sql            # D1 database schema
│   ├── wrangler.toml         # Wrangler configuration + cron triggers
│   └── package.json
├── frontend/
│   ├── index.html            # App shell + login screen
│   ├── app.js                # All application logic
│   ├── style.css             # Styles
│   ├── manifest.json         # PWA manifest
│   ├── service-worker.js     # Caching + push notification handler
│   ├── icon-192.png
│   ├── icon-512.png
│   └── apple-touch-icon.png
└── README.md
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS errors | Make sure `API_BASE` matches the deployed Worker URL exactly (no trailing slash). |
| 401 Unauthorized on write | Log out and log back in — your token may be from before the latest deploy. |
| Push notifications not arriving | Verify VAPID keys match between Worker secrets and `app.js`. Check browser console for subscription errors. |
| Cron not firing | Run `wrangler tail` to see scheduled events. Verify cron expressions in `wrangler.toml`. |
| D1 errors | Re-run `npm run db:init:remote` to reset the schema. |
| GitHub Pages deploy failing | Re-run the failed workflow — transient GitHub OIDC network errors occasionally occur. |
| Update button not appearing on iOS | Ensure the HEAD request to `index.html` returns an `ETag` header (GitHub Pages does this by default). |
