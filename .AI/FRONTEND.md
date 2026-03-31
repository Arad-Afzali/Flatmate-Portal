# Flatmate Portal — Frontend

## Overview

The frontend is a **vanilla HTML/CSS/JS Progressive Web App** with zero build tools or framework dependencies. It consists of 5 source files (plus 3 generated icon assets documented in [PWA-AND-PUSH.md](PWA-AND-PUSH.md)):

| File               | Purpose                                                    |
|--------------------|------------------------------------------------------------|
| `index.html`       | App shell: login screen, dashboard, modals                 |
| `app.js`           | All client-side logic: auth, API calls, rendering, admin   |
| `style.css`        | All presentation: light mode, dark mode, responsive        |
| `manifest.json`    | PWA metadata for installability                            |
| `service-worker.js`| Caching strategy + push notification handler               |

**Hosting**: GitHub Pages (static file serving from `frontend/` directory)

---

## index.html — App Shell Structure

The HTML is structured as three distinct layers:

### 1. Login Screen (`#login-screen`)
- Full-screen centered card with gradient background
- User dropdown (`<select>`) with 6 hardcoded users: Arad, Amir, Aien, Sattar, Ali, Gokol
- Password input field
- Login button (disabled until both fields filled)
- Error message for wrong password

### 2. Dashboard (`#dashboard`, initially hidden)
Sections in order:

#### Header (`.app-header`)
- App title "🏠 Flatmate Portal"
- Current user badge
- Update button (hidden by default, shown when SW update available)
- Notification bell button (triggers push permission)
- Logout button

#### Admin Panel (`#admin-section`, hidden for non-admin users)
- Collapsible section with toggle arrow
- Contains:
  - Test notification button
  - Trash schedule editor (day → user dropdowns)
  - Save schedule button
  - Manage broadcasts list with per-item delete
  - Clear all broadcasts button
  - Leaderboard management (per-user +/- buttons)
  - Activity log (last 100 entries)
  - Status message area

#### Cleaning Day Banner (`#cleaning-banner`, conditionally visible)
- Yellow warning-style banner displayed **above** the Broadcast section
- Appears every **2 weeks on Saturday and Sunday** (biweekly cleaning schedule)
- Message: "🧹 Cleaning Day! It's house cleaning day — let's make it shine!"
- Yellow background with dark text for high visibility (uses `--warning` color)
- Push notification sent to **all users** when cleaning day is active
- Hidden on all other days

#### Broadcast Section
- Shows only the **last 3 messages** (server returns max 3, frontend also enforces `slice(0, 3)`)
- Empty state message

#### Trash Schedule
- Horizontal pills showing day → assigned user
- Today's day highlighted

#### Pending Items
- Count badge in header
- Task list with: title, category tag, emergency icon, requester, time ago
- Action buttons per item: "I'm on it!", Complete (✓), Edit (✏️), Delete (✕)
- In-progress badge showing who claimed it

#### Completed Items
- Count badge
- Read-only task list (slightly transparent)
- Delete button only

#### Leaderboard
- Grid layout of user name + score pairs
- Sorted by score descending

#### FAB (Floating Action Button)
- Fixed position bottom-right
- Opens the Add Modal

### 3. Add Modal (`#add-modal`)
- Overlay with centered card
- Tab bar: "Item" / "Announcement"
- **Item tab**: title input, category dropdown (general/grocery/repair), urgent checkbox, submit button
- **Announcement tab**: message input, send button

### 4. Edit Modal (`#edit-modal`)
- Same fields as add item but pre-populated
- Hidden ID field for the item being edited
- Save and Cancel buttons

---

## app.js — Client Logic

### Configuration Constants

```javascript
const API_BASE = 'https://flatmate-portal-worker.holimoli.workers.dev';
const VAPID_PUBLIC_KEY = 'BDbtLlG3bt...';
const ADMIN_USER = 'Arad';
const ALLOWED_USERS = ['Arad', 'Amir', 'Aien', 'Sattar', 'Ali', 'Gokol'];
```

### State Variables

```javascript
let currentUser = null;   // Username string after login
let authToken = null;     // HMAC-signed token from worker
let trashSchedule = {...}; // Day-of-week → username mapping (fetched from server)
```

### Day Ordering

```javascript
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon → Sun for display
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
```

### Initialization Flow

