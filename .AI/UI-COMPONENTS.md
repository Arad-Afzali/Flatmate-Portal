# Flatmate Portal — UI Components & User Flows

## Screen Map

```
┌─────────────────────────────────────────────────────────┐
│                    LOGIN SCREEN                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  🏠 Flatmate Portal                             │    │
│  │  "Select your name & enter your password"       │    │
│  │                                                  │    │
│  │  [▼ Choose your name…     ]                     │    │
│  │  [  Password              ]                     │    │
│  │  [  Login (disabled)      ]                     │    │
│  │                                                  │    │
│  │  ⚠ Wrong password. Ask Arad for yours.          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Background: linear-gradient(135deg, #667eea → #764ba2) │
└─────────────────────────────────────────────────────────┘
            │
            ▼ (on successful login)
┌─────────────────────────────────────────────────────────┐
│                    DASHBOARD                             │
│                                                         │
│  ┌──────────────── HEADER (sticky) ────────────────┐   │
│  │  🏠 Flatmate Portal    [User] [⬆] [🔔] [↩️]   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──── ADMIN PANEL (Arad only, collapsible) ───────┐   │
│  │  🔐 Admin  ▶                                    │   │
│  │  ┌─ Test Notification button                    │   │
│  │  ├─ Trash Schedule Editor (7 dropdowns)         │   │
│  │  ├─ Save Schedule button                        │   │
│  │  ├─ Manage Broadcasts (list + delete)           │   │
│  │  ├─ Clear All Broadcasts button                 │   │
│  │  ├─ Leaderboard (+/- per user)                  │   │
│  │  └─ Activity Log (scrollable list)              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──── BROADCAST ──────────────────────────────────┐   │
│  │  📢 Broadcast                                   │   │
│  │  • "House meeting tomorrow"  — Arad · 2h ago    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──── TRASH ──────────────────────────────────────┐   │
│  │  🗑️ Trash                                      │   │
│  │  [Mon:Ali] [Wed:Amir] [Thu:Gokol] [Fri:Sattar] │   │
│  │  [Sat:Arad] [Sun:Aien]                         │   │
│  │  (Today highlighted with border)                │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──── PENDING ITEMS (count badge) ────────────────┐   │
│  │  📋 Pending Items [3]                           │   │
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │ 🚨 Fix kitchen sink          [🙋][✓][✏️][✕]│   │   │
│  │  │ [repair] by Amir · 2h ago                │   │   │
│  │  └──────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │ Buy milk                     [🙋][✓][✏️][✕]│   │   │
│  │  │ [grocery] by Sattar · 5h ago             │   │   │
│  │  └──────────────────────────────────────────┘   │   │
│  │  ┌──────────────────────────────────────────┐   │   │
│  │  │ ⏳ Ali is on it!             [✓ Done]     │   │   │
│  │  │ Clean bathroom                           │   │   │
│  │  │ [general] by Gokol · 1d ago             │   │   │
│  │  └──────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──── COMPLETED (count badge) ────────────────────┐   │
│  │  ✅ Completed [2]                               │   │
│  │  (Items at reduced opacity, delete only)        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──── LEADERBOARD ───────────────────────────────┐   │
│  │  🏆 Leaderboard                                │   │
│  │  [Arad: 5] [Gokol: 4] [Amir: 3]              │   │
│  │  [Aien: 2] [Sattar: 1] [Ali: 0]              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│                                          [＋] ← FAB    │
└─────────────────────────────────────────────────────────┘
            │
            ▼ (FAB click)
┌─────────────────────────────────────────────────────────┐
│                    ADD MODAL                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ➕ New…                               [×]      │   │
│  │                                                  │   │
│  │  [ Item ] [ Announcement ]  ← tab bar           │   │
│  │                                                  │   │
│  │  === Item Tab ===                                │   │
│  │  [  What needs to be done?           ]           │   │
│  │  [▼ Grocery  ]  [☐ ⚠️ URGENT]                  │   │
│  │  [  Add Item                         ]           │   │
│  │                                                  │   │
│  │  === Announcement Tab (hidden) ===               │   │
│  │  [  Send a message to everyone…      ]           │   │
│  │  [  Send Announcement                ]           │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  (Dark overlay backdrop, click outside to close)        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                    EDIT MODAL                            │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ✏️ Edit Item                                   │   │
│  │  [  Pre-filled title                 ]           │   │
│  │  [▼ Category     ]                              │   │
│  │  [☐ ⚠️ URGENT]                                 │   │
│  │  [  Save  ] [  Cancel  ]                        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## User Flows

### 1. First-Time Login
1. User opens app → sees login screen
2. Selects name from dropdown
3. Enters password (obtained from admin)
4. Clicks "Login" (or presses Enter)
5. On success → token saved to `localStorage` → dashboard shown
6. On failure → error message shown, password cleared

### 2. Returning User
1. App loads → checks `localStorage` for username + token
2. If found and valid → dashboard shown immediately (no login)
3. Token stays valid indefinitely (no expiry) until ADMIN_TOKEN secret is rotated

### 3. Add a Task
1. Click FAB (＋) → Add Modal opens on "Item" tab
2. Enter title (required, max 200 chars)
3. Select category: General, Grocery, or Repair
4. Optionally check "⚠️ URGENT"
5. Click "Add Item" → POST `/items` → modal closes → list refreshes
6. Push notification sent to all subscribers

### 4. Claim a Task ("I'm on it!")
1. See pending task with 🙋 button
2. Click "🙋 I'm on it!" → PATCH `/items/:id/pickup`
3. Task shows yellow in-progress badge: "⏳ {name} is on it!"
4. Only the claimer sees "✓ Done" button; others see no pickup/complete action buttons (edit ✏️ and delete ✕ remain visible)

### 5. Complete a Task
1. Click ✓ (if pending) or "✓ Done" (if claimed by you)
2. PATCH `/items/:id/complete` → task moves to Completed section
3. User's leaderboard score increments by 1
4. Task auto-deleted after 24 hours

### 6. Send Announcement
1. Click FAB → switch to "Announcement" tab
2. Type message (max 200 chars)
3. Click "Send Announcement" (or press Enter)
4. POST `/announcements` → push notification to all
5. Appears in Broadcast section for all users

### 7. Enable Push Notifications
1. Click 🔔 bell icon in header
2. Browser prompts for notification permission
3. On "Allow" → subscription created → POST `/subscribe`
4. Alert: "Notifications enabled! 🔔"

### 8. App Update
1. Service worker detects new version
2. Yellow "⬆ Update" button appears in header
3. Click → new SW activates → page reloads with latest code

### 9. Admin: Edit Trash Schedule
1. Admin (Arad) clicks "🔐 Admin" to expand panel
2. Sees 7 dropdowns (Mon-Sun) with current assignments
3. Changes assignments or sets "none"
4. Clicks "💾 Save Schedule" → PUT `/admin/schedule`
5. Schedule updates for all users on next load

### 10. Admin: Manage Leaderboard
1. In admin panel, sees all users with current scores and +/- buttons
2. Click + or - to adjust a user's score
3. PUT `/admin/leaderboard` with `{ username, delta: ±1 }`

---

## Component Hierarchy

```
index.html
├── #login-screen
│   └── .login-card
│       ├── h1 (title)
│       ├── select#user-select (6 options)
│       ├── input#password-input
│       ├── p#login-error
│       └── button#login-btn
│
├── #dashboard
│   ├── header.app-header
│   │   ├── h1
│   │   └── .header-actions
│   │       ├── span#current-user
│   │       ├── button#update-btn
│   │       ├── button#notify-btn
│   │       └── button#logout-btn
│   │
│   └── main.container
│       ├── section#admin-section (conditional)
│       │   ├── .admin-header (toggle)
│       │   └── .admin-body
│       │       ├── button#admin-test-btn
│       │       ├── #admin-schedule-editor
│       │       ├── button#admin-save-schedule
│       │       ├── ul#admin-announcements
│       │       ├── button#admin-clear-ann
│       │       ├── #admin-leaderboard
│       │       └── ul#admin-activity-log
│       │
│       ├── section.card (Broadcast)
│       │   ├── ul#announcements-list
│       │   └── p#announcements-empty
│       │
│       ├── section.card.trash-card
│       │   └── #trash-schedule
│       │
│       ├── section.card (Pending)
│       │   ├── h2 + #pending-count
│       │   ├── ul#pending-list
│       │   └── p#pending-empty
│       │
│       ├── section.card (Completed)
│       │   ├── h2 + #completed-count
│       │   ├── ul#completed-list
│       │   └── p#completed-empty
│       │
│       └── section.card (Leaderboard)
│           └── #leaderboard
│
├── #add-modal
│   └── .modal-card
│       ├── .tab-bar (Item | Announcement)
│       ├── #tab-item (form#add-form)
│       └── #tab-announce
│
├── #edit-modal
│   └── .modal-card
│       ├── input#edit-id (hidden)
│       ├── input#edit-title
│       ├── select#edit-category
│       ├── input#edit-emergency
│       └── buttons (Save | Cancel)
│
└── button#fab-btn (FAB)
```

---

## Task Item States & Styling

| State          | Border      | Background (Light) | Background (Dark) | Actions                     |
|----------------|-------------|--------------------|--------------------|------------------------------|
| Pending        | Default     | White              | #16162a            | 🙋 I'm on it, ✓, ✏️, ✕     |
| Pending+Urgent | Red, 2px    | #fef2f2 (pink)     | #2d1515            | 🙋 I'm on it, ✓, ✏️, ✕     |
| In-Progress    | Yellow, 2px | #fffbeb (warm)     | #292400            | ✓ Done (claimer only), ✏️, ✕|
| Completed      | Default     | White (opacity .7) | #16162a (opacity)  | ✕ only                      |
