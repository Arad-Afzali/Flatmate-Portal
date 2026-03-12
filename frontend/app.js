/* ============================================================
   Flatmate Portal — Frontend Logic
   ============================================================ */

// ── CONFIG ───────────────────────────────────────────────────
const API_BASE = 'https://flatmate-portal-worker.holimoli.workers.dev'; // no trailing slash
const VAPID_PUBLIC_KEY = 'BDbtLlG3btEkaUMeho4kFoh2fou-DZ9P1CydGzmMqE9IMfPsJsVjawIk1yyRHPKjLhNS3ySmdFRwTx_CJyQBU7g';
const ADMIN_USER = 'Arad';

const ALLOWED_USERS = ['Arad', 'Amir', 'Aien', 'Sattar', 'Ali', 'Gokol'];

// Trash schedule (same mapping as the Worker — keep in sync)
// Only 4 active days; remaining days map to null (no reminder).
const TRASH_SCHEDULE = {
  0: 'Aien',    // Sunday
  1: 'Ali',     // Monday
  2: null,      // Tuesday
  3: 'Amir',    // Wednesday
  4: 'Gokol',   // Thursday
  5: 'Sattar',  // Friday
  6: 'Arad',    // Saturday
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

let currentUser = null;
let authToken = null; // HMAC-signed token from the Worker

// ── Initialization ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  registerServiceWorker();
  init();
});

function init() {
  const saved = localStorage.getItem('flatmate_username');
  const token = localStorage.getItem('flatmate_token');
  if (saved && token && ALLOWED_USERS.includes(saved)) {
    currentUser = saved;
    authToken = token;
    showDashboard();
  } else {
    showLogin();
  }
}

// ── Service Worker Registration ──────────────────────────────
async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('service-worker.js');
    } catch (e) {
      console.warn('SW registration failed:', e);
    }
  }
}

// ── Login / Logout ───────────────────────────────────────────
function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');

  const sel   = document.getElementById('user-select');
  const pwd   = document.getElementById('password-input');
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');

  sel.value = '';
  pwd.value = '';
  err.classList.add('hidden');
  btn.disabled = true;

  const checkReady = () => { btn.disabled = !(sel.value && pwd.value); };
  sel.onchange = checkReady;
  pwd.oninput  = checkReady;

  // Allow submitting with Enter key from the password field
  pwd.onkeydown = (e) => { if (e.key === 'Enter' && !btn.disabled) btn.click(); };

  btn.onclick = async () => {
    const username = sel.value;
    const password = pwd.value;

    if (!username || !ALLOWED_USERS.includes(username)) return;

    btn.disabled = true;
    btn.textContent = 'Logging in…';

    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!data.success) {
        err.classList.remove('hidden');
        pwd.value = '';
        pwd.focus();
        return;
      }

      err.classList.add('hidden');
      localStorage.setItem('flatmate_username', username);
      localStorage.setItem('flatmate_token', data.token);
      currentUser = username;
      authToken = data.token;
      showDashboard();
    } catch (e) {
      err.textContent = 'Network error. Try again.';
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Login';
    }
  };
}

function logout() {
  localStorage.removeItem('flatmate_username');
  localStorage.removeItem('flatmate_token');
  currentUser = null;
  authToken = null;
  showLogin();
}

// ── Dashboard ────────────────────────────────────────────────
function showDashboard() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('current-user').textContent = currentUser;

  // Show admin panel only for Arad
  const adminSection = document.getElementById('admin-section');
  if (currentUser === ADMIN_USER) {
    adminSection.classList.remove('hidden');
    document.getElementById('admin-test-btn').onclick = adminTestNotify;
  } else {
    adminSection.classList.add('hidden');
  }

  // Wire up buttons
  document.getElementById('logout-btn').onclick = logout;
  document.getElementById('notify-btn').onclick = subscribeToNotifications;
  document.getElementById('add-form').onsubmit = addItem;
  document.getElementById('edit-save').onclick = saveEdit;
  document.getElementById('edit-cancel').onclick = closeEditModal;

  // Broadcast wiring
  document.getElementById('broadcast-btn').onclick = sendBroadcast;
  document.getElementById('broadcast-input').onkeydown = (e) => {
    if (e.key === 'Enter') sendBroadcast();
  };

  renderTrashSchedule();
  loadItems();
  loadAnnouncements();
}