1. `DOMContentLoaded` → `registerServiceWorker()` + `init()`
2. `init()` checks `localStorage` for saved `flatmate_username` and `flatmate_token`
3. If found and user is in `ALLOWED_USERS` → `showDashboard()`
4. Otherwise → `showLogin()`

### API Helper

```javascript
async function api(path, options = {}) {
  // Auto-adds Content-Type: application/json
  // Auto-adds Authorization: Bearer <token> if authToken exists
  // Returns parsed JSON
}
```

### Login Flow

1. User selects name from dropdown + enters password
2. Button enabled only when both filled
3. Enter key in password field triggers login
4. `POST /login` to worker
5. On success: save to `localStorage`, set `currentUser`/`authToken`, show dashboard
6. On failure: show error message, clear password

### Dashboard Initialization (`showDashboard()`)

1. Show dashboard, hide login
2. Display current username badge
3. Show/hide admin section based on `currentUser === ADMIN_USER`
4. Wire up all button event listeners
5. Wire up FAB, modal close, tab switching, broadcast input
6. Call `renderTrashSchedule()`, `loadItems()`, `loadAnnouncements()`, `loadScheduleFromServer()`

### Rendering Functions

#### `renderPending(items)`
- Maps array to HTML list items
- Shows emergency styling (red border, 🚨 icon) for `is_emergency === 1`
- Shows "I'm on it!" button for pending items
- Shows direct ✓ complete button on unclaimed pending items (in addition to "I'm on it!")
- Shows "✓ Done" button for items claimed by current user
- In-progress items claimed by others show no pickup/complete button, but edit (✏️) and delete (✕) remain
- Edit and delete buttons on all items regardless of state
- Uses `escapeHtml()` for XSS prevention

#### `renderCompleted(items)`
- Similar but with reduced opacity
- Only delete button (no edit/complete actions)

#### `renderLeaderboard(lb)`
- Sorts entries by score descending
- Grid layout of name + score badge

#### `renderTrashSchedule()`
- Filters out days with `null` assignment
- Highlights today's day with `.today` class
- Shows Mon→Sun ordering

#### `renderAnnouncements(items)`
- **Limits display to last 3 messages** — `items.slice(0, 3)` applied before rendering as a frontend safeguard (backend also enforces `LIMIT 3`)
- Long messages (>80 chars) truncated with "read more" toggle
- Click toggles `.expanded` class to show full text
- Shows sender name and time ago

### Task CRUD Operations

- **`addItem(e)`**: Prevents default, POSTs to `/items`, clears form, reloads items
- **`pickUpItem(id)`**: PATCHes `/items/:id/pickup`
- **`completeItem(id)`**: PATCHes `/items/:id/complete`
- **`deleteItem(id)`**: Confirms with `confirm()`, DELETEs `/items/:id`
- **`saveEdit()`**: PUTs to `/items/:id` with edited fields

### Cleaning Day Banner

- **`renderCleaningBanner()`**: Checks if today is a cleaning day (Saturday or Sunday within the active biweekly cycle). If yes, shows the `#cleaning-banner` element with a yellow warning banner. If not, hides it. Called during `showDashboard()` initialization.
- **Biweekly logic**: Uses a fixed epoch date to determine odd/even weeks. Cleaning day is active on Saturday and Sunday of every other week.
- **Push notification**: A cron-triggered push notification is sent to all users on cleaning day mornings (handled server-side).

### Broadcast & Announcements

