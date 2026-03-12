// ============================================================
// Flatmate Portal — Cloudflare Worker (ES Modules)
// ============================================================

const ALLOWED_USERS = ['Arad', 'Amir', 'Aien', 'Sattar', 'Ali', 'Gokol'];

// ── Trash‑day schedule (day‑of‑week → flatmate) ─────────────
// 0 = Sunday … 6 = Saturday
const TRASH_SCHEDULE = {
  0: 'Aien',    // Sunday
  1: 'Ali',     // Monday
  2: null,      // Tuesday  — no collection
  3: 'Amir',    // Wednesday
  4: 'Gokol',   // Thursday
  5: 'Sattar',  // Friday
  6: 'Arad',    // Saturday
};

// ── Base64‑URL helpers ───────────────────────────────────────
function toB64Url(buf) {
  const arr = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64Url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// ── CORS ─────────────────────────────────────────────────────
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function handleOptions() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// ── VAPID JWT (ES256) ────────────────────────────────────────
async function createVapidJwt(endpoint, env) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const enc = new TextEncoder();

  const header = toB64Url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const payload = toB64Url(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub: env.VAPID_SUBJECT, // e.g. "mailto:you@example.com"
  })));

  const unsigned = `${header}.${payload}`;

  // Build JWK from raw VAPID keys
  const pubBytes = fromB64Url(env.VAPID_PUBLIC_KEY);
  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    x: toB64Url(pubBytes.slice(1, 33)),
    y: toB64Url(pubBytes.slice(33, 65)),
    d: env.VAPID_PRIVATE_KEY, // base64url 32‑byte scalar
  };

  const key = await crypto.subtle.importKey(
    'jwk', jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false, ['sign'],
  );

  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(unsigned),
  );

  return `${unsigned}.${toB64Url(sig)}`;
}

// ── Web Push Payload Encryption (RFC 8291 / aes128gcm) ──────
async function encryptPayload(plaintextStr, p256dhB64, authB64) {
  const clientPubBytes = fromB64Url(p256dhB64);
  const authSecret = fromB64Url(authB64);
  const plaintext = new TextEncoder().encode(plaintextStr);

  // 1. Ephemeral ECDH key pair
  const serverKeys = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  );
  const serverPubRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeys.publicKey),
  );

  // 2. Import client public key & derive shared secret
  const clientPubKey = await crypto.subtle.importKey(
    'raw', clientPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: clientPubKey }, serverKeys.privateKey, 256,
    ),
  );

  // 3. HKDF — derive IKM using auth secret
  const keyInfoBuf = new Uint8Array([
    ...new TextEncoder().encode('WebPush: info\0'),
    ...clientPubBytes,
    ...serverPubRaw,
  ]);
  const ikmKey = await crypto.subtle.importKey('raw', sharedSecret, { name: 'HKDF' }, false, ['deriveBits']);
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: authSecret, info: keyInfoBuf }, ikmKey, 256,
    ),
  );

  // 4. Random salt, then derive CEK + nonce
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prkKey = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);

  const cek = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: aes128gcm\0') },
      prkKey, 128,
    ),
  );
  const nonce = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode('Content-Encoding: nonce\0') },
      prkKey, 96,
    ),
  );

  // 5. Pad plaintext (content ‖ 0x02 delimiter for last record)
  const padded = new Uint8Array(plaintext.length + 1);
  padded.set(plaintext);
  padded[plaintext.length] = 0x02;

  // 6. AES‑128‑GCM encrypt
  const encKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, encKey, padded),
  );

  // 7. Build aes128gcm body: salt(16) ‖ rs(4) ‖ idlen(1) ‖ keyid(65) ‖ ciphertext
  const header = new Uint8Array(86); // 16 + 4 + 1 + 65
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096); // record size
  header[20] = 65; // idlen = length of uncompressed public key
  header.set(serverPubRaw, 21);

  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header);
  body.set(ciphertext, header.length);
  return body;
}

