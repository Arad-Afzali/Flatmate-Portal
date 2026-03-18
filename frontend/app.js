/* ============================================================
   Flatmate Portal — Frontend Logic
   ============================================================ */

// ── CONFIG ───────────────────────────────────────────────────
const API_BASE = 'https://flatmate-portal-worker.holimoli.workers.dev'; // no trailing slash
const VAPID_PUBLIC_KEY = 'BDbtLlG3btEkaUMeho4kFoh2fou-DZ9P1CydGzmMqE9IMfPsJsVjawIk1yyRHPKjLhNS3ySmdFRwTx_CJyQBU7g';
const ADMIN_USER = 'Arad';

const ALLOWED_USERS = ['Arad', 'Amir', 'Aien', 'Sattar', 'Ali', 'Gokol'];

// Trash schedule — fetched from server for admin editing
// Fallback used if API not yet available
let trashSchedule = {
  1: 'Ali',     // Monday
  2: null,      // Tuesday
  3: 'Amir',    // Wednesday
  4: 'Gokol',   // Thursday
  5: 'Sattar',  // Friday
  6: 'Arad',    // Saturday
  0: 'Aien',    // Sunday
};

// Mon-Sun ordering for display
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  if (!('serviceWorker' in navigator)) return;

  let reg;
  try {
    reg = await navigator.serviceWorker.register('service-worker.js', { updateViaCache: 'none' });
  } catch (e) {
    console.warn('SW registration failed:', e);
    return;
  }

  const showUpdateBtn = () => {
    document.getElementById('update-btn').classList.remove('hidden');
  };

  // ── SW-based detection (works when service-worker.js itself changes) ──
  const checkWaiting = () => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdateBtn();
  };
  checkWaiting();
  reg.addEventListener('updatefound', () => {
    const newSW = reg.installing;
    if (!newSW) return;
    newSW.addEventListener('statechange', () => {
      if (newSW.state === 'installed' && navigator.serviceWorker.controller) showUpdateBtn();
    });
  });
  try { await reg.update(); checkWaiting(); } catch (e) {}

  // ── Wire update button ────────────────────────────────────────────────
  document.getElementById('update-btn').onclick = async () => {
    // If SW has a waiting update, activate it first
    if (reg.waiting) {
      reg.waiting.postMessage('SKIP_WAITING');
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      }, { once: true });
      return;
    }

    // Otherwise unregister SW, clear all caches, and do a hard reload
    try {
      await reg.unregister();
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    } catch (e) {}
    window.location.reload();
  };
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
    document.getElementById('admin-toggle').onclick = toggleAdminPanel;
    document.getElementById('admin-test-btn').onclick = adminTestNotify;
    document.getElementById('admin-save-schedule').onclick = adminSaveSchedule;
    document.getElementById('admin-clear-ann').onclick = adminClearAnnouncements;
  } else {
    adminSection.classList.add('hidden');
  }

  // Wire up buttons
  document.getElementById('logout-btn').onclick = logout;
  document.getElementById('notify-btn').onclick = subscribeToNotifications;
  document.getElementById('add-form').onsubmit = addItem;
  document.getElementById('edit-save').onclick = saveEdit;
  document.getElementById('edit-cancel').onclick = closeEditModal;

  // FAB & Add Modal
  document.getElementById('fab-btn').onclick = openAddModal;
  document.getElementById('add-modal-close').onclick = closeAddModal;
  document.getElementById('add-modal').onclick = (e) => {
    if (e.target === document.getElementById('add-modal')) closeAddModal();
  };
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-item').classList.toggle('hidden', btn.dataset.tab !== 'item');
      document.getElementById('tab-announce').classList.toggle('hidden', btn.dataset.tab !== 'announce');
    };
  });

  // Broadcast wiring
  document.getElementById('broadcast-btn').onclick = sendBroadcast;
  document.getElementById('broadcast-input').onkeydown = (e) => {
    if (e.key === 'Enter') sendBroadcast();
  };

  renderTrashSchedule();
  loadItems();
  loadAnnouncements();
  loadScheduleFromServer();
}