- **`sendBroadcast()`**: POSTs message to `/announcements`, on success clears input + calls `closeAddModal()` (since broadcast is in the add modal's announcement tab) + reloads announcements
- **`loadAnnouncements()`**: Fetches from `/announcements`, calls `renderAnnouncements()` — **only last 3 messages displayed**

### Admin Functions (Arad only)

- **`toggleAdminPanel()`**: Toggles visibility, loads admin sub-sections
- **`renderAdminScheduleEditor()`**: Creates dropdowns per day with all users + "none"
- **`adminSaveSchedule()`**: PUTs schedule JSON to `/admin/schedule`
- **`renderAdminAnnouncements()`**: Lists announcements with delete buttons
- **`adminDeleteAnnouncement(id)`**: DELETEs specific announcement
- **`adminClearAnnouncements()`**: Confirms, DELETEs all announcements
- **`renderAdminLeaderboard()`**: Shows scores with +/- buttons per user
- **`adminAdjustScore(username, delta)`**: PUTs to `/admin/leaderboard`
- **`renderAdminActivityLog()`**: Fetches and renders last 100 activity entries
- **`adminTestNotify()`**: POSTs to `/admin/test-notify`

### Push Notification Subscription

```javascript
async function subscribeToNotifications() {
  // 1. Check browser support (serviceWorker + PushManager)
  // 2. Request Notification.requestPermission()
  // 3. Get SW registration via navigator.serviceWorker.ready
  // 4. Subscribe via pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })
  // 5. POST subscription JSON to /subscribe
}
```

### Service Worker Registration (`registerServiceWorker()`)

```javascript
async function registerServiceWorker() {
  // 1. Register SW with { updateViaCache: 'none' }
  // 2. Check for waiting SW immediately on load
  // 3. Listen for 'updatefound' event → track installing SW state changes
  // 4. Proactively call reg.update() to check for new versions
  // 5. Wire update button:
  //    a) If reg.waiting exists: postMessage('SKIP_WAITING') → listen for 'controllerchange' → reload
  //    b) FALLBACK: If no waiting SW, unregister SW + clear ALL caches + hard reload
}
```

The fallback case (5b) handles situations where the SW is stuck or the update needs a clean slate.

### Utility Functions

```javascript
function urlBase64ToUint8Array(base64String) // Converts VAPID key for pushManager
function escapeHtml(str)                     // DOM-based XSS prevention
function escapeAttr(str)                     // Escapes quotes for HTML attributes
function timeAgo(dateStr)                    // "just now", "5m ago", "2h ago", "3d ago"
```
### CSS Utility Classes

- **`.hidden`**: Used throughout to toggle visibility (`display: none` via the standard class). Applied/removed via `classList.add('hidden')` / `classList.remove('hidden')` / `classList.toggle('hidden')` on all major sections (login screen, dashboard, admin body, modals, empty states, update button, etc.).
---

## style.css — Styling

### Design System

**CSS Custom Properties (light mode defaults):**
```css
:root {
  --primary: #4f46e5;        /* Indigo-600 */
  --primary-light: #6366f1;  /* Indigo-500 */
  --bg: #f0f2f5;
  --card: #ffffff;
  --text: #1a1a2e;
  --text-muted: #6b7280;
  --border: #e5e7eb;
  --input-bg: #f0f2f5;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;
  --accent: #4f46e5;
  --radius: 12px;
}
```

### Dark Mode

Uses `@media (prefers-color-scheme: dark)` — automatic, no toggle.

**Dark mode overrides:**
```css
--bg: #0d0d1f;          /* Near-black navy */
--card: #16162a;
--text: #e2e8f0;
--text-muted: #94a3b8;
--border: #2d2d4e;
--input-bg: #1e1b4b;    /* Deep indigo */
--accent: #818cf8;
```

Also overrides category tag colors, task state backgrounds, and admin panel colors for dark mode.

### Layout

- **Max container width**: 640px, centered
- **Card-based layout**: Vertical stack with 1rem gap
- **Sticky header**: `position: sticky; top: 0; z-index: 50`
- **FAB**: Fixed, bottom-right, 56px circle, `z-index: 60`
- **Modals**: Fixed overlay, `z-index: 100`, centered card

### Responsive

```css
@media (max-width: 420px) {
  .app-header h1 { font-size: .95rem; }
  .container { padding: .75rem; }
  .card { padding: 1rem; }
}
```

### Category Tag Colors

| Category | Light BG | Light Text | Dark BG  | Dark Text |
|----------|----------|------------|----------|-----------|
| grocery  | #d1fae5  | #065f46    | #052e16  | #86efac   |
| repair   | #fef3c7  | #92400e    | #3b1f00  | #fcd34d   |
| general  | #e0e7ff  | #3730a3    | #1e1b4b  | #a5b4fc   |

### Admin Panel Theme

The admin panel has its own dark theme regardless of system preference:
- Background: `#0d0d1f`
- Border: `#4338ca`
- Text: `#e0e7ff`
- Accent: `#a5b4fc`
- Input bg: `#1e1b4b`

### Key UI Components Styling

- **Login screen**: Gradient background (`#667eea → #764ba2`), centered card with shadow
- **Task items**: Bordered cards with flex layout, emergency items get red border + pink bg
- **In-progress items**: Yellow border + warm background
- **Leaderboard**: Grid of entries with score badges
- **Trash pills**: Horizontal flex row, today pill highlighted with primary border
- **Modals**: Dark overlay backdrop, centered white card
- **Tab bar**: Horizontal buttons, active tab uses primary color fill
