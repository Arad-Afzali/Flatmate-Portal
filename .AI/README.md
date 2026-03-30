# .AI — Project Documentation

This directory contains comprehensive documentation of the Flatmate Portal project, structured so that an AI (or developer) can fully understand and rebuild the entire project from these files alone.

## Files

| File | Description |
|------|-------------|
| [OVERVIEW.md](OVERVIEW.md) | Project summary, tech stack, users, file structure |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System diagram, data flows, communication protocol, key patterns |
| [BACKEND-API.md](BACKEND-API.md) | Cloudflare Worker: full API reference, endpoints, helpers, config |
| [FRONTEND.md](FRONTEND.md) | HTML structure, JS logic (all functions), CSS design system |
| [DATABASE.md](DATABASE.md) | Complete D1 schema (6 tables), column specs, auto-cleanup logic |
| [DEPLOYMENT.md](DEPLOYMENT.md) | GitHub Actions CI/CD, Cloudflare deployment, local dev, secrets |
| [PWA-AND-PUSH.md](PWA-AND-PUSH.md) | Service worker, manifest, VAPID JWT, RFC 8291 encryption |
| [AUTHENTICATION.md](AUTHENTICATION.md) | HMAC tokens, password storage, auth levels, security model |
| [UI-COMPONENTS.md](UI-COMPONENTS.md) | Screen maps, user flows, component hierarchy, task states |
| [REBUILD-PROMPT.md](REBUILD-PROMPT.md) | Self-contained prompt to rebuild the project from scratch |

## How to Use for Rebuilding

1. Start with **REBUILD-PROMPT.md** — it contains the master prompt
2. Use the other files as detailed references for each subsystem
3. All files together describe the complete implementation with enough detail to reproduce every feature