// ── Send push to ONE subscription ────────────────────────────
async function sendPush(subscriptionJSON, payload, env) {
  try {
    const sub = JSON.parse(subscriptionJSON);
    const payloadStr = JSON.stringify(payload);
    const jwt = await createVapidJwt(sub.endpoint, env);
    const body = await encryptPayload(payloadStr, sub.keys.p256dh, sub.keys.auth);

    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: '86400',
        Urgency: payload.isEmergency ? 'high' : 'normal',
      },
      body,
    });

    // 404 / 410 → subscription expired; clean up
    if (res.status === 404 || res.status === 410) {
      await env.DB.prepare('DELETE FROM push_subscriptions WHERE subscription_object = ?')
        .bind(subscriptionJSON).run();
    }
    return res.status;
  } catch (e) {
    console.error('sendPush error:', e);
    return 0;
  }
}

// ── Broadcast to ALL subscribers ─────────────────────────────
async function broadcastPush(db, payload, env) {
  const { results } = await db.prepare('SELECT subscription_object FROM push_subscriptions').all();
  if (!results || results.length === 0) return;
  await Promise.allSettled(
    results.map(r => sendPush(r.subscription_object, payload, env)),
  );
}

// ── Targeted push to a specific user ─────────────────────────
async function targetedPush(db, username, payload, env) {
  const row = await db.prepare('SELECT subscription_object FROM push_subscriptions WHERE username = ?')
    .bind(username).first();
  if (row) await sendPush(row.subscription_object, payload, env);
}

// ── Session Token (HMAC-SHA256) ──────────────────────────────
async function createToken(username, env) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(env.ADMIN_TOKEN), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(username));
  return `${username}.${toB64Url(sig)}`;
}

async function verifyToken(token, env) {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const username = token.slice(0, dot);
  const expected = await createToken(username, env);
  if (token !== expected) return null;
  if (!ALLOWED_USERS.includes(username)) return null;
  return username;
}

async function getUserFromRequest(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return verifyToken(token, env);
}

