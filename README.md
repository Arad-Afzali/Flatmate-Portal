# Flatmate Portal

A PWA for 6 flatmates to manage shared tasks, with push notifications and a trash-day reminder — hosted on **GitHub Pages** (frontend) + **Cloudflare Workers / D1** (backend).

---

## Architecture

```
┌──────────────┐       HTTPS / JSON        ┌──────────────────────┐
│  GitHub Pages │ ◄──────────────────────► │  Cloudflare Worker    │
│  (PWA)        │                           │  REST API + Push      │
└──────────────┘                           └──────────┬───────────┘
                                                       │ SQL
                                                ┌──────▼──────┐
                                                │ Cloudflare D1│
                                                │ (SQLite)     │
                                                └──────────────┘
```

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
- **Public Key** (base64url, ~88 chars) → goes in the Worker secrets AND in `frontend/app.js`
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
wrangler secret put VAPID_PUBLIC_KEY     # paste your public key
wrangler secret put VAPID_PRIVATE_KEY    # paste your private key
wrangler secret put VAPID_SUBJECT        # e.g.  mailto:you@example.com
```

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

### Add PWA Icons

Place two PNG icons in the `frontend/` folder:
- `icon-192.png` (192×192)
- `icon-512.png` (512×512)

You can generate them from any image using https://realfavicongenerator.net or a similar tool.

---

## Step 4 — Deploy to GitHub Pages

### Option A: from the `frontend/` folder

1. Create a GitHub repo (e.g. `flatmate-portal`).
2. Copy (or symlink) the contents of `frontend/` into the repo root.
3. Push to GitHub.
4. Go to **Settings → Pages** → set source to the branch root (`/`).
5. Your PWA is live at `https://<user>.github.io/flatmate-portal/`.

### Option B: use a `docs/` folder

1. Copy the `frontend/` contents into a `docs/` folder in your repo.
2. Set Pages source to `docs/`.

> **Important:** If your Pages URL has a subpath (e.g. `/flatmate-portal/`), update `start_url` in `manifest.json` and asset paths accordingly.

---

## Step 5 — Customise the Trash Schedule

Edit the `TRASH_SCHEDULE` object in **both** files to match your household:

| File | Purpose |
|------|---------|
| `worker/index.js` | Cron trigger uses this server-side |
| `frontend/app.js` | Static schedule table displayed in the UI |

The cron runs daily at 07:00 UTC by default (configurable in `worker/wrangler.toml`).

---

## API Reference

| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/items` | — | Fetch all items + leaderboard |
| POST | `/items` | `{ title, category, is_emergency, username }` | Add item; broadcasts push |
| PUT | `/items/:id` | `{ title?, category?, is_emergency?, username }` | Edit item; broadcasts push |
| PATCH | `/items/:id/complete` | `{ username }` | Mark completed |
| DELETE | `/items/:id` | — | Remove item |
| POST | `/subscribe` | `{ username, subscription }` | Save push subscription |

---

## Local Development

### Worker

```bash
cd worker
npm install
npm run dev          # starts wrangler dev server on localhost:8787
```

### Frontend

Serve the `frontend/` folder with any static server:

```bash
cd frontend
npx serve .          # or python3 -m http.server 8080
```

Update `API_BASE` in `app.js` to `http://localhost:8787` for local testing.

> **Note:** Push notifications require HTTPS and won't work on `localhost` in most browsers. Use `ngrok` or deploy to test push.

---

## Project Structure

```
Flatmate Portal/
├── worker/
│   ├── index.js          # Cloudflare Worker (ES modules)
│   ├── schema.sql        # D1 database schema
│   ├── wrangler.toml     # Wrangler configuration
│   └── package.json
├── frontend/
│   ├── index.html        # Main HTML
│   ├── app.js            # Application logic
│   ├── style.css         # Styles
│   ├── manifest.json     # PWA manifest
│   └── service-worker.js # SW for caching + push
└── README.md
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| CORS errors | Make sure `API_BASE` matches the deployed Worker URL exactly (no trailing slash). |
| Push notifications not arriving | Verify VAPID keys match between Worker secrets and `app.js`. Check browser console for subscription errors. |
| Cron not firing | Run `wrangler tail` to see scheduled events. Verify the cron expression in `wrangler.toml`. |
| D1 errors | Re-run `npm run db:init:remote` to reset the schema. |