// ── API Helpers ──────────────────────────────────────────────
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

// ── Load & Render Items ──────────────────────────────────────
async function loadItems() {
  try {
    const data = await api('/items');
    renderPending(data.pending || []);
    renderCompleted(data.completed || []);
    renderLeaderboard(data.leaderboard || {});
  } catch (e) {
    console.error('Failed to load items:', e);
  }
}

function renderPending(items) {
  const list = document.getElementById('pending-list');
  const empty = document.getElementById('pending-empty');
  document.getElementById('pending-count').textContent = items.length;

  if (items.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = items.map(t => {
    const isEmergency = t.is_emergency === 1;
    const emergencyIcon = isEmergency ? '<span class="emergency-icon">🚨</span>' : '';
    const tagClass = `tag-${t.category}`;
    const ago = timeAgo(t.created_at);

    return `
      <li class="task-item${isEmergency ? ' emergency' : ''}">
        <div class="task-header">
          <span class="task-title">${emergencyIcon}${escapeHtml(t.title)}</span>
          <div class="task-actions">
            <button class="btn-complete" onclick="completeItem(${t.id})" title="Complete">✓</button>
            <button onclick="openEditModal(${t.id}, '${escapeAttr(t.title)}', '${t.category}', ${isEmergency})" title="Edit">✏️</button>
            <button class="btn-delete" onclick="deleteItem(${t.id})" title="Delete">✕</button>
          </div>
        </div>
        <div class="task-meta">
          <span class="tag ${tagClass}">${t.category}</span>
          <span>by ${escapeHtml(t.requested_by)}</span>
          <span>${ago}</span>
        </div>
      </li>`;
  }).join('');
}

function renderCompleted(items) {
  const list = document.getElementById('completed-list');
  const empty = document.getElementById('completed-empty');
  document.getElementById('completed-count').textContent = items.length;

  if (items.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = items.map(t => `
    <li class="task-item" style="opacity:.7">
      <div class="task-header">
        <span class="task-title">${escapeHtml(t.title)}</span>
        <div class="task-actions">
          <button class="btn-delete" onclick="deleteItem(${t.id})" title="Delete">✕</button>
        </div>
      </div>
      <div class="task-meta">
        <span class="tag tag-${t.category}">${t.category}</span>
        <span>by ${escapeHtml(t.requested_by)}</span>
        <span>completed by ${escapeHtml(t.completed_by || '—')}</span>
      </div>
    </li>`).join('');
}

function renderLeaderboard(lb) {
  const el = document.getElementById('leaderboard');
  const sorted = Object.entries(lb).sort((a, b) => b[1] - a[1]);
  el.innerHTML = sorted.map(([name, count]) => `
    <div class="lb-entry">
      <span class="lb-name">${escapeHtml(name)}</span>
      <span class="lb-count">${count}</span>
    </div>`).join('');
}

// ── Add Item ─────────────────────────────────────────────────
async function addItem(e) {
  e.preventDefault();
  const title = document.getElementById('inp-title').value.trim();
  const category = document.getElementById('inp-category').value;
  const is_emergency = document.getElementById('inp-emergency').checked;

  if (!title) return;

  try {
    await api('/items', {
      method: 'POST',
      body: JSON.stringify({ title, category, is_emergency, username: currentUser }),
    });
    document.getElementById('inp-title').value = '';
    document.getElementById('inp-emergency').checked = false;
    loadItems();
  } catch (e) {
    console.error('Add failed:', e);
  }
}

// ── Complete / Delete ────────────────────────────────────────
async function completeItem(id) {
  try {
    await api(`/items/${id}/complete`, {
      method: 'PATCH',
      body: JSON.stringify({ username: currentUser }),
    });
    loadItems();
  } catch (e) {
    console.error('Complete failed:', e);
  }
}

async function deleteItem(id) {
  if (!confirm('Delete this item?')) return;
  try {
    await api(`/items/${id}`, { method: 'DELETE' });
    loadItems();
  } catch (e) {
    console.error('Delete failed:', e);
  }
}

// ── Edit Modal ───────────────────────────────────────────────
function openEditModal(id, title, category, isEmergency) {
  document.getElementById('edit-id').value = id;
  document.getElementById('edit-title').value = title;
  document.getElementById('edit-category').value = category;
  document.getElementById('edit-emergency').checked = isEmergency;
  document.getElementById('edit-modal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.add('hidden');
}

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const title = document.getElementById('edit-title').value.trim();
  const category = document.getElementById('edit-category').value;
  const is_emergency = document.getElementById('edit-emergency').checked;

  if (!title) return;

  try {
    await api(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, category, is_emergency, username: currentUser }),
    });
    closeEditModal();
    loadItems();
  } catch (e) {
    console.error('Edit failed:', e);
  }
}

