# Flatmate Portal — Authentication & Security

## Authentication Model

The app uses a **stateless HMAC-SHA256 token** system. No session store, no JWTs with claims, no cookies.

### How It Works

1. User selects their name from a dropdown and enters a password
2. Frontend sends `POST /login` with `{ username, password }`
3. Worker compares password against `USER_PASSWORDS` secret (JSON object)
4. On success, Worker generates a token: `username.base64url(HMAC-SHA256(username, ADMIN_TOKEN))`
5. Token returned to client, stored in `localStorage`
6. All subsequent write requests include `Authorization: Bearer <token>` header
7. Worker verifies by re-computing HMAC and comparing

### Token Format

```
<username>.<base64url-encoded-hmac-signature>
```

Example: `Arad.a1b2c3d4e5f6...`

### Token Creation (Worker)

```javascript
async function createToken(username, env) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.ADMIN_TOKEN),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
  return `${username}.${toB64Url(sig)}`;
}
```

### Token Verification (Worker)

```javascript
async function verifyToken(token, env) {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const username = token.slice(0, dot);
  const expected = await createToken(username, env);
  if (token !== expected) return null;                // constant-time? No — but sufficient for this use case
  if (!ALLOWED_USERS.includes(username)) return null;
  return username;
}
```

### Request Authentication

```javascript
async function getUserFromRequest(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return verifyToken(token, env);
}
```

---

## Password Storage

Passwords are stored as a **Cloudflare Worker Secret** named `USER_PASSWORDS`:

```json
{"Arad":"password1","Amir":"password2","Aien":"password3","Sattar":"password4","Ali":"password5","Gokol":"password6"}
```

- Passwords are **not hashed** — they are plain strings compared directly
- The secret is only accessible within the Worker runtime (not exposed to clients)
- Set via: `wrangler secret put USER_PASSWORDS`
- Parsed at runtime: `JSON.parse(env.USER_PASSWORDS)`

---

## Authorization Levels

| Level  | Check                        | Endpoints                                              |
|--------|------------------------------|--------------------------------------------------------|
| Public | None                         | `GET /items`, `GET /announcements`, `GET /admin/schedule`, `POST /login` |
| Auth   | Valid Bearer token           | `POST /items`, `PUT /items/:id`, `PATCH /items/:id/*`, `DELETE /items/:id`, `POST /announcements`, `POST /subscribe` |
| Admin  | Token user === `'Arad'`      | All `/admin/*` write endpoints                         |

### Admin Check

```javascript
const user = await getUserFromRequest(request, env);
if (user !== 'Arad') return json({ error: 'Unauthorized' }, 401);
```

The admin username is hardcoded as `'Arad'` in the Worker.

---

## Client-Side Auth State

```javascript
// State variables
let currentUser = null;  // Set on login
let authToken = null;    // HMAC token from Worker

// Persistence
localStorage.setItem('flatmate_username', username);
localStorage.setItem('flatmate_token', data.token);

// On page load
const saved = localStorage.getItem('flatmate_username');
const token = localStorage.getItem('flatmate_token');
if (saved && token && ALLOWED_USERS.includes(saved)) {
  currentUser = saved;
  authToken = token;
  showDashboard();
}

// API helper auto-attaches token
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  // ...
}
```

### Logout

```javascript
function logout() {
  localStorage.removeItem('flatmate_username');
  localStorage.removeItem('flatmate_token');
  currentUser = null;
  authToken = null;
  showLogin();
}
```

---

## CORS Policy

All Worker responses include:

```javascript
{
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
```

- **Open CORS** (`*`) because frontend (GitHub Pages) and backend (Cloudflare Workers) are on different origins
- `OPTIONS` preflight requests return `204 No Content` with CORS headers

---

## Security Considerations

| Aspect                  | Implementation                                              |
|-------------------------|-------------------------------------------------------------|
| XSS Prevention          | `escapeHtml()` used on all user-rendered content            |
| Token Signing           | HMAC-SHA256 using Web Crypto API                            |
| Password Transmission   | Over HTTPS only (both GitHub Pages and Workers enforce TLS) |
| Password Storage        | Cloudflare encrypted secrets (not in code)                  |
| Push Encryption         | RFC 8291 aes128gcm end-to-end                              |
| Input Validation        | Max 200 chars for announcements (server-side trim + cap); task titles are not length-capped server-side |
| Admin Access            | Server-side username check on every admin endpoint          |
| Expired Subscriptions   | Auto-deleted when push service returns 404/410              |
| CORS                    | Open (`*`) — no secret data exposed without token           |

---

## Secrets Summary

| Secret             | Where Set             | Where Used           | Purpose                             |
|--------------------|-----------------------|----------------------|-------------------------------------|
| `VAPID_PUBLIC_KEY` | Worker secret + app.js| Worker + Frontend    | VAPID auth + push subscription      |
| `VAPID_PRIVATE_KEY`| Worker secret only    | Worker               | JWT signing for push delivery       |
| `VAPID_SUBJECT`    | Worker secret only    | Worker               | VAPID contact URI                   |
| `ADMIN_TOKEN`      | Worker secret only    | Worker               | HMAC key for auth token signing     |
| `USER_PASSWORDS`   | Worker secret only    | Worker               | Password verification               |
| `CF_API_TOKEN`     | GitHub secret         | Backup workflow      | Cloudflare API for D1 export        |
| `CF_ACCOUNT_ID`    | GitHub secret         | Backup workflow      | Cloudflare account identification   |
| `BACKUP_REPO_TOKEN`| GitHub secret         | Backup workflow      | Push to private backup repo         |
| `BACKUP_REPO`      | GitHub secret         | Backup workflow      | Backup repo path                    |
