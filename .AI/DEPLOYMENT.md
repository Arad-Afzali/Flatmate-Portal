# Flatmate Portal — Deployment & CI/CD

## Overview

The project uses a split deployment model:
- **Frontend** → GitHub Pages (static files, auto-deployed on push to `main`)
- **Backend** → Cloudflare Workers (deployed via `wrangler deploy`)
- **Database** → Cloudflare D1 (managed through Wrangler CLI)
- **Backups** → Daily automated D1 export to a private GitHub repo

---

## Frontend Deployment (GitHub Pages)

### GitHub Actions Workflow

**File**: `.github/workflows/deploy.yml`

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: frontend
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

**Key details:**
- Triggers on every push to `main` branch
- Deploys only the `frontend/` directory (not the whole repo)
- Uses GitHub's official OIDC-based deployment (no personal tokens needed)
- Concurrency group prevents overlapping deployments
- Resulting URL: `https://<username>.github.io/<repo-name>/`

### GitHub Pages Setup

1. Go to repo **Settings → Pages**
2. Set source to **GitHub Actions** (not branch-based)
3. The workflow handles everything automatically

### URL Path Configuration

Since GitHub Pages serves from a subpath (e.g., `/Flatmate-Portal/`), these files reference that path:

- **`manifest.json`**: `"start_url": "/Flatmate-Portal/"`, `"scope": "/Flatmate-Portal/"`
- **`service-worker.js`**: All cached asset paths prefixed with `/Flatmate-Portal/`
- Push notification icon paths: `/Flatmate-Portal/icon-192.png`

If the repo name changes, these paths must be updated.

---

## Backend Deployment (Cloudflare Worker)

### Prerequisites

1. **Node.js ≥ 18**
2. **Wrangler CLI**: `npm i -g wrangler` (or as devDependency)
3. **Cloudflare account** with Workers + D1 enabled

### Step-by-Step

#### 1. Authenticate
```bash
wrangler login
```

#### 2. Create D1 Database
```bash
wrangler d1 create flatmate-portal-db
```
Copy the `database_id` from output into `worker/wrangler.toml`.

#### 3. Initialize Schema

> **Warning**: The checked-in `worker/schema.sql` is incomplete — it only contains `tasks` (missing `picked_up_by` and `completed_at` columns) and `push_subscriptions`. For clean deployments, replace its contents with the **Full Complete Schema** from [DATABASE.md](../\.AI/DATABASE.md) which includes all 6 tables.

```bash
cd worker
npm install

# Local (dev)
npm run db:init
# OR: wrangler d1 execute flatmate-portal-db --file=./schema.sql

# Remote (production)
npm run db:init:remote
# OR: wrangler d1 execute flatmate-portal-db --remote --file=./schema.sql
```

#### 4. Set Secrets
```bash
wrangler secret put VAPID_PUBLIC_KEY     # base64url-encoded 65-byte public key
wrangler secret put VAPID_PRIVATE_KEY    # base64url-encoded 32-byte private scalar
wrangler secret put VAPID_SUBJECT        # e.g. mailto:you@example.com
wrangler secret put ADMIN_TOKEN          # openssl rand -hex 24
wrangler secret put USER_PASSWORDS       # JSON: {"Arad":"pass1","Amir":"pass2",...}
```

#### 5. Deploy
```bash
npm run deploy
# OR: wrangler deploy
```

Output: `https://flatmate-portal-worker.<subdomain>.workers.dev`

#### 6. Update Frontend Config
Set `API_BASE` in `frontend/app.js` to the Worker URL (no trailing slash).
Set `VAPID_PUBLIC_KEY` in `frontend/app.js` to match the Worker secret.

### Generate VAPID Keys

```bash
npx web-push generate-vapid-keys
```

Output:
```
Public Key:  BDbtLlG3bt... (base64url, ~88 chars)
Private Key: abc123...     (base64url, ~44 chars)
```

---

## Database Backup (Automated)

### GitHub Actions Workflow

**File**: `.github/workflows/backup.yml`

```yaml
name: Daily D1 Backup

on:
  schedule:
    - cron: '0 2 * * *'   # 2:00 AM UTC daily
  workflow_dispatch:       # allow manual trigger

jobs:
  backup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install -g wrangler
      - name: Export D1 database
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CF_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CF_ACCOUNT_ID }}
        run: |
          wrangler d1 export flatmate-portal-db --output backup.sql --remote
      - name: Push to backup repo
        env:
          BACKUP_REPO_TOKEN: ${{ secrets.BACKUP_REPO_TOKEN }}
          BACKUP_REPO: ${{ secrets.BACKUP_REPO }}
        run: |
          git clone https://x-access-token:${BACKUP_REPO_TOKEN}@github.com/${BACKUP_REPO}.git backup-repo
          FILENAME="backup-$(date -u +%Y-%m-%d).sql"
          cp backup.sql backup-repo/${FILENAME}
          cd backup-repo
          git config user.email "backup-bot@github.com"
          git config user.name "Backup Bot"
          git add "${FILENAME}"
          git commit -m "Daily backup ${FILENAME}"
          git push
```

### Required GitHub Secrets for Backup

| Secret              | Description                                           |
|---------------------|-------------------------------------------------------|
| `CF_API_TOKEN`      | Cloudflare API token with D1 read permissions         |
| `CF_ACCOUNT_ID`     | Cloudflare account ID                                 |
| `BACKUP_REPO_TOKEN` | GitHub PAT with push access to the backup repository  |
| `BACKUP_REPO`       | Backup repo path (e.g. `owner/repo-name`)             |

**Key details:**
- Runs daily at 2:00 AM UTC
- Can also be triggered manually via `workflow_dispatch`
- Exports full D1 database as SQL
- Pushes timestamped `.sql` file to a separate private repo
- Backup filename format: `backup-YYYY-MM-DD.sql`

---

## Local Development

### Worker (Backend)
```bash
cd worker
npm install
npm run dev    # Starts wrangler dev server on localhost:8787
```

### Frontend
```bash
cd frontend
npx serve .    # OR: python3 -m http.server 8080
```

Update `API_BASE` in `app.js` to `http://localhost:8787` for local testing.

**Note**: Push notifications require HTTPS and will not work on localhost. Use `ngrok` or deploy to staging.

---

## npm Scripts (worker/package.json)

```json
{
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "db:init": "wrangler d1 execute flatmate-portal-db --file=./schema.sql",
    "db:init:remote": "wrangler d1 execute flatmate-portal-db --remote --file=./schema.sql"
  },
  "devDependencies": {
    "wrangler": "^3.0.0"
  }
}
```

---

## Environment Summary

| Environment | Frontend               | Backend                          | Database           |
|-------------|------------------------|----------------------------------|--------------------|
| Local Dev   | `npx serve frontend`   | `wrangler dev` (localhost:8787)  | Local D1 (SQLite)  |
| Production  | GitHub Pages            | Cloudflare Workers (edge)        | Cloudflare D1      |