// ── API Helpers ──────────────────────────────────────────────
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
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
    const inProgress = t.status === 'in_progress';
    const pickedBy = t.picked_up_by || '';

    let actionBtn;
    if (inProgress && pickedBy === currentUser) {
      actionBtn = `<button class="btn-complete" onclick="completeItem(${t.id})" title="Complete">✓ Done</button>`;
    } else if (inProgress) {
      actionBtn = '';
    } else {
      actionBtn = `<button class="btn-imonit" onclick="pickUpItem(${t.id})" title="I'm on it!">🙋 I'm on it!</button>`;
    }

    const progressBadge = inProgress
      ? `<span class="badge-inprogress">⏳ ${escapeHtml(pickedBy)} is on it!</span>`
      : '';

    return `
      <li class="task-item${isEmergency ? ' emergency' : ''}${inProgress ? ' in-progress' : ''}">
        <div class="task-header">
          <span class="task-title">${emergencyIcon}${escapeHtml(t.title)}</span>
          <div class="task-actions">
            ${actionBtn}
            ${!inProgress ? `<button class="btn-complete" onclick="completeItem(${t.id})" title="Complete">✓</button>` : ''}
            <button onclick="openEditModal(${t.id}, '${escapeAttr(t.title)}', '${t.category}', ${isEmergency})" title="Edit">✏️</button>
            <button class="btn-delete" onclick="deleteItem(${t.id})" title="Delete">✕</button>
          </div>
        </div>
        ${progressBadge}
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
function openAddModal() {
  document.getElementById('add-modal').classList.remove('hidden');
}
function closeAddModal() {
  document.getElementById('add-modal').classList.add('hidden');
}

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
    closeAddModal();
    loadItems();
  } catch (e) {
    console.error('Add failed:', e);
  }
}

// ── Pick Up / Complete / Delete ──────────────────────────────
async function pickUpItem(id) {
  try {
    await api(`/items/${id}/pickup`, {
      method: 'PATCH',
      body: JSON.stringify({ username: currentUser }),
    });
    loadItems();
  } catch (e) {
    console.error('Pickup failed:', e);
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
  const container = document.getElementById('trash-schedule');
  const today = new Date().getDay();
  container.innerHTML = DAY_ORDER.filter(i => trashSchedule[i]).map(i => {
    const name = trashSchedule[i];
    const isToday = i === today;
    const label = DAY_NAMES[i];
    return `<div class="trash-pill${isToday ? ' today' : ''}">
      <span class="tp-day">${label}</span><span class="tp-name">${escapeHtml(name)}</span></div>`;
  }).join('');
}

async function loadScheduleFromServer() {
  try {
    const data = await api('/admin/schedule');
    if (data.schedule) {
      trashSchedule = data.schedule;
      renderTrashSchedule();
      if (currentUser === ADMIN_USER) renderAdminScheduleEditor();
    }
  } catch (e) { /* use defaults */ }
}

// ── Admin Functions (Arad only) ──────────────────────────────
function toggleAdminPanel() {
  const body = document.getElementById('admin-body');
  const arrow = document.getElementById('admin-arrow');
  body.classList.toggle('hidden');
  arrow.textContent = body.classList.contains('hidden') ? '▶' : '▼';
  if (!body.classList.contains('hidden')) {
    renderAdminScheduleEditor();
    renderAdminAnnouncements();
    renderAdminLeaderboard();
    renderAdminActivityLog();
  }
}

function renderAdminScheduleEditor() {
  const grid = document.getElementById('admin-schedule-editor');
  grid.innerHTML = DAY_ORDER.map(i => {
    const label = DAY_NAMES[i];
    const val = trashSchedule[i] || '';
    return `<div class="asg-row">
      <label class="asg-label">${label}</label>
      <select class="asg-select" data-day="${i}">
        <option value="">— none —</option>
        ${ALLOWED_USERS.map(u => `<option value="${u}"${u === val ? ' selected' : ''}>${u}</option>`).join('')}
      </select>
    </div>`;
  }).join('');
}

async function adminSaveSchedule() {
  const selects = document.querySelectorAll('.asg-select');
  const schedule = {};
  selects.forEach(s => {
    schedule[s.dataset.day] = s.value || null;
  });
  const btn = document.getElementById('admin-save-schedule');
  btn.disabled = true;
  try {
    const res = await fetch(`${API_BASE}/admin/schedule`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule }),
    });
    const data = await res.json();
    if (data.success) {
      trashSchedule = schedule;
      renderTrashSchedule();
      showAdminStatus('Schedule saved ✓', 'success');
    } else {
      showAdminStatus('Failed: ' + (data.error || 'unknown'), 'error');
    }
  } catch (e) { showAdminStatus('Network error', 'error'); }
  finally { btn.disabled = false; }
}

function renderAdminAnnouncements() {
  const list = document.getElementById('admin-announcements');
  // reuse the loaded data from the broadcast section
  const items = document.querySelectorAll('#announcements-list .announcement-item');
  if (!items.length) { list.innerHTML = '<li class="empty-msg">No broadcasts</li>'; return; }
  // re-fetch to get IDs
  api('/announcements').then(data => {
    const anns = data.announcements || [];
    if (!anns.length) { list.innerHTML = '<li class="empty-msg">No broadcasts</li>'; return; }
    list.innerHTML = anns.map(a => `
      <li class="admin-ann-item">
        <span class="admin-ann-text">${escapeHtml(a.message.slice(0, 60))}${a.message.length > 60 ? '…' : ''}</span>
        <button class="btn-admin-sm btn-admin-danger" onclick="adminDeleteAnnouncement(${a.id})">✕</button>
      </li>`).join('');
  });
}

async function adminDeleteAnnouncement(id) {
  try {
    await fetch(`${API_BASE}/admin/announcements/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    loadAnnouncements();
    setTimeout(renderAdminAnnouncements, 300);
  } catch (e) { console.error(e); }
}

