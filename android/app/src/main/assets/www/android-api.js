/* ============================================================
 * YiStarLine Account Unified App · Android 本地后端
 * 在 WebView 内实现与桌面版一致的 HTTP API，数据存于应用私有 localStorage。
 * 桌面版使用 Python + SQLite；Android 版使用纯 JS + localStorage + PBKDF2。
 * ============================================================ */
(function (global) {
  'use strict';

  global.YAUA_ANDROID = true;

  var DB_KEY = 'yaua.db.v1';
  var TOKEN_KEY = 'yaua.token';
  var DEVICE_KEY = 'yaua.device';
  var ITERATIONS = 120000;
  var VERSION = '1.2.0';

  /* ---------------------------------------------------------- 基础工具 */
  function now() { return Math.floor(Date.now() / 1000); }
  function uid() {
    var bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function randB64(n) {
    var bytes = new Uint8Array(n);
    crypto.getRandomValues(bytes);
    var text = '';
    for (var i = 0; i < bytes.length; i += 1) text += String.fromCharCode(bytes[i]);
    return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function enc(text) { return new TextEncoder().encode(text); }
  function hex(buf) {
    return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  /* ---------------------------------------------------------- SHA-256 兜底 */
  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];
  function sha256Hex(text) {
    var bytes = enc(text);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var l = bytes.length;
    var padded = new Uint8Array(((l + 9 + 63) >> 6) << 6);
    padded.set(bytes);
    padded[l] = 0x80;
    var bitLen = l * 8;
    var dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 4, bitLen >>> 0, false);
    dv.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000), false);
    var w = new Uint32Array(64);
    for (var off = 0; off < padded.length; off += 64) {
      for (var i = 0; i < 16; i += 1) w[i] = dv.getUint32(off + i * 4, false);
      for (i = 16; i < 64; i += 1) {
        var s0 = ((w[i - 15] >>> 7) | (w[i - 15] << 25)) ^ ((w[i - 15] >>> 18) | (w[i - 15] << 14)) ^ (w[i - 15] >>> 3);
        var s1 = ((w[i - 2] >>> 17) | (w[i - 2] << 15)) ^ ((w[i - 2] >>> 19) | (w[i - 2] << 13)) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i += 1) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
      H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
    }
    return H.map(function (x) { return ('00000000' + x.toString(16)).slice(-8); }).join('');
  }
  async function digest(text) {
    if (global.crypto && crypto.subtle) {
      return hex(await crypto.subtle.digest('SHA-256', enc(text)));
    }
    return sha256Hex(text);
  }
  async function hashPassword(password, saltB64, username) {
    var material = (username ? username.toLowerCase() + '\u0000' : '') + password;
    if (global.crypto && crypto.subtle) {
      var key = await crypto.subtle.importKey('raw', enc(material), 'PBKDF2', false, ['deriveBits']);
      var bits = await crypto.subtle.deriveBits({
        name: 'PBKDF2', salt: enc(saltB64), iterations: ITERATIONS, hash: 'SHA-256'
      }, key, 256);
      return 'pbkdf2$' + ITERATIONS + '$' + saltB64 + '$' + hex(bits);
    }
    var out = sha256Hex(saltB64 + '|' + material);
    for (var i = 0; i < 15000; i += 1) out = sha256Hex(out + '|' + saltB64);
    return 'js$' + saltB64 + '$' + out;
  }
  async function verifyPassword(password, stored, username) {
    var parts = (stored || '').split('$');
    if (parts[0] === 'pbkdf2') {
      var computed = await hashPassword(password, parts[2], username);
      return computed.split('$')[3] === parts[3];
    }
    if (parts[0] === 'js') {
      var material = (username ? username.toLowerCase() + '\u0000' : '') + password;
      var out = sha256Hex(parts[1] + '|' + material);
      for (var i = 0; i < 15000; i += 1) out = sha256Hex(out + '|' + parts[1]);
      return out === parts[2];
    }
    return false;
  }
  async function hashRecovery(code) {
    return digest('yaua-recovery|' + code);
  }

  /* ---------------------------------------------------------- 存储 */
  function emptyDb() {
    return {
      v: 1, users: [], sessions: [], apps: [], grants: [],
      tickets: [], tokens: [], devices: [], audit: [], meta: { created_at: now() }
    };
  }
  function load() {
    try {
      var raw = localStorage.getItem(DB_KEY);
      if (!raw) return emptyDb();
      var db = JSON.parse(raw);
      if (!db || !db.users) return emptyDb();
      return db;
    } catch (err) { return emptyDb(); }
  }
  function save(db) {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); return true; } catch (err) { return false; }
  }
  function audit(db, event, user, appId, detail) {
    db.audit.unshift({
      id: uid(), ts: now(), event: event,
      user_id: user ? user.id : null, username: user ? user.username : null,
      app_id: appId || null, ip: '127.0.0.1', ua: navigator.userAgent.slice(0, 160), detail: detail || ''
    });
    if (db.audit.length > 2000) db.audit.length = 2000;
  }
  function publicUser(user) {
    return user ? {
      id: user.id, username: user.username, display_name: user.display_name,
      email: user.email || '', created_at: user.created_at
    } : null;
  }
  function findUser(db, username) {
    var key = String(username || '').toLowerCase();
    for (var i = 0; i < db.users.length; i += 1) {
      if (db.users[i].username_lower === key) return db.users[i];
    }
    return null;
  }
  function findUserById(db, id) {
    for (var i = 0; i < db.users.length; i += 1) if (db.users[i].id === id) return db.users[i];
    return null;
  }
  function findApp(db, appId) {
    for (var i = 0; i < db.apps.length; i += 1) if (db.apps[i].app_id === appId) return db.apps[i];
    return null;
  }

  /* ---------------------------------------------------------- 会话 */
  async function currentSession(db) {
    var token = null;
    try { token = localStorage.getItem(TOKEN_KEY); } catch (err) { token = null; }
    if (!token) return null;
    var hash = await digest(token);
    for (var i = 0; i < db.sessions.length; i += 1) {
      var s = db.sessions[i];
      if (s.token_hash === hash && !s.revoked_at && s.expires_at > now()) {
        s.last_seen_at = now();
        return s;
      }
    }
    return null;
  }
  async function currentUser(db) {
    var session = await currentSession(db);
    if (!session) return null;
    var user = findUserById(db, session.user_id);
    if (!user || user.status === 'disabled') return null;
    return user;
  }
  async function issueSession(db, user, remember) {
    var token = 'yls_' + randB64(32);
    var ttl = remember ? 30 * 86400 : 7 * 86400;
    db.sessions.push({
      id: uid(), user_id: user.id, token_hash: await digest(token), created_at: now(),
      last_seen_at: now(), expires_at: now() + ttl, ua: navigator.userAgent.slice(0, 160),
      ip: '127.0.0.1', remember: remember ? 1 : 0, revoked_at: null
    });
    user.last_login_at = now();
    try { localStorage.setItem(TOKEN_KEY, token); } catch (err) { /* ignore */ }
    if (remember) {
      var deviceToken = 'yld_' + randB64(32);
      db.devices = db.devices || [];
      db.devices.push({
        id: uid(), user_id: user.id, token_hash: await digest(deviceToken),
        created_at: now(), last_used_at: now(), expires_at: now() + 90 * 86400,
        revoked_at: null, ua: navigator.userAgent.slice(0, 160)
      });
      try { localStorage.setItem(DEVICE_KEY, deviceToken); } catch (err) { /* ignore */ }
    }
    return token;
  }

  async function trustedDevice(db) {
    var token = null;
    try { token = localStorage.getItem(DEVICE_KEY); } catch (err) { token = null; }
    if (!token) return null;
    var hash = await digest(token);
    var devices = db.devices || [];
    for (var i = 0; i < devices.length; i += 1) {
      var device = devices[i];
      if (device.token_hash === hash && !device.revoked_at && device.expires_at > now()) return device;
    }
    return null;
  }

  /* ---------------------------------------------------------- 校验 */
  function checkUsername(value) {
    var name = String(value || '').trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9_.\-]{2,23}$/.test(name)) {
      return { error: 'invalid_username', message: '用户名格式不正确' };
    }
    return { value: name };
  }
  function checkPassword(value) {
    var pw = String(value || '');
    if (pw.length < 8) return { error: 'weak_password', message: '密码至少需要 8 位字符' };
    if (pw.length > 200) return { error: 'weak_password', message: '密码过长' };
    return { value: pw };
  }
  function checkEmail(value) {
    var email = String(value || '').trim();
    if (!email) return { value: '' };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'invalid_email', message: '邮箱格式不正确' };
    return { value: email };
  }
  function normalizeCode(code) {
    return String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
      .replace(/O/g, '0').replace(/I/g, '1').replace(/L/g, '1').replace(/U/g, 'V');
  }
  function randomRecoveryCode() {
    var alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    var bytes = new Uint8Array(20);
    crypto.getRandomValues(bytes);
    var chars = '';
    for (var i = 0; i < 20; i += 1) chars += alphabet[bytes[i] % 32];
    return [chars.slice(0, 5), chars.slice(5, 10), chars.slice(10, 15), chars.slice(15, 20)].join('-');
  }

  /* ---------------------------------------------------------- 业务 */
  var api = {};

  async function requireUser(db) {
    var user = await currentUser(db);
    if (!user) return { error: { status: 401, code: 'unauthenticated', message: '登录状态已失效，请重新登录' } };
    return { user: user, session: await currentSession(db) };
  }
  function fail(status, code, message) {
    return { status: status, data: { ok: false, error: { code: code, message: message } } };
  }
  function ok(data, status) {
    return { status: status || 200, data: Object.assign({ ok: true }, data || {}) };
  }

  api['GET /api/public/config'] = async function () {
    var db = load();
    return ok({
      name: 'YiStarLine Account', full_name: 'YiStarLine Account Unified App', mark: 'YAUA',
      version: VERSION, protocol: '1', has_users: db.users.length > 0,
      allow_register: true, demo_app_id: '', base_url: 'http://localhost', platform: 'android'
    });
  };
  api['GET /api/auth/session'] = async function () {
    var db = load();
    var user = await currentUser(db);
    var payload = { user: publicUser(user), recovery_codes_left: 0, developer: false };
    if (user) {
      payload.recovery_codes_left = (user.recovery || []).filter(function (c) { return !c.used_at; }).length;
      payload.developer = !!user.developer_unlocked;
      var session = await currentSession(db);
      if (session) payload.session = { id: session.id, created_at: session.created_at, expires_at: session.expires_at, remember: !!session.remember };
      save(db);
    }
    return ok(payload);
  };
  api['GET /api/public/accounts'] = async function () {
    var db = load();
    var items = db.users.map(function (user) {
      return {
        username: user.username,
        display_name: user.display_name || user.username,
        last_login_at: user.last_login_at || 0
      };
    }).sort(function (a, b) { return (b.last_login_at || 0) - (a.last_login_at || 0); });
    var device = await trustedDevice(db);
    var deviceUsername = null;
    if (device) {
      var owner = findUserById(db, device.user_id);
      if (owner) deviceUsername = owner.username;
    }
    return ok({ items: items.slice(0, 8), device_username: deviceUsername });
  };

  api['POST /api/auth/quick'] = async function () {
    var db = load();
    var device = await trustedDevice(db);
    if (!device) return fail(401, 'device_untrusted', '此设备没有可用的快捷登录凭据，请使用密码登录');
    var user = findUserById(db, device.user_id);
    if (!user || user.status === 'disabled') return fail(401, 'device_untrusted', '账户不可用，请使用密码登录');
    device.last_used_at = now();
    await issueSession(db, user, true);
    audit(db, 'quick_login', user, null, '');
    save(db);
    return ok({
      user: publicUser(user),
      recovery_codes_left: (user.recovery || []).filter(function (c) { return !c.used_at; }).length
    });
  };

  api['POST /api/auth/register'] = async function (body) {
    var db = load();
    var name = checkUsername(body.username);
    if (name.error) return fail(400, name.error, name.message);
    if (findUser(db, name.value)) return fail(400, 'username_taken', '该用户名已被注册');
    var pw = checkPassword(body.password);
    if (pw.error) return fail(400, pw.error, pw.message);
    var email = checkEmail(body.email);
    if (email.error) return fail(400, email.error, email.message);
    var salt = randB64(16);
    var user = {
      id: uid(), username: name.value, username_lower: name.value.toLowerCase(),
      display_name: String(body.display_name || '').trim() || name.value,
      email: email.value, pw: await hashPassword(pw.value, salt, name.value),
      created_at: now(), updated_at: now(), last_login_at: null,
      status: 'active', developer_unlocked: 0, recovery: []
    };
    var codes = [];
    for (var i = 0; i < 10; i += 1) {
      var code = randomRecoveryCode();
      codes.push(code);
      user.recovery.push({ hash: await hashRecovery(normalizeCode(code)), used_at: null });
    }
    db.users.push(user);
    await issueSession(db, user, true);
    audit(db, 'register', user, null, '');
    save(db);
    return ok({ user: publicUser(user), recovery_codes: codes }, 201);
  };
  api['POST /api/auth/login'] = async function (body) {
    var db = load();
    var user = findUser(db, body.username);
    if (!user || !(await verifyPassword(String(body.password || ''), user.pw, user.username))) {
      audit(db, 'login_failed', user, null, '×1');
      save(db);
      return fail(401, 'invalid_credentials', '用户名或密码不正确');
    }
    await issueSession(db, user, body.remember !== false);
    audit(db, 'login', user, null, '');
    save(db);
    return ok({
      user: publicUser(user),
      recovery_codes_left: (user.recovery || []).filter(function (c) { return !c.used_at; }).length
    });
  };
  api['POST /api/auth/logout'] = async function () {
    var db = load();
    var session = await currentSession(db);
    if (session) {
      session.revoked_at = now();
      var user = findUserById(db, session.user_id);
      audit(db, 'logout', user, null, '');
      save(db);
    }
    try { localStorage.removeItem(TOKEN_KEY); } catch (err) { /* ignore */ }
    return ok({});
  };
  api['POST /api/auth/password'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    if (!(await verifyPassword(String(body.current || ''), ctx.user.pw, ctx.user.username))) {
      return fail(400, 'invalid_password', '当前密码不正确');
    }
    var pw = checkPassword(body.password);
    if (pw.error) return fail(400, pw.error, pw.message);
    ctx.user.pw = await hashPassword(pw.value, randB64(16), ctx.user.username);
    ctx.user.updated_at = now();
    var revoked = 0;
    db.sessions.forEach(function (s) {
      if (s.user_id === ctx.user.id && s.id !== ctx.session.id && !s.revoked_at) { s.revoked_at = now(); revoked += 1; }
    });
    audit(db, 'password_changed', ctx.user, null, '×' + revoked);
    save(db);
    return ok({ revoked_others: revoked });
  };
  api['POST /api/auth/reset'] = async function (body) {
    var db = load();
    var user = findUser(db, body.username);
    var codeHash = await hashRecovery(normalizeCode(body.code));
    var entry = null;
    if (user) {
      entry = (user.recovery || []).find(function (c) { return c.hash === codeHash && !c.used_at; }) || null;
    }
    if (!entry) return fail(400, 'invalid_code', '用户名或恢复码不正确');
    var pw = checkPassword(body.password);
    if (pw.error) return fail(400, pw.error, pw.message);
    entry.used_at = now();
    user.pw = await hashPassword(pw.value, randB64(16), user.username);
    user.updated_at = now();
    db.sessions.forEach(function (s) { if (s.user_id === user.id) s.revoked_at = now(); });
    try { localStorage.removeItem(TOKEN_KEY); } catch (err) { /* ignore */ }
    audit(db, 'recovery_used', user, null, '');
    save(db);
    return ok({
      username: user.username,
      codes_left: (user.recovery || []).filter(function (c) { return !c.used_at; }).length
    });
  };
  api['POST /api/auth/recovery/regenerate'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    if (!(await verifyPassword(String(body.password || ''), ctx.user.pw, ctx.user.username))) {
      return fail(400, 'invalid_password', '密码不正确');
    }
    var codes = [];
    ctx.user.recovery = [];
    for (var i = 0; i < 10; i += 1) {
      var code = randomRecoveryCode();
      codes.push(code);
      ctx.user.recovery.push({ hash: await hashRecovery(normalizeCode(code)), used_at: null });
    }
    audit(db, 'recovery_regenerated', ctx.user, null, '');
    save(db);
    return ok({ recovery_codes: codes });
  };
  api['PATCH /api/me'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var email = checkEmail(body.email);
    if (email.error) return fail(400, email.error, email.message);
    ctx.user.display_name = String(body.display_name || '').trim() || ctx.user.username;
    ctx.user.email = email.value;
    ctx.user.updated_at = now();
    audit(db, 'profile_updated', ctx.user, null, '');
    save(db);
    return ok({ user: publicUser(ctx.user) });
  };
  api['GET /api/sessions'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var items = db.sessions
      .filter(function (s) { return s.user_id === ctx.user.id && !s.revoked_at && s.expires_at > now(); })
      .sort(function (a, b) { return b.last_seen_at - a.last_seen_at; })
      .map(function (s) {
        return {
          id: s.id, created_at: s.created_at, last_seen_at: s.last_seen_at,
          expires_at: s.expires_at, ua: s.ua, ip: s.ip,
          remember: !!s.remember, current: ctx.session && s.id === ctx.session.id
        };
      });
    save(db);
    return ok({ items: items });
  };
  api['POST /api/sessions/revoke'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var target = db.sessions.find(function (s) { return s.id === body.id && s.user_id === ctx.user.id; });
    if (target) target.revoked_at = now();
    audit(db, 'session_revoked', ctx.user, null, '');
    save(db);
    return ok({});
  };
  api['POST /api/sessions/revoke-others'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var count = 0;
    db.sessions.forEach(function (s) {
      if (s.user_id === ctx.user.id && s.id !== ctx.session.id && !s.revoked_at) { s.revoked_at = now(); count += 1; }
    });
    audit(db, 'sessions_revoked', ctx.user, null, '×' + count);
    save(db);
    return ok({ revoked: count });
  };
  api['GET /api/grants'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var items = db.grants.filter(function (g) { return g.user_id === ctx.user.id; }).map(function (g) {
      var app = findApp(db, g.app_id);
      return { app_id: g.app_id, app_name: app ? app.name : '已删除的应用', scopes: g.scopes, created_at: g.created_at };
    });
    var tokens = db.tokens
      .filter(function (t) { return t.user_id === ctx.user.id && !t.revoked_at && t.expires_at > now(); })
      .map(function (t) {
        var app = findApp(db, t.app_id);
        return {
          id: t.id, app_id: t.app_id, app_name: app ? app.name : '已删除的应用',
          created_at: t.created_at, expires_at: t.expires_at, last_used_at: t.last_used_at || 0, ua: t.ua
        };
      });
    return ok({ items: items, tokens: tokens });
  };
  api['POST /api/grants/revoke'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    db.grants = db.grants.filter(function (g) { return !(g.user_id === ctx.user.id && g.app_id === body.app_id); });
    db.tokens.forEach(function (t) {
      if (t.user_id === ctx.user.id && t.app_id === body.app_id && !t.revoked_at) t.revoked_at = now();
    });
    audit(db, 'grant_revoked', ctx.user, body.app_id, '');
    save(db);
    return ok({});
  };
  api['GET /api/tokens'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var items = db.tokens
      .filter(function (t) { return t.user_id === ctx.user.id && !t.revoked_at && t.expires_at > now(); })
      .map(function (t) {
        var app = findApp(db, t.app_id);
        return {
          id: t.id, app_id: t.app_id, app_name: app ? app.name : '已删除的应用',
          created_at: t.created_at, expires_at: t.expires_at, last_used_at: t.last_used_at || 0
        };
      });
    return ok({ items: items });
  };
  api['POST /api/tokens/revoke'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var token = db.tokens.find(function (t) { return t.id === body.id && t.user_id === ctx.user.id; });
    if (token) token.revoked_at = now();
    audit(db, 'token_revoked', ctx.user, null, '');
    save(db);
    return ok({});
  };
  api['POST /api/products/logout'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var count = 0;
    db.tokens.forEach(function (t) {
      if (t.user_id === ctx.user.id && t.app_id === body.app_id && !t.revoked_at) { t.revoked_at = now(); count += 1; }
    });
    db.grants = db.grants.filter(function (g) { return !(g.user_id === ctx.user.id && g.app_id === body.app_id); });
    audit(db, 'product_logout', ctx.user, body.app_id, '');
    save(db);
    return ok({ tokens: count });
  };
  api['GET /api/apps'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var items = db.apps.map(function (app) {
      return {
        app_id: app.app_id, name: app.name, description: app.description,
        redirect_uris: app.redirect_uris, scopes: app.scopes, is_demo: !!app.is_demo,
        created_at: app.created_at, last_used_at: app.last_used_at || 0,
        secret_hint: 'ylsec_••••••••' + app.secret_hint
      };
    });
    return ok({ items: items });
  };
  api['POST /api/apps'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var name = String(body.name || '').trim();
    if (!name) return fail(400, 'invalid_name', '请填写产品名称');
    var uris = String(body.redirect_uris || '').split(/[\r\n,]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (!uris.length) return fail(400, 'missing_redirect', '请至少填写一个回调地址');
    for (var i = 0; i < uris.length; i += 1) {
      if (!/^https?:\/\/[^\s]+$/.test(uris[i].replace('{port}', '8600'))) {
        return fail(400, 'invalid_redirect', '回调地址不合法：' + uris[i]);
      }
    }
    var secret = 'ylsec_' + randB64(28);
    var app = {
      id: uid(), name: name, description: String(body.description || '').trim(),
      app_id: 'ylc_' + randB64(12).replace(/[^A-Za-z0-9]/g, '').slice(0, 16),
      secret_hash: await digest(secret), secret_hint: secret.slice(-4),
      redirect_uris: uris, scopes: ['profile'], is_demo: 0, created_at: now(), last_used_at: 0
    };
    db.apps.push(app);
    audit(db, 'app_created', ctx.user, app.app_id, name);
    save(db);
    return ok({
      app: {
        app_id: app.app_id, name: app.name, redirect_uris: app.redirect_uris, scopes: app.scopes,
        is_demo: false, created_at: app.created_at, last_used_at: 0,
        secret_hint: 'ylsec_••••••••' + app.secret_hint
      },
      app_secret: secret
    }, 201);
  };
  api['PATCH /api/apps'] = async function (body, params) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var app = findApp(db, params.id);
    if (!app) return fail(404, 'not_found', '应用不存在');
    if (body.name) app.name = String(body.name).trim();
    if (body.description !== undefined) app.description = String(body.description).trim();
    if (body.redirect_uris) {
      app.redirect_uris = String(body.redirect_uris).split(/[\r\n,]+/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    audit(db, 'app_updated', ctx.user, app.app_id, app.name);
    save(db);
    return ok({ app: { name: app.name, redirect_uris: app.redirect_uris } });
  };
  api['DELETE /api/apps'] = async function (body, params) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var app = findApp(db, params.id);
    if (!app) return fail(404, 'not_found', '应用不存在');
    if (app.is_demo) return fail(400, 'protected_app', '内置示例应用不可删除');
    db.apps = db.apps.filter(function (a) { return a.app_id !== app.app_id; });
    db.grants = db.grants.filter(function (g) { return g.app_id !== app.app_id; });
    db.tokens.forEach(function (t) { if (t.app_id === app.app_id) t.revoked_at = now(); });
    audit(db, 'app_deleted', ctx.user, app.app_id, app.name);
    save(db);
    return ok({});
  };
  api['POST /api/apps/secret'] = async function (body, params) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var app = findApp(db, params.id);
    if (!app) return fail(404, 'not_found', '应用不存在');
    var secret = 'ylsec_' + randB64(28);
    app.secret_hash = await digest(secret);
    app.secret_hint = secret.slice(-4);
    audit(db, 'app_secret_rotated', ctx.user, app.app_id, '');
    save(db);
    return ok({ app_secret: secret });
  };
  api['GET /api/activity'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var items = db.audit.slice(0, 120).map(function (a) {
      return { id: a.id, ts: a.ts, event: a.event, username: a.username || '', app_id: a.app_id || '', ip: a.ip || '', detail: a.detail || '' };
    });
    return ok({ items: items });
  };
  api['DELETE /api/activity'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var count = db.audit.length;
    db.audit = [];
    audit(db, 'audit_cleared', ctx.user, null, '×' + count);
    save(db);
    return ok({ cleared: count });
  };
  api['GET /api/system'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var bytes = 0;
    try { bytes = (localStorage.getItem(DB_KEY) || '').length; } catch (err) { bytes = 0; }
    return ok({
      name: 'YiStarLine Account Unified App', version: VERSION, protocol: '1',
      base_url: 'http://localhost', data_dir: '应用私有存储（localStorage）',
      log_dir: '无', db_bytes: bytes, users: db.users.length, apps: db.apps.length,
      audit_count: db.audit.length, started_at: db.meta.created_at, uptime: now() - db.meta.created_at,
      autostart: false, python: 'JavaScriptCore', os: 'Android', pid: 0
    });
  };
  api['POST /api/system/backup'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var payload = JSON.stringify({ app: 'YAUA', version: VERSION, exported_at: now(), db: db }, null, 2);
    var result = bridgeCall('exportBackup', ['yaua-backup.json', payload]);
    audit(db, 'backup', ctx.user, null, 'yaua-backup.json');
    save(db);
    return ok({ path: result || '已选择保存位置', dir: '' });
  };
  api['POST /api/system/import'] = async function () {
    var ctx = await requireUser(load());
    if (ctx.error) return ctx.error;
    bridgeCall('importBackup', []);
    return ok({ started: true });
  };
  api['POST /api/system/open'] = async function () { return ok({ path: '' }); };
  api['POST /api/system/autostart'] = async function () { return ok({ enabled: false }); };
  api['POST /api/system/shutdown'] = async function () {
    bridgeCall('finishApp', []);
    return ok({});
  };
  api['POST /api/developer/unlock'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var required = ['item1', 'item2', 'item3', 'item4', 'item5'];
    var accepted = Array.isArray(body.accepted) ? body.accepted : [];
    for (var i = 0; i < required.length; i += 1) {
      if (accepted.indexOf(required[i]) < 0) return fail(400, 'agreement_required', '请勾选全部开发协议后再解锁');
    }
    ctx.user.developer_unlocked = 1;
    audit(db, 'developer_unlocked', ctx.user, null, accepted.join(', '));
    save(db);
    return ok({ developer: true });
  };
  api['POST /api/developer/lock'] = async function () {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    ctx.user.developer_unlocked = 0;
    audit(db, 'developer_locked', ctx.user, null, '');
    save(db);
    return ok({ developer: false });
  };
  api['POST /api/account/delete'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    if (!(await verifyPassword(String(body.password || ''), ctx.user.pw, ctx.user.username))) {
      return fail(400, 'invalid_password', '密码不正确');
    }
    var id = ctx.user.id;
    audit(db, 'account_deleted', ctx.user, null, '');
    db.users = db.users.filter(function (u) { return u.id !== id; });
    db.sessions = db.sessions.filter(function (s) { return s.user_id !== id; });
    db.tokens = db.tokens.filter(function (t) { return t.user_id !== id; });
    db.grants = db.grants.filter(function (g) { return g.user_id !== id; });
    db.devices = (db.devices || []).filter(function (d) { return d.user_id !== id; });
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(DEVICE_KEY); } catch (err) { /* ignore */ }
    save(db);
    return ok({});
  };
  api['POST /api/sso/consent'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var app = findApp(db, body.app_id);
    if (!app) return fail(400, 'invalid_app', '应用不存在');
    var granted = db.grants.some(function (g) { return g.user_id === ctx.user.id && g.app_id === app.app_id; });
    return ok({
      app: { app_id: app.app_id, name: app.name, description: app.description, redirect_uris: app.redirect_uris, scopes: app.scopes, host: '本机应用' },
      granted: granted, user: publicUser(ctx.user), state: body.state || ''
    });
  };
  api['POST /api/sso/approve'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    var app = findApp(db, body.app_id);
    if (!app) return fail(400, 'invalid_app', '应用不存在');
    if (body.remember) {
      var exists = db.grants.some(function (g) { return g.user_id === ctx.user.id && g.app_id === app.app_id; });
      if (!exists) db.grants.push({ user_id: ctx.user.id, app_id: app.app_id, scopes: app.scopes, created_at: now() });
    }
    var ticket = 'ylt_' + randB64(32);
    db.tickets.push({
      id: uid(), ticket_hash: await digest(ticket), app_id: app.app_id, user_id: ctx.user.id,
      redirect_uri: body.redirect_uri || '', created_at: now(), expires_at: now() + 90, used_at: null
    });
    audit(db, 'sso_authorized', ctx.user, app.app_id, app.name);
    save(db);
    var sep = (body.redirect_uri || '').indexOf('?') >= 0 ? '&' : '?';
    return ok({ redirect: (body.redirect_uri || '') + sep + 'ticket=' + encodeURIComponent(ticket) + '&state=' + encodeURIComponent(body.state || '') });
  };
  api['POST /api/sso/deny'] = async function (body) {
    var db = load();
    var ctx = await requireUser(db);
    if (ctx.error) return ctx.error;
    audit(db, 'sso_denied', ctx.user, body.app_id, '');
    save(db);
    var sep = (body.redirect_uri || '').indexOf('?') >= 0 ? '&' : '?';
    return ok({ redirect: (body.redirect_uri || '') + sep + 'error=access_denied' });
  };
  api['GET /api/v1/health'] = async function () {
    return ok({ app: 'YiStarLine Account', full_name: 'YiStarLine Account Unified App', mark: 'YAUA', version: VERSION, protocol: '1', time: now() });
  };

  /* ---------------------------------------------------------- 路由 */
  var routes = [
    ['GET', /^\/api\/public\/config$/, 'GET /api/public/config'],
    ['GET', /^\/api\/public\/accounts$/, 'GET /api/public/accounts'],
    ['GET', /^\/api\/auth\/session$/, 'GET /api/auth/session'],
    ['POST', /^\/api\/auth\/register$/, 'POST /api/auth/register'],
    ['POST', /^\/api\/auth\/login$/, 'POST /api/auth/login'],
    ['POST', /^\/api\/auth\/quick$/, 'POST /api/auth/quick'],
    ['POST', /^\/api\/auth\/logout$/, 'POST /api/auth/logout'],
    ['POST', /^\/api\/auth\/password$/, 'POST /api/auth/password'],
    ['POST', /^\/api\/auth\/reset$/, 'POST /api/auth/reset'],
    ['POST', /^\/api\/auth\/recovery\/regenerate$/, 'POST /api/auth/recovery/regenerate'],
    ['PATCH', /^\/api\/me$/, 'PATCH /api/me'],
    ['GET', /^\/api\/sessions$/, 'GET /api/sessions'],
    ['POST', /^\/api\/sessions\/revoke$/, 'POST /api/sessions/revoke'],
    ['POST', /^\/api\/sessions\/revoke-others$/, 'POST /api/sessions/revoke-others'],
    ['GET', /^\/api\/grants$/, 'GET /api/grants'],
    ['POST', /^\/api\/grants\/revoke$/, 'POST /api/grants/revoke'],
    ['GET', /^\/api\/tokens$/, 'GET /api/tokens'],
    ['POST', /^\/api\/tokens\/revoke$/, 'POST /api/tokens/revoke'],
    ['POST', /^\/api\/products\/logout$/, 'POST /api/products/logout'],
    ['GET', /^\/api\/apps$/, 'GET /api/apps'],
    ['POST', /^\/api\/apps$/, 'POST /api/apps'],
    ['PATCH', /^\/api\/apps\/([\w\-]+)$/, 'PATCH /api/apps', 1],
    ['DELETE', /^\/api\/apps\/([\w\-]+)$/, 'DELETE /api/apps', 1],
    ['POST', /^\/api\/apps\/([\w\-]+)\/secret$/, 'POST /api/apps/secret', 1],
    ['GET', /^\/api\/activity$/, 'GET /api/activity'],
    ['DELETE', /^\/api\/activity$/, 'DELETE /api/activity'],
    ['GET', /^\/api\/system$/, 'GET /api/system'],
    ['POST', /^\/api\/system\/backup$/, 'POST /api/system/backup'],
    ['POST', /^\/api\/system\/import$/, 'POST /api/system/import'],
    ['POST', /^\/api\/system\/open$/, 'POST /api/system/open'],
    ['POST', /^\/api\/system\/autostart$/, 'POST /api/system/autostart'],
    ['POST', /^\/api\/system\/shutdown$/, 'POST /api/system/shutdown'],
    ['POST', /^\/api\/developer\/unlock$/, 'POST /api/developer/unlock'],
    ['POST', /^\/api\/developer\/lock$/, 'POST /api/developer/lock'],
    ['POST', /^\/api\/account\/delete$/, 'POST /api/account/delete'],
    ['POST', /^\/api\/sso\/consent$/, 'POST /api/sso/consent'],
    ['POST', /^\/api\/sso\/approve$/, 'POST /api/sso/approve'],
    ['POST', /^\/api\/sso\/deny$/, 'POST /api/sso/deny'],
    ['GET', /^\/api\/v1\/health$/, 'GET /api/v1/health']
  ];

  async function route(method, path, body) {
    var pathname = path.split('?')[0];
    for (var i = 0; i < routes.length; i += 1) {
      var entry = routes[i];
      if (entry[0] !== method) continue;
      var match = entry[1].exec(pathname);
      if (!match) continue;
      var handler = api[entry[2]];
      if (!handler) continue;
      try {
        return await handler(body || {}, { id: match[1] || '' });
      } catch (err) {
        return fail(500, 'server_error', '本地处理失败：' + (err && err.message ? err.message : err));
      }
    }
    return fail(404, 'not_found', '接口不存在：' + pathname);
  }

  /* ---------------------------------------------------------- fetch 拦截 */
  var realFetch = global.fetch ? global.fetch.bind(global) : null;
  global.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    var body;
    if (init && init.body) {
      try { body = JSON.parse(init.body); } catch (err) { body = {}; }
    }
    var parsed;
    try { parsed = new URL(url, location.href); } catch (err) { parsed = null; }
    if (parsed && parsed.origin === location.origin) {
      return route(method, parsed.pathname + parsed.search, body).then(function (res) {
        return {
          ok: res.status >= 200 && res.status < 300,
          status: res.status,
          json: function () { return Promise.resolve(res.data); },
          text: function () { return Promise.resolve(JSON.stringify(res.data)); }
        };
      });
    }
    if (realFetch) return realFetch(input, init);
    return Promise.reject(new Error('offline'));
  };

  /* ---------------------------------------------------------- 原生桥 */
  function bridgeCall(name, args) {
    try {
      if (global.YAUABridge && typeof global.YAUABridge[name] === 'function') {
        return global.YAUABridge[name].apply(global.YAUABridge, args);
      }
    } catch (err) { /* ignore */ }
    return null;
  }

  global.YAUA_RESTORE = function (text) {
    try {
      var parsed = JSON.parse(text);
      var db = parsed.db || parsed;
      if (!db || !Array.isArray(db.users)) throw new Error('备份格式不正确');
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      try { localStorage.removeItem(TOKEN_KEY); } catch (err) { /* ignore */ }
      return true;
    } catch (err) {
      bridgeCall('toast', ['恢复失败：' + (err && err.message ? err.message : err)]);
      return false;
    }
  };
  global.YAUA_AFTER_RESTORE = function () { location.hash = '#/login'; location.reload(); };

  /* 隐藏无法在 Android 上工作的入口 */
  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('yaua-android-flag')) {
      var flag = document.createElement('meta');
      flag.id = 'yaua-android-flag';
      flag.name = 'yaua-platform';
      flag.content = 'android';
      document.head.appendChild(flag);
    }
  });

  /* 系统栏安全区：Android 15+ 强制 edge-to-edge，用原生桥上报的高度避开状态栏与手势条 */
  function applySafeArea() {
    try {
      var bridge = global.YAUABridge;
      if (!bridge || typeof bridge.statusBarHeight !== 'function') return;
      var dpr = global.devicePixelRatio || 1;
      var top = Math.round(Number(bridge.statusBarHeight()) / dpr);
      var bottom = Math.round(Number(bridge.navBarHeight()) / dpr);
      var root = document.documentElement;
      root.style.setProperty('--safe-top', top + 'px');
      root.style.setProperty('--safe-bottom', bottom + 'px');
    } catch (err) { /* ignore */ }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applySafeArea);
  } else {
    applySafeArea();
  }
  global.addEventListener('load', applySafeArea);
})(window);
