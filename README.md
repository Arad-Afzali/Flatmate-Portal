# Flatmate Portal

A small installable web app (PWA) for a shared flat: a shared to-do and shopping list, announcements, a weekly trash rota with push reminders, and a leaderboard for who gets things done.

The frontend is static files on **GitHub Pages**. The backend is one **Cloudflare Worker** with a **D1** (SQLite) database. Both run on free tiers.

## Features

- **Shared items**: add, edit, pick up and complete tasks (General, Grocery, Repair), with an urgent flag
- **Push notifications** (Web Push with VAPID, no third-party service) when something is added, edited or announced
- **Announcements**: anyone can broadcast a short message to the flat
- **Trash rota**: weekly schedule, with a daily cron push to whoever is on duty
- **Leaderboard**: one point per completed item
- **Admin panel**: edit the rota, adjust scores, clear announcements, view the activity log, send a test push
- **Installable** on iOS and Android, with an in-app update button

## Architecture

```
┌───────────────┐      HTTPS / JSON       ┌─────────────────────┐
│ GitHub Pages  │ ◄─────────────────────► │ Cloudflare Worker   │
│ (PWA)         │  Bearer token on writes │ REST API, push, cron│
└───────────────┘                         └──────────┬──────────┘
                                                     │ SQL
                                              ┌──────▼──────┐
                                              │ Cloudflare  │
                                              │ D1 (SQLite) │
                                              └─────────────┘
```

Web Push encryption (RFC 8291) and VAPID signing are written by hand with the Web Crypto API, so the worker has no runtime dependencies.

## Setup

You need Node.js 18+, a Cloudflare account and a GitHub account.

### 1. Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

Keep both keys for the steps below.

### 2. Deploy the worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create flatmate-portal-db
```

Paste the printed `database_id` into `worker/wrangler.toml`, and set your flatmates there:

```toml
[vars]
USERS = "Alice,Bob,Charlie,Dana"
ADMIN_USER = "Alice"
```

Create the tables and set the secrets:

```bash
npm run db:init:remote
npx wrangler secret put USER_PASSWORDS     # {"Alice":"...","Bob":"...","Charlie":"...","Dana":"..."}
npx wrangler secret put SESSION_SECRET     # e.g. the output of: openssl rand -hex 32
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
npx wrangler secret put VAPID_SUBJECT      # mailto:you@example.com
npm run deploy
```

Note the worker URL it prints (`https://flatmate-portal-worker.<subdomain>.workers.dev`).

The trash reminder runs at the times in `[triggers]` in `wrangler.toml`. They are in UTC, so change them to suit your time zone.

### 3. Configure the frontend

Edit `frontend/config.js`:

```js
const API_BASE = 'https://flatmate-portal-worker.<subdomain>.workers.dev';
const VAPID_PUBLIC_KEY = '<your VAPID public key>';
```

The names on the login screen come from the worker, so there is nothing else to change.

### 4. Publish on GitHub Pages

Push the repo to GitHub, then go to **Settings → Pages** and set the source to **GitHub Actions**. `.github/workflows/deploy.yml` publishes `frontend/` on every push to `main`.

Open the site, log in as the admin, and fill in the trash rota from the admin panel. To get push notifications on iPhone, add the app to the home screen first, then tap 🔔.

### Optional: nightly database backup

`.github/workflows/backup.yml` exports the D1 database every night and commits it to a separate **private** repo. To use it, add these repository secrets: `CF_API_TOKEN` (Cloudflare token with D1 access), `CF_ACCOUNT_ID`, `BACKUP_REPO` (`owner/name`) and `BACKUP_REPO_TOKEN` (a GitHub token that can push to it). If you don't want it, delete the file.

## Local development

Put the secrets in `worker/.dev.vars` (one `NAME=value` per line, ignored by git), then:

```bash
cd worker
npm run db:init    # local D1
npm run dev        # http://localhost:8787
```

```bash
cd frontend
python3 -m http.server 8080
```

Point `API_BASE` in `config.js` at `http://localhost:8787` while testing. Push notifications need HTTPS, so test them on the deployed site.

## API

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/config` | none | Flatmate names and the admin |
| POST | `/login` | none | `{ username, password }` → token |
| GET | `/items` | none | Pending and completed items, leaderboard |
| POST | `/items` | user | Add an item |
| PUT | `/items/:id` | user | Edit an item |
| PATCH | `/items/:id/pickup` | user | Claim an item |
| PATCH | `/items/:id/complete` | user | Complete an item (+1 point) |
| DELETE | `/items/:id` | user | Delete an item |
| GET / POST | `/announcements` | none / user | Latest 3 announcements / send one |
| POST | `/subscribe` | user | Save a push subscription |
| GET | `/admin/schedule` | none | Current trash rota |
| PUT | `/admin/schedule` | admin | Update the rota |
| GET / PUT / DELETE | `/admin/leaderboard` | admin | Read, adjust (`{ username, delta }`) or reset scores |
| GET | `/admin/activity-log` | admin | Last 100 actions |
| DELETE | `/admin/announcements[/:id]` | admin | Delete one or all announcements |
| POST | `/admin/send-trash` | admin | Send the trash reminder to one person |
| POST | `/admin/test-notify` | admin | Send a test push to everyone |

Write requests send `Authorization: Bearer <username>.<HMAC-SHA256 signature>`.

## Security notes

This was built for one flat of people who trust each other, and it keeps things simple:

- Passwords live in a Worker secret as plain JSON and are compared directly, not hashed.
- Tokens don't expire. Changing `SESSION_SECRET` logs everyone out.
- CORS allows any origin, and the item list is readable without logging in.

For anything bigger, hash the passwords, add token expiry, and lock CORS to your Pages domain.

## Project structure

```
├── .github/workflows/
│   ├── deploy.yml        # frontend → GitHub Pages
│   └── backup.yml        # optional nightly D1 backup
├── worker/
│   ├── index.js          # REST API, Web Push, cron
│   ├── schema.sql        # D1 tables
│   ├── wrangler.toml     # bindings, flatmates, cron
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── config.js         # API URL and VAPID public key
│   ├── app.js
│   ├── style.css
│   ├── manifest.json
│   ├── service-worker.js # offline cache and push handler
│   └── *.png             # icons
└── generate-icons.js     # makes the PNG icons, no dependencies
```