async function adminClearAnnouncements() {
  if (!confirm('Clear ALL broadcasts?')) return;
  try {
    await fetch(`${API_BASE}/admin/announcements`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    loadAnnouncements();
    setTimeout(renderAdminAnnouncements, 300);
    showAdminStatus('All broadcasts cleared ✓', 'success');
  } catch (e) { showAdminStatus('Network error', 'error'); }
}

// ── Admin Leaderboard Management ─────────────────────────────
async function renderAdminLeaderboard() {
  const grid = document.getElementById('admin-leaderboard');
  try {
    const res = await fetch(`${API_BASE}/admin/leaderboard`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    const data = await res.json();
    const scores = data.scores || {};
    grid.innerHTML = ALLOWED_USERS.map(u => `
      <div class="admin-lb-row">
        <span class="admin-lb-name">${escapeHtml(u)}</span>
        <span class="admin-lb-score">${scores[u] || 0}</span>
        <button class="btn-admin-sm" onclick="adminAdjustScore('${u}', -1)">−</button>
        <button class="btn-admin-sm" onclick="adminAdjustScore('${u}', 1)">+</button>
      </div>`).join('');
  } catch (e) { grid.innerHTML = '<p class="empty-msg">Failed to load</p>'; }
}

async function adminAdjustScore(username, delta) {
  try {
    await fetch(`${API_BASE}/admin/leaderboard`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, delta }),
    });
    renderAdminLeaderboard();
    loadItems(); // refresh main leaderboard too
  } catch (e) { showAdminStatus('Network error', 'error'); }
}



// ── Admin Activity Log ───────────────────────────────────────
async function renderAdminActivityLog() {
  const list = document.getElementById('admin-activity-log');
  try {
    const res = await fetch(`${API_BASE}/admin/activity-log`, {
      headers: { 'Authorization': `Bearer ${authToken}` },
    });
    const data = await res.json();
    const activities = data.activities || [];
    if (!activities.length) { list.innerHTML = '<li class="empty-msg">No activity yet</li>'; return; }
    list.innerHTML = activities.map(a => `
      <li class="admin-activity-item">
        <span class="admin-act-user">${escapeHtml(a.username)}</span>
        <span class="admin-act-action">${escapeHtml(a.action)}</span>
        <span class="admin-act-detail">${escapeHtml((a.detail || '').slice(0, 60))}</span>
        <span class="admin-act-time">${timeAgo(a.created_at)}</span>
      </li>`).join('');
  } catch (e) { list.innerHTML = '<li class="empty-msg">Failed to load</li>'; }
}

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
      closeAddModal();
      loadAnnouncements();
    }
  } catch (e) {
    console.error('Broadcast failed:', e);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send Announcement';
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
    const preview = long ? escapeHtml(a.message.slice(0, 80)) + '… <span class="read-more">read more</span>' : escapeHtml(a.message);
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