// ── Request Router ───────────────────────────────────────────
async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const method = request.method;
  const path = url.pathname;

  if (method === 'OPTIONS') return handleOptions();

  const db = env.DB;

  // ── POST /login ─────────────────────────────────────────
  if (method === 'POST' && path === '/login') {
    const body = await request.json();
    const { username, password } = body;
    if (!username || !password) return json({ error: 'username and password required' }, 400);
    if (!ALLOWED_USERS.includes(username)) return json({ error: 'Invalid credentials' }, 401);

    // Passwords stored as JSON secret: { "Arad": "...", ... }
    let passwords;
    try { passwords = JSON.parse(env.USER_PASSWORDS); } catch { return json({ error: 'Server config error' }, 500); }

    if (passwords[username] !== password) return json({ error: 'Invalid credentials' }, 401);

    const token = await createToken(username, env);
    return json({ success: true, username, token, isAdmin: username === 'Arad' });
  }

  // ── GET /items ──────────────────────────────────────────
  if (method === 'GET' && path === '/items') {
    const pending = await db.prepare(
      "SELECT * FROM tasks WHERE status = 'pending' ORDER BY is_emergency DESC, created_at DESC"
    ).all();
    const completed = await db.prepare(
      "SELECT * FROM tasks WHERE status = 'completed' ORDER BY created_at DESC"
    ).all();

    // Leaderboard: count completed items per user
    const lb = await db.prepare(
      "SELECT completed_by AS user, COUNT(*) AS count FROM tasks WHERE status = 'completed' AND completed_by IS NOT NULL GROUP BY completed_by"
    ).all();
    const leaderboard = {};
    for (const u of ALLOWED_USERS) leaderboard[u] = 0;
    for (const row of (lb.results || [])) leaderboard[row.user] = row.count;

    return json({ pending: pending.results || [], completed: completed.results || [], leaderboard });
  }

  // ── POST /items ─────────────────────────────────────────
  if (method === 'POST' && path === '/items') {
    const body = await request.json();
    const { title, category, is_emergency, username } = body;

    if (!title || !username) return json({ error: 'title and username required' }, 400);
    if (!ALLOWED_USERS.includes(username)) return json({ error: 'User not allowed' }, 403);

    const cat = ['grocery', 'repair', 'general'].includes(category) ? category : 'general';
    const emergency = is_emergency ? 1 : 0;

    const result = await db.prepare(
      'INSERT INTO tasks (title, category, is_emergency, requested_by) VALUES (?, ?, ?, ?)'
    ).bind(title, cat, emergency, username).run();

    // Broadcast notification
    const emoji = emergency ? '🚨' : '📋';
    ctx.waitUntil(broadcastPush(db, {
      title: `${emoji} New Item Added`,
      body: `${username} added: ${title}`,
      isEmergency: !!emergency,
    }, env));

    return json({ success: true, id: result.meta.last_row_id }, 201);
  }

  // ── PUT /items/:id ──────────────────────────────────────
  const putMatch = path.match(/^\/items\/(\d+)$/);
  if (method === 'PUT' && putMatch) {
    const id = parseInt(putMatch[1], 10);
    const body = await request.json();
    const { title, category, is_emergency, username } = body;

    if (!username || !ALLOWED_USERS.includes(username)) return json({ error: 'Valid username required' }, 403);

    const fields = [];
    const values = [];
    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (category !== undefined) { fields.push('category = ?'); values.push(category); }
    if (is_emergency !== undefined) { fields.push('is_emergency = ?'); values.push(is_emergency ? 1 : 0); }

    if (fields.length === 0) return json({ error: 'Nothing to update' }, 400);

    values.push(id);
    await db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).bind(...values).run();

    ctx.waitUntil(broadcastPush(db, {
      title: '✏️ Item Updated',
      body: `${username} updated an item`,
      isEmergency: false,
    }, env));

    return json({ success: true });
  }

  // ── PATCH /items/:id/complete ───────────────────────────
  const patchMatch = path.match(/^\/items\/(\d+)\/complete$/);
  if (method === 'PATCH' && patchMatch) {
    const id = parseInt(patchMatch[1], 10);
    const body = await request.json();
    const { username } = body;

    if (!username || !ALLOWED_USERS.includes(username)) return json({ error: 'Valid username required' }, 403);

    await db.prepare(
      "UPDATE tasks SET status = 'completed', completed_by = ? WHERE id = ?"
    ).bind(username, id).run();

    return json({ success: true });
  }

  // ── DELETE /items/:id ───────────────────────────────────
  const delMatch = path.match(/^\/items\/(\d+)$/);
  if (method === 'DELETE' && delMatch) {
    const id = parseInt(delMatch[1], 10);
    await db.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
    return json({ success: true });
  }

  // ── POST /admin/test-notify ────────────────────────────
  if (method === 'POST' && path === '/admin/test-notify') {
    const user = await getUserFromRequest(request, env);
    if (user !== 'Arad') return json({ error: 'Unauthorized' }, 401);
    await broadcastPush(db, {
      title: '🔔 Test Notification',
      body: 'Push notifications are working correctly!',
      isEmergency: false,
    }, env);
    return json({ success: true, message: 'Test notification sent to all subscribers' });
  }
  // ── POST /admin/announce ─────────────────────────────────
  if (method === 'POST' && path === '/admin/announce') {
    const user = await getUserFromRequest(request, env);
    if (user !== 'Arad') return json({ error: 'Unauthorized' }, 401);
    const body = await request.json();
    const message = (body.message || '').trim().slice(0, 200);
    if (!message) return json({ error: 'message required' }, 400);
    await broadcastPush(db, {
      title: '📢 Announcement',
      body: message,
      isEmergency: false,
    }, env);
    return json({ success: true });
  }
  // ── POST /subscribe ────────────────────────────────────
  if (method === 'POST' && path === '/subscribe') {
    const body = await request.json();
    const { username, subscription } = body;

    if (!username || !ALLOWED_USERS.includes(username)) return json({ error: 'Valid username required' }, 403);
    if (!subscription || !subscription.endpoint) return json({ error: 'Invalid subscription' }, 400);

    const subStr = JSON.stringify(subscription);
    await db.prepare(
      'INSERT INTO push_subscriptions (username, subscription_object) VALUES (?, ?) ON CONFLICT(username) DO UPDATE SET subscription_object = excluded.subscription_object'
    ).bind(username, subStr).run();

    return json({ success: true });
  }

  return json({ error: 'Not Found' }, 404);
}

// ── Worker Export ────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (err) {
      console.error('Worker error:', err);
      return json({ error: 'Internal Server Error' }, 500);
    }
  },

  // ── Cron Trigger — Trash Reminder ────────────────────────
  async scheduled(event, env, ctx) {
    const day = new Date().getDay(); // 0‑6
    const username = TRASH_SCHEDULE[day];
    if (!username) return;

    await targetedPush(env.DB, username, {
      title: '🗑️ Trash Reminder',
      body: `Hey ${username}, it's your turn to take out the trash today!`,
      isEmergency: false,
    }, env);
  },
};