// ── Trash Schedule ───────────────────────────────────────────
function renderTrashSchedule() {
  const tbody = document.querySelector('#trash-schedule tbody');
  const today = new Date().getDay();

  // Only render days that have an assigned person
  tbody.innerHTML = DAY_NAMES.map((day, i) => {
    const name = TRASH_SCHEDULE[i];
    if (!name) return '';
    const cls = i === today ? ' class="today"' : '';
    return `<tr${cls}><td>${day}</td><td>${escapeHtml(name)}${i === today ? ' ← today' : ''}</td></tr>`;
  }).join('');
}

// ── Admin Functions (Arad only) ──────────────────────────────
async function adminTestNotify() {
  const btn = document.getElementById('admin-test-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const res = await fetch(`${API_BASE}/admin/test-notify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();
    if (data.success) {
      showAdminStatus('Test notification sent to all subscribers ✓', 'success');
    } else {
      showAdminStatus('Failed: ' + (data.error || 'unknown error'), 'error');
    }
  } catch (e) {
    showAdminStatus('Network error', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🔔 Send Test Notification';
  }
}

// ── Broadcast (all users) ────────────────────────────────────
async function sendBroadcast() {
  const input = document.getElementById('broadcast-input');
  const msg = input.value.trim();
  if (!msg) return;

  const btn = document.getElementById('broadcast-btn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    const res = await fetch(`${API_BASE}/announcements`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message: msg }),
    });
    const data = await res.json();
    if (data.success) {
      input.value = '';
      loadAnnouncements();
    }
  } catch (e) {
    console.error('Broadcast failed:', e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
}

async function loadAnnouncements() {
  try {
    const data = await api('/announcements');
    renderAnnouncements(data.announcements || []);
  } catch (e) {
    console.error('Failed to load announcements:', e);
  }
}

function renderAnnouncements(items) {
  const list = document.getElementById('announcements-list');
  const empty = document.getElementById('announcements-empty');
  if (!items || items.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  list.innerHTML = items.map(a => {
    const long = a.message.length > 80;
    const preview = long ? escapeHtml(a.message.slice(0, 80)) + '…' : escapeHtml(a.message);
    const full = escapeHtml(a.message);
    return `
      <li class="announcement-item${long ? ' truncatable' : ''}" ${long ? "onclick=\"this.classList.toggle('expanded')\"" : ''}>
        <div class="ann-preview">${preview}</div>
        ${long ? `<div class="ann-full">${full}</div>` : ''}
        <div class="ann-meta">${escapeHtml(a.sent_by)} · ${timeAgo(a.created_at)}</div>
      </li>`;
  }).join('');
}

function showAdminStatus(msg, type) {
  const el = document.getElementById('admin-status');
  el.textContent = msg;
  el.className = 'admin-status ' + type;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ── Push Notification Opt‑in ─────────────────────────────────
async function subscribeToNotifications() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    alert('Push notifications are not supported in this browser.');
    return;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Notification permission denied.');
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    await api('/subscribe', {
      method: 'POST',
      body: JSON.stringify({ username: currentUser, subscription: subscription.toJSON() }),
    });

    alert('Notifications enabled! 🔔');
  } catch (e) {
    console.error('Push subscription failed:', e);
    alert('Could not enable notifications. Check console for details.');
  }
}

// ── Utilities ────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

function escapeHtml(str) {
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
