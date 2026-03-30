# Flatmate Portal — Project Overview

## What It Is

Flatmate Portal is a **Progressive Web App (PWA)** designed for a shared flat of 6 residents to manage household tasks collaboratively. It is a full-stack web application with a serverless backend.

## Core Purpose

- Shared task management (add, claim, complete, delete household items)
- Push notification system for real-time alerts
- Automated trash-day reminders via cron
- Broadcast announcements to all flatmates
- Gamified leaderboard tracking task completions
- Admin panel for one designated admin user

## Users

The app supports exactly **6 hardcoded users**:

| Name   | Role  |
|--------|-------|
| Arad   | Admin |
| Amir   | User  |
| Aien   | User  |
| Sattar | User  |
| Ali    | User  |
| Gokol  | User  |

## Technology Stack

| Layer           | Technology                                    |
|-----------------|-----------------------------------------------|
| Frontend        | Vanilla HTML5, CSS3, JavaScript (no framework)|
| Backend / API   | Cloudflare Worker (ES Modules syntax)         |
| Database        | Cloudflare D1 (SQLite-compatible)             |
| Hosting (FE)    | GitHub Pages                                  |
| Push            | Web Push API with VAPID (RFC 8292)            |
| Encryption      | RFC 8291 aes128gcm payload encryption         |
| Auth            | HMAC-SHA256 signed bearer tokens              |
| CI/CD           | GitHub Actions (auto-deploy + daily DB backup)|
| PWA             | Service Worker + Web App Manifest             |
| Icons           | Generated via Node.js script (zero deps)      |

## Key Design Decisions

1. **No frontend framework** — single `app.js` file handles all UI logic with vanilla DOM manipulation
2. **No npm dependencies in frontend** — zero build step, served as static files
3. **Cloudflare Worker** — serverless, globally distributed, free tier sufficient
4. **D1 (SQLite)** — simple relational storage with SQL, no external database service needed
5. **Web Push done from scratch** — VAPID JWT creation and aes128gcm encryption implemented manually in the Worker using Web Crypto API (no libraries)
6. **HMAC-SHA256 tokens** — lightweight auth without JWTs or sessions; passwords stored as Cloudflare secrets

## Project File Structure

```
Flatmate Portal/
├── .AI/                          # Project documentation for AI rebuilding
│   ├── OVERVIEW.md               # Project summary, tech stack, file structure
│   ├── ARCHITECTURE.md           # System diagram, data flows, key patterns
│   ├── BACKEND-API.md            # Full API reference, endpoints, helpers
│   ├── FRONTEND.md               # HTML structure, JS logic, CSS design system
│   ├── DATABASE.md               # D1 schema, table specs, auto-cleanup logic
│   ├── DEPLOYMENT.md             # CI/CD, Cloudflare deployment, local dev
│   ├── PWA-AND-PUSH.md           # Service worker, manifest, VAPID, encryption
│   ├── AUTHENTICATION.md         # Tokens, passwords, auth levels, security
│   ├── UI-COMPONENTS.md          # Screen maps, user flows, component hierarchy
│   ├── REBUILD-PROMPT.md         # Self-contained prompt to rebuild from scratch
│   └── README.md                 # Index of all .AI documentation files
├── .github/
│   └── workflows/
│       ├── deploy.yml            # Auto-deploy frontend/ to GitHub Pages
│       └── backup.yml            # Daily D1 database export to private repo
├── frontend/
│   ├── index.html                # App shell — login screen + dashboard + modals
│   ├── app.js                    # All client-side logic
│   ├── style.css                 # All styles with light/dark mode
│   ├── manifest.json             # PWA manifest
│   ├── service-worker.js         # Cache-first strategy + push handler
│   ├── icon-192.png              # PWA icon 192×192
│   ├── icon-512.png              # PWA icon 512×512
│   └── apple-touch-icon.png      # iOS home screen icon
├── worker/
│   ├── index.js                  # Cloudflare Worker — full REST API + push + cron
│   ├── schema.sql                # D1 database schema (2 base tables)
│   ├── wrangler.toml             # Wrangler config — D1 binding + cron triggers
│   └── package.json              # wrangler devDependency + npm scripts
├── generate-icons.js             # Node.js PNG icon generator (zero deps)
└── README.md                     # Setup & deployment guide
```
