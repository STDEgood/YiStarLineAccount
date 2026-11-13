/* ============================================================
   YiStarLine Account Unified App - management UI (vanilla JS)
   All user-visible copy lives in i18n dictionaries.
   ============================================================ */
(() => {
  const t = (key, vars) => window.I18N.t(key, vars);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const IS_ANDROID = typeof window !== 'undefined' && !!window.YAUA_ANDROID;

  /* ------------------------------ ESC_MAP */
  const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value === undefined || value === null ? '' : value)
    .replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
  const fmtDate = (ts) => window.I18N.date(ts);
  const fmtDay = (ts) => window.I18N.day(ts);
  const relTime = (ts) => window.I18N.relative(ts);
  const num = (n) => window.I18N.number(n);
  const fmtBytes = (n) => window.I18N.bytes(n);
  const fmtDuration = (s) => window.I18N.duration(s);

  function initials(name) {
    const text = String(name || '?').trim();
    if (!text) return '?';
    const cn = text.match(/[\u4e00-\u9fa5\u3040-\u30ff]/g);
    if (cn && cn.length) return cn.slice(0, 1).join('');
    const parts = text.split(/[\s_\-.@]+/).filter(Boolean);
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return text.slice(0, 2).toUpperCase();
  }
  function hueOf(name) {
    let h = 216;
    for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  }
  function avatar(name, cls = '') {
    const h = hueOf(name);
    return `<span class="avatar ${cls}" style="background:hsl(${h} 40% 40%)">${esc(initials(name))}</span>`;
  }
  function uaLabel(ua) {
    const text = ua || '';
    let os = t('dev.ua.unknownOs');
    if (/Windows NT 1[01]/.test(text)) os = 'Windows 10/11';
    else if (/Windows NT/.test(text)) os = 'Windows';
    else if (/Mac OS X/.test(text)) os = 'macOS';
    else if (/Android/.test(text)) os = 'Android';
    else if (/iPhone|iPad/.test(text)) os = 'iOS';
    else if (/Linux/.test(text)) os = 'Linux';
    let browser = t('dev.ua.unknownBrowser');
    if (/Edg\//.test(text)) browser = 'Edge';
    else if (/OPR\//.test(text)) browser = 'Opera';
    else if (/Chrome\//.test(text)) browser = 'Chrome';
    else if (/Firefox\//.test(text)) browser = 'Firefox';
    else if (/Safari\//.test(text)) browser = 'Safari';
    else if (/python|curl|node|okhttp|go-http/i.test(text)) browser = t('dev.ua.api');
    return `${browser} · ${os}`;
  }

  /* ------------------------------ ICONS */
  const ICONS = {
    box: '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12 19"/>',
    code: '<path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>',
    activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
    database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.7 4 3 9 3s9-1.3 9-3V5"/><path d="M3 12c0 1.7 4 3 9 3s9-1.3 9-3"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M17.9 17.9A10.8 10.8 0 0 1 12 20C5 20 1 12 1 12a20 20 0 0 1 5.1-6.3M9.9 4.2A10 10 0 0 1 12 4c7 0 11 8 11 8a20 20 0 0 1-2.2 3.4"/><path d="M1 1l22 22"/><path d="M9.9 9.9a3 3 0 1 0 4.2 4.2"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    key: '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3L21 2M17 6l3 3M14 9l3 3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    power: '<path d="M18.4 6.6a9 9 0 1 1-12.8 0"/><path d="M12 2v10"/>',
    play: '<path d="M5 3l14 9-14 9V3z"/>',
    refresh: '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20a15 15 0 0 1 0-20z"/>',
    chevron: '<path d="M6 9l6 6 6-6"/>',
    more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    terminal: '<path d="M4 17l6-5-6-5"/><path d="M12 19h8"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'
  };
  const icon = (name, size = 15, cls = '') =>
    `<svg class="${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;

  /* ------------------------------ S */
  const S = {
    cfg: null,
    user: null,
    developer: false,
    session: null,
    recoveryCodesLeft: 0,
    counts: { sessions: 0, grants: 0, tokens: 0 },
    system: null,
    consent: null,
    pendingCodes: null,
    apps: [],
    route: '',
    gateAccepted: [],
    accounts: null,
    deviceUsername: null,
    loginStep: 'choose',
    pickedUsername: '',
    pickedName: '',
    loginNext: ''
  };

  /* ---------------------------------------------------------- API */
  async function api(path, options = {}) {
    const { method = 'GET', body } = options;
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-YL-Client': 'yistarline-account',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    let data = null;
    try { data = await response.json(); } catch (err) { data = null; }
    if (!response.ok) {
      const code = data && data.error ? data.error.code : '';
      if (response.status === 401 && S.user && !path.startsWith('/api/auth/login')) {
        S.user = null;
        S.session = null;
        toast(t('toast.sessionExpired'), 'bad');
        location.hash = '#/login';
      }
      const message = (code && t('err.' + code) !== 'err.' + code) ? t('err.' + code)
        : ((data && data.error && data.error.message) || t('err.generic'));
      const error = new Error(message);
      error.status = response.status;
      error.code = code;
      throw error;
    }
    return data;
  }

  /* ------------------------------ THEME_KEY */
  const THEME_KEY = 'yl-theme-mode';
  function themeMode() {
    try { return localStorage.getItem(THEME_KEY) || 'light'; } catch (err) { return 'light'; }
  }
  function resolveTheme(mode) {
    if (mode === 'auto') {
      const hour = new Date().getHours();
      return hour >= 7 && hour < 19 ? 'light' : 'dark';
    }
    return mode === 'dark' ? 'dark' : 'light';
  }
  function applyThemeMode(mode) {
    const value = ['light', 'dark', 'auto'].indexOf(mode) >= 0 ? mode : 'light';
    try { localStorage.setItem(THEME_KEY, value); } catch (err) { /* ignore */ }
    document.documentElement.setAttribute('data-theme', resolveTheme(value));
  }
  function currentThemeLabel() {
    const mode = themeMode();
    return t(mode === 'auto' ? 'theme.auto' : (mode === 'dark' ? 'theme.dark' : 'theme.light'));
  }

  /* ------------------------------ dd */
  function dd(kind, trigger, items, align = 'right') {
    return `<div class="dd" data-dd data-kind="${esc(kind)}">
      <button type="button" class="dd-trigger" data-act="dd-toggle" aria-haspopup="menu" aria-expanded="false">${trigger}${icon('chevron', 12, 'caret')}</button>
      <div class="dd-menu ${align === 'left' ? 'align-left' : ''}" role="menu">${items}</div>
    </div>`;
  }
  function ddItem({ action, value, label, ico, active, danger, extra = '' }) {
    return `<button type="button" class="dd-item ${active ? 'active' : ''} ${danger ? 'danger' : ''}"
      data-act="${action}"${value !== undefined ? ` data-value="${esc(value)}"` : ''} ${extra}>
      ${ico ? icon(ico, 14) : ''}<span>${esc(label)}</span>${icon('check', 12, 'check')}</button>`;
  }
  function langDropdown() {
    const items = window.I18N.langs.map((lang) =>
      ddItem({ action: 'set-lang', value: lang.code, label: lang.label, active: window.I18N.lang === lang.code })
    ).join('');
    return dd('lang', `${icon('globe', 13)}<span>${esc(window.I18N.langs.find((l) => l.code === window.I18N.lang).label)}</span>`, items);
  }
  function themeDropdown(compact = false) {
    const mode = themeMode();
    const items = `
      <div class="dd-label">${esc(t('theme.label'))}</div>
      ${ddItem({ action: 'set-theme', value: 'light', label: t('theme.light'), ico: 'sun', active: mode === 'light' })}
      ${ddItem({ action: 'set-theme', value: 'dark', label: t('theme.dark'), ico: 'moon', active: mode === 'dark' })}
      ${ddItem({ action: 'set-theme', value: 'auto', label: t('theme.auto'), ico: 'clock', active: mode === 'auto' })}
      <div class="dd-sep"></div>
      <div class="dd-label">${esc(t('theme.autoHint'))}</div>`;
    const trigger = compact ? icon(resolveTheme(mode) === 'dark' ? 'moon' : 'sun', 14)
      : `${icon(resolveTheme(mode) === 'dark' ? 'moon' : 'sun', 13)}<span>${esc(currentThemeLabel())}</span>`;
    return dd('theme', trigger, items);
  }
  function accountMenu() {
    const items = `
      ${ddItem({ action: 'go', value: '#/security', label: t('account.menu.profile'), ico: 'user' })}
      ${ddItem({ action: 'go', value: '#/activity', label: t('account.menu.activity'), ico: 'activity' })}
      <div class="dd-sep"></div>
      ${ddItem({ action: 'developer-gate', label: t('account.menu.developer'), ico: 'code' })}
      ${ddItem({ action: 'backup', label: t('account.menu.backup'), ico: 'download' })}
      <div class="dd-sep"></div>
      ${ddItem({ action: 'logout', label: t('common.logout'), ico: 'logout', danger: true })}`;
    return dd('account', icon('more', 15), items);
  }

  /* ------------------------------ toast */
  function toast(message, type = 'ok') {
    const root = $('#toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${icon(type === 'bad' ? 'alert' : 'check')}<span>${esc(message)}</span>`;
    root.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 200);
    }, 3400);
  }

  function openModal(html) {
    const root = $('#modal-root');
    root.innerHTML = `<div class="modal-overlay" data-overlay><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
    document.body.style.overflow = 'hidden';
    const field = root.querySelector('input, textarea, button');
    if (field) setTimeout(() => field.focus(), 60);
  }
  function closeModal() {
    const root = $('#modal-root');
    if (!root) return;
    root.innerHTML = '';
    document.body.style.overflow = '';
  }
  async function openProtectPanel(appId) {
    let data;
    try {
      data = await api(`/api/apps/${encodeURIComponent(appId)}/protect`);
    } catch (err) {
      toast(err.message || '', 'bad');
      return;
    }
    const app = data.app || {};
    const items = data.items || [];
    const checks = data.checks || [];
    const groups = ['data', 'privacy', 'security', 'lifecycle'];
    const checksHtml = checks.map((check) => `
      <div class="check-row ${check.ok ? 'ok' : 'bad'}">
        ${icon(check.ok ? 'check' : 'x', 13)}
        <span>${esc(t('protect.' + check.id))}</span>
      </div>`).join('');
    const itemsHtml = groups.map((group) => {
      const rows = items.filter((item) => item.group === group);
      if (!rows.length) return '';
      return `<div class="claim-group">
        <div class="claim-group-title">${esc(t('protect.group.' + group))}</div>
        ${rows.map((item) => `<label class="claim">
          <input type="checkbox" name="claim" value="${esc(item.id)}">
          <span>${esc(t('protect.item.' + item.id))}</span>
        </label>`).join('')}
      </div>`;
    }).join('');
    openModal(`
      <h3>${esc(t('protect.title'))}</h3>
      <p class="modal-sub">${esc(t('protect.sub', { app: app.name || '' }))}</p>
      <form data-form="protect" data-app="${esc(appId)}">
        <div class="modal-body">
          <div class="claim-group">
            <div class="claim-group-title">${esc(t('protect.autoChecks'))}</div>
            ${checksHtml}
          </div>
          <div class="claim-group-title" style="margin-top:14px">${esc(t('protect.declare'))}</div>
          ${itemsHtml}
          <div class="field" style="margin-top:12px">
            <label for="protect-privacy">${esc(t('protect.privacyUrl'))}</label>
            <input class="input" id="protect-privacy" name="privacy_url" value="${esc(data.privacy_url || '')}" placeholder="${esc(t('protect.privacyUrlPh'))}">
          </div>
          <div class="alert accent">${icon('shield')}<div>${esc(t('protect.claimHint'))}</div></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" data-act="modal-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-primary" type="submit">${esc(t('protect.submit'))}</button>
        </div>
      </form>`);
  }

  function confirmDialog({ title, message, confirmText, danger = false }) {
    return new Promise((resolve) => {
      openModal(`
        <h3>${esc(title)}</h3>
        <p class="modal-sub">${message || ''}</p>
        <div class="modal-actions">
          <button class="btn" data-act="modal-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="modal-ok">${esc(confirmText || t('common.confirm'))}</button>
        </div>`);
      S.modalResolve = (value) => { closeModal(); resolve(value); };
    });
  }
  function askPassword({ title, message, confirmText }) {
    return new Promise((resolve) => {
      openModal(`
        <h3>${esc(title)}</h3>
        <p class="modal-sub">${esc(message || '')}</p>
        <div class="modal-body">
          <div class="field">
            <label for="modal-pw">${esc(t('modal.password.label'))}</label>
            <div class="input-wrap">
              <input class="input" id="modal-pw" type="password" autocomplete="current-password" placeholder="${esc(t('modal.password.ph'))}">
              <button type="button" class="peek" data-act="peek" aria-label="show">${icon('eye')}</button>
            </div>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" data-act="modal-cancel">${esc(t('common.cancel'))}</button>
          <button class="btn btn-danger" data-act="modal-password-ok">${esc(confirmText || t('common.confirm'))}</button>
        </div>`);
      S.modalResolve = (value) => { closeModal(); resolve(value); };
    });
  }

  /* ------------------------------ parseHash */
  function parseHash() {
    const raw = (location.hash || '').replace(/^#/, '') || '/';
    const index = raw.indexOf('?');
    const path = index >= 0 ? raw.slice(0, index) : raw;
    const params = {};
    new URLSearchParams(index >= 0 ? raw.slice(index + 1) : '').forEach((value, key) => { params[key] = value; });
    return { path: path || '/', params };
  }

  /* ------------------------------ brandLockup */
  function brandLockup() {
    return `<div class="brand-lockup"><span class="brand-mark">${esc(t('app.mark'))}</span>
      <div><strong>${esc(t('app.brand'))}</strong><small>Unified App</small></div></div>`;
  }
  function navItems() {
    const groups = [
      ['nav.group.account', [
        ['/dashboard', 'nav.overview', 'box', null],
        ['/security', 'nav.security', 'shield', null],
        ['/devices', 'nav.devices', 'monitor', () => S.counts.sessions]
      ]],
      ['nav.group.product', [
        ['/apps', 'nav.apps', 'link', () => S.counts.grants]
      ]],
      ['nav.group.system', [
        ['/activity', 'nav.activity', 'activity', null],
        ['/data', 'nav.data', 'database', null],
        ['/about', 'nav.about', 'info', null]
      ]]
    ];
    if (S.developer) {
      groups[1][1].push(['/developer', 'nav.developer', 'code', null]);
    }
    let html = '';
    for (const [groupKey, items] of groups) {
      html += `<div class="nav-group">${esc(t(groupKey))}</div>`;
      for (const [route, labelKey, ico, badge] of items) {
        const count = badge ? badge() : 0;
        const active = S.route === route ? ' active' : '';
        html += `<button class="nav-item${active}" data-route="${route}">${icon(ico)}<span>${esc(t(labelKey))}</span>${
          count ? `<span class="nav-badge">${count}</span>` : ''
        }</button>`;
      }
    }
    if (!IS_ANDROID) {
      html += `<a class="nav-item" href="/demo/" target="_blank" rel="noopener">${icon('play')}<span>${esc(t('nav.demo'))}</span></a>`;
    }
    return html;
  }
  function sideUser() {
    const user = S.user || {};
    return `<div class="side-user">
      ${avatar(user.display_name || user.username || '?')}
      <div class="who">
        <strong>${esc(user.display_name || user.username || '')}</strong>
        <span>@${esc(user.username || '')}</span>
      </div>
      <button class="btn-icon" data-act="logout" title="${esc(t('common.logout'))}" aria-label="${esc(t('common.logout'))}">${icon('logout', 15)}</button>
    </div>`;
  }
  /* ------------------------------ isMobile */
  function isMobile() {
    return typeof window !== 'undefined' && window.matchMedia
      && window.matchMedia('(max-width: 640px)').matches;
  }

  function mobileTabs() {
    const tabs = [
      ['/dashboard', 'nav.overview', 'box'],
      ['/security', 'nav.security', 'shield'],
      ['/apps', 'nav.apps', 'link'],
      ['/activity', 'nav.activity', 'activity'],
    ];
    let html = tabs.map(([route, labelKey, ico]) => {
      const active = S.route === route ? ' active' : '';
      return `<a class="m-tab${active}" href="#${route}" data-route="${route}">
        ${icon(ico, 20)}<span>${esc(t(labelKey))}</span></a>`;
    }).join('');
    html += `<button class="m-tab" data-act="m-more">${icon('more', 20)}<span>${esc(t('nav.more'))}</span></button>`;
    return html;
  }

  function mobileSheet() {
    const user = S.user || {};
    const rows = [
      ['#/devices', 'monitor', 'nav.devices'],
      ['#/data', 'database', 'nav.data'],
      ['#/about', 'info', 'nav.about'],
    ];
    if (S.developer) rows.splice(1, 0, ['#/developer', 'code', 'nav.developer']);
    return `<div class="m-sheet-overlay" data-act="m-close">
      <div class="m-sheet" data-act="m-sheet">
        <button class="m-sheet-close" data-act="m-close" aria-label="${esc(t('common.close'))}">${icon('x', 16)}</button>
        <div class="m-sheet-user">
          ${avatar(user.display_name || user.username || '?')}
          <div><strong>${esc(user.display_name || user.username || '')}</strong><span>@${esc(user.username || '')}</span></div>
          ${S.developer ? `<span class="badge ok">${esc(t('nav.developer'))}</span>` : ''}
        </div>
        <div class="m-sheet-tools">${langDropdown()}${themeDropdown()}</div>
        <div class="m-sheet-list">
          ${rows.map(([href, ico, key]) => `<a class="m-row" href="${href}">${icon(ico, 18)}<span>${esc(t(key))}</span>${icon('chevron', 14, 'm-row-arrow')}</a>`).join('')}
        </div>
        <button class="m-row danger" data-act="logout">${icon('logout', 18)}<span>${esc(t('common.logout'))}</span></button>
      </div>
    </div>`;
  }

  function mobileShell({ title, subtitle, body }) {
    return `<div class="m-shell">
      <header class="m-top">
        <div class="m-title"><h1>${esc(title)}</h1>${subtitle ? `<span>${esc(subtitle)}</span>` : ''}</div>
        <button class="m-avatar" data-act="m-more" aria-label="${esc(t('nav.more'))}">${avatar((S.user && (S.user.display_name || S.user.username)) || '?')}</button>
      </header>
      <main class="m-body">${body}</main>
      <nav class="m-tabs">${mobileTabs()}</nav>
    </div>`;
  }

  function shell({ title, subtitle, actions = '', body }) {
    if (isMobile()) {
      return mobileShell({ title, subtitle, body });
    }
    return `<div class="shell">
      <aside class="side">
        <div class="side-brand">${brandLockup()}</div>
        <nav class="nav">${navItems()}</nav>
        <div class="side-foot">${sideUser()}</div>
      </aside>
      <main class="main">
        <header class="topbar">
          <div>
            <h1>${esc(title)}</h1>
            ${subtitle ? `<div class="top-sub">${esc(subtitle)}</div>` : ''}
          </div>
          <div class="top-actions">${langDropdown()}${themeDropdown()}${actions}</div>
        </header>
        <div class="page">${body}</div>
      </main>
    </div>`;
  }

  /* ------------------------------ authLayout */
  function authLayout({ title, sub, body, footer, firstRun = false }) {
    return `<div class="auth">
      <aside class="auth-brand">
        <div class="auth-wordmark">
          <span class="brand-mark xl">${esc(t('app.mark'))}</span>
          <h1>${esc(t('app.brand'))}</h1>
          <p>${esc(t('app.full'))}</p>
        </div>
      </aside>
      <main class="auth-panel">
        <div class="auth-tools">${langDropdown()}${themeDropdown(true)}</div>
        <section class="auth-card">
          ${firstRun ? `<div class="first-run">${icon('info')}<div>${esc(t('auth.firstRun'))}</div></div>` : ''}
          <h2>${esc(title)}</h2>
          <p class="card-sub">${esc(sub)}</p>
          ${body}
          ${footer ? `<div class="auth-switch">${footer}</div>` : ''}
        </section>
        <p class="auth-legal">${esc(t('auth.legal'))}</p>
      </main>
    </div>`;
  }

  function strengthMarkup() {
    return `<div class="strength hidden" data-strength-box>
      <div class="strength-bars"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="strength-label"><span>${esc(t('strength.label'))}</span><span data-strength-label>—</span></div>
    </div>`;
  }
  function strengthScore(password) {
    const pw = password || '';
    let score = 0;
    if (pw.length >= 8) score += 1;
    if (pw.length >= 12) score += 1;
    if (pw.length >= 16) score += 1;
    let classes = 0;
    if (/[a-z]/.test(pw)) classes += 1;
    if (/[A-Z]/.test(pw)) classes += 1;
    if (/[0-9]/.test(pw)) classes += 1;
    if (/[^A-Za-z0-9]/.test(pw)) classes += 1;
    if (classes >= 2) score += 1;
    if (classes >= 3) score += 1;
    if (/(.)\1{2,}/.test(pw) || /(0123|1234|2345|3456|4567|6789|abcd|qwer|asdf)/.test(pw.toLowerCase())) score -= 1;
    return Math.max(0, Math.min(5, score));
  }

  /* ------------------------------ ensureAccounts */
  async function ensureAccounts(force) {
    if (S.accounts && !force) return;
    try {
      const data = await api('/api/public/accounts');
      S.accounts = data.items || [];
      S.deviceUsername = data.device_username || null;
    } catch (err) {
      S.accounts = [];
      S.deviceUsername = null;
    }
  }

  function chooserMarkup() {
    const accounts = S.accounts || [];
    const trusted = S.deviceUsername;
    const rows = accounts.map((acc) => {
      const isTrusted = acc.username === trusted;
      return `<button type="button" class="account-item${isTrusted ? ' trusted' : ''}" data-act="pick-account" data-username="${esc(acc.username)}">
        ${avatar(acc.display_name || acc.username)}
        <span class="who">
          <strong>${esc(acc.display_name || acc.username)}</strong>
          <span>@${esc(acc.username)} · ${acc.last_login_at ? `${esc(t('login.lastUsed'))} ${relTime(acc.last_login_at)}` : esc(t('login.neverUsed'))}</span>
        </span>
        ${isTrusted ? `<span class="badge ok">${esc(t('login.quick'))}</span>` : ''}
        ${icon('arrow', 13, 'arrow')}
      </button>`;
    }).join('');
    return `<div class="account-list">${rows}</div>
      ${trusted ? `<div class="alert accent" style="margin-top:14px">${icon('key')}<div>${esc(t('login.quickHint'))}</div></div>` : ''}
      <div class="auth-links" style="margin-top:16px">
        <button type="button" class="link-btn" data-act="login-manual">${esc(t('login.useOther'))}</button>
        <a href="#/recover">${esc(t('auth.login.forgot'))}</a>
      </div>`;
  }

  function passwordStepMarkup(next) {
    return `<div class="picked-account">
        ${avatar(S.pickedName || S.pickedUsername)}
        <div><strong>${esc(S.pickedName || S.pickedUsername)}</strong><span>@${esc(S.pickedUsername)}</span></div>
      </div>
      <form class="auth-form" data-form="login" data-next="${esc(next)}" style="margin-top:16px">
        <input type="hidden" name="username" value="${esc(S.pickedUsername)}">
        ${next ? `<div class="alert accent">${icon('link')}<div>${esc(t('auth.login.next'))}</div></div>` : ''}
        <div class="field">
          <label for="login-pass">${esc(t('login.passwordFor', { name: S.pickedName || S.pickedUsername }))}</label>
          <div class="input-wrap">
            <input class="input" id="login-pass" name="password" type="password" autocomplete="current-password" required autofocus>
            <button type="button" class="peek" data-act="peek" aria-label="show">${icon('eye')}</button>
          </div>
        </div>
        <label class="check"><input type="checkbox" name="remember" checked> ${esc(t('login.rememberDevice'))}</label>
        <button class="btn btn-primary btn-block" type="submit">${esc(t('auth.login.submit'))}</button>
        <div class="auth-links">
          <button type="button" class="link-btn" data-act="login-back">${esc(t('login.backToAccounts'))}</button>
          <button type="button" class="link-btn" data-act="login-manual">${esc(t('login.useOther'))}</button>
        </div>
      </form>`;
  }

  function viewLogin(params) {
    const next = params.next || '';
    S.loginNext = next;
    const reauth = params.reauth === '1';
    const firstRun = S.cfg && !S.cfg.has_users;
    const accounts = S.accounts || [];
    const hasAccounts = accounts.length > 0 && !firstRun;
    const step = (!hasAccounts || reauth) ? 'manual' : (S.loginStep || 'choose');

    if (step === 'choose') {
      return authLayout({
        title: t('login.chooseTitle'),
        sub: t('login.chooseSub'),
        body: chooserMarkup(),
        footer: `${esc(t('auth.login.switchText'))} <a href="#/register">${esc(t('auth.login.switchLink'))}</a>`
      });
    }
    if (step === 'password' && S.pickedUsername) {
      return authLayout({
        title: t('auth.login.title'),
        sub: S.deviceUsername === S.pickedUsername ? t('login.quickHint') : '',
        body: passwordStepMarkup(next),
        footer: ''
      });
    }
    return authLayout({
      firstRun,
      title: t('auth.login.title'),
      sub: t('auth.login.manualSub'),
      body: `<form class="auth-form" data-form="login" data-next="${esc(next)}">
        ${next ? `<div class="alert accent">${icon('link')}<div>${esc(t('auth.login.next'))}</div></div>` : ''}
        ${reauth ? `<div class="alert warn">${icon('shield')}<div>${esc(t('auth.login.reauth'))}</div></div>` : ''}
        <div class="field">
          <label for="login-user">${esc(t('auth.login.username'))}</label>
          <input class="input" id="login-user" name="username" autocomplete="username" required autofocus>
        </div>
        <div class="field">
          <label for="login-pass">${esc(t('auth.login.password'))}</label>
          <div class="input-wrap">
            <input class="input" id="login-pass" name="password" type="password" autocomplete="current-password" required>
            <button type="button" class="peek" data-act="peek" aria-label="show">${icon('eye')}</button>
          </div>
        </div>
        <label class="check"><input type="checkbox" name="remember" checked> ${esc(t('login.rememberDevice'))}</label>
        <button class="btn btn-primary btn-block" type="submit">${esc(t('auth.login.submit'))}</button>
        <div class="auth-links">
          ${hasAccounts ? `<button type="button" class="link-btn" data-act="login-back">${esc(t('login.backToAccounts'))}</button>` : ''}
          <a href="#/recover">${esc(t('auth.login.forgot'))}</a>
        </div>
      </form>`,
      footer: `${esc(t('auth.login.switchText'))} <a href="#/register">${esc(t('auth.login.switchLink'))}</a>`
    });
  }

  /* ------------------------------ viewRegister */
  function viewRegister(params) {
    const next = params.next || '';
    const firstRun = S.cfg && !S.cfg.has_users;
    return authLayout({
      firstRun,
      title: firstRun ? t('auth.register.firstTitle') : t('auth.register.title'),
      sub: firstRun ? t('auth.register.firstSub') : t('auth.register.sub'),
      body: `<form class="auth-form" data-form="register" data-next="${esc(next)}">
        <div class="field">
          <label for="reg-user">${esc(t('auth.register.username'))} <span class="hint">${esc(t('auth.register.usernameHint'))}</span></label>
          <input class="input" id="reg-user" name="username" autocomplete="username" required autofocus>
        </div>
        <div class="field">
          <label for="reg-name">${esc(t('auth.register.display'))} <span class="hint">${esc(t('auth.register.displayHint'))}</span></label>
          <input class="input" id="reg-name" name="display_name" autocomplete="nickname">
        </div>
        <div class="field">
          <label for="reg-pass">${esc(t('auth.register.password'))}</label>
          <div class="input-wrap">
            <input class="input" id="reg-pass" name="password" type="password" autocomplete="new-password" required data-strength="1">
            <button type="button" class="peek" data-act="peek" aria-label="show">${icon('eye')}</button>
          </div>
          ${strengthMarkup()}
        </div>
        <div class="field">
          <label for="reg-pass2">${esc(t('auth.register.confirm'))}</label>
          <input class="input" id="reg-pass2" name="password2" type="password" autocomplete="new-password" required>
        </div>
        <label class="check"><input type="checkbox" name="agree" required> ${esc(t('auth.register.agree'))}</label>
        <button class="btn btn-primary btn-block" type="submit">${esc(t('auth.register.submit'))}</button>
        <div class="auth-links"><span class="dim" style="font-size:11px">${esc(t('auth.register.note'))}</span></div>
      </form>`,
      footer: `${esc(t('auth.register.switchText'))} <a href="#/login">${esc(t('auth.register.switchLink'))}</a>`
    });
  }

  /* ------------------------------ viewRecover */
  function viewRecover() {
    return authLayout({
      title: t('auth.recover.title'),
      sub: t('auth.recover.sub'),
      body: `<form class="auth-form" data-form="recover">
        <div class="field">
          <label for="rec-user">${esc(t('auth.recover.username'))}</label>
          <input class="input" id="rec-user" name="username" autocomplete="username" required autofocus>
        </div>
        <div class="field">
          <label for="rec-code">${esc(t('auth.recover.code'))} <span class="hint">${esc(t('auth.recover.codeHint'))}</span></label>
          <input class="input mono" id="rec-code" name="code" autocomplete="off" required>
        </div>
        <div class="field">
          <label for="rec-pass">${esc(t('auth.recover.newPassword'))}</label>
          <div class="input-wrap">
            <input class="input" id="rec-pass" name="password" type="password" autocomplete="new-password" required data-strength="1">
            <button type="button" class="peek" data-act="peek" aria-label="show">${icon('eye')}</button>
          </div>
          ${strengthMarkup()}
        </div>
        <button class="btn btn-primary btn-block" type="submit">${esc(t('auth.recover.submit'))}</button>
        <div class="auth-links"><span class="dim" style="font-size:11px">${esc(t('auth.recover.note'))}</span></div>
      </form>`,
      footer: `${esc(t('auth.recover.switchText'))} <a href="#/login">${esc(t('auth.recover.switchLink'))}</a>`
    });
  }

  /* ------------------------------ metric */
  function metric(label, value, hint) {
    return `<div class="card metric"><div class="label">${esc(label)}</div><div class="value">${esc(value)}</div><div class="hint">${esc(hint)}</div></div>`;
  }
  async function viewDashboard() {
    const [sessions, grants, tokens, activity, system, sessionInfo] = await Promise.all([
      api('/api/sessions').catch(() => ({ items: [] })),
      api('/api/grants').catch(() => ({ items: [] })),
      api('/api/tokens').catch(() => ({ items: [] })),
      api('/api/activity?limit=6').catch(() => ({ items: [] })),
      api('/api/system').catch(() => null),
      api('/api/auth/session').catch(() => null)
    ]);
    S.counts.sessions = (sessions.items || []).length;
    S.counts.grants = (grants.items || []).length;
    S.counts.tokens = (tokens.items || []).length;
    S.system = system;
    if (sessionInfo) {
      if (typeof sessionInfo.recovery_codes_left === 'number') S.recoveryCodesLeft = sessionInfo.recovery_codes_left;
      S.developer = !!sessionInfo.developer;
    }
    const user = S.user;
    const recent = activity.items || [];
    const checks = [
      {
        ok: S.recoveryCodesLeft > 0,
        label: t('dash.check.codes'),
        text: S.recoveryCodesLeft > 0 ? t('dash.check.codesOk', { n: S.recoveryCodesLeft }) : t('dash.check.codesBad'),
        route: '/security'
      },
      {
        ok: S.counts.sessions <= 3,
        label: t('dash.check.sessions'),
        text: S.counts.sessions <= 3
          ? t('dash.check.sessionsOk', { n: S.counts.sessions })
          : t('dash.check.sessionsWarn', { n: S.counts.sessions }),
        route: '/devices'
      },
      {
        ok: S.counts.grants > 0,
        label: t('dash.check.products'),
        text: S.counts.grants > 0 ? t('dash.check.productsOk', { n: S.counts.grants }) : t('dash.check.productsBad'),
        route: '/apps'
      },
      {
        ok: true,
        label: t('dash.check.data'),
        text: t('dash.check.dataOk'),
        route: '/data'
      }
    ];
    const healthy = checks.filter((item) => item.ok).length;

    const body = `
      <section class="grid-4">
        ${metric(t('dash.m.sessions'), num(S.counts.sessions), t('dash.m.sessionsHint'))}
        ${metric(t('dash.m.grants'), num(S.counts.grants), t('dash.m.grantsHint'))}
        ${metric(t('dash.m.tokens'), num(S.counts.tokens), t('dash.m.tokensHint'))}
        ${metric(t('dash.m.codes'), num(S.recoveryCodesLeft), t('dash.m.codesHint'))}
      </section>

      <div class="grid-2">
        <section class="card flush">
          <div class="card-head">
            <div><h3>${esc(t('dash.recent.title'))}</h3><p>${esc(t('dash.recent.desc'))}</p></div>
            <a class="btn btn-sm btn-ghost" href="#/activity">${esc(t('dash.recent.viewAll'))}${icon('arrow', 12)}</a>
          </div>
          ${recent.length ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>${esc(t('act.col.event'))}</th><th>${esc(t('act.col.detail'))}</th><th class="right">${esc(t('act.col.time'))}</th></tr></thead>
            <tbody>${recent.map((item) => {
              const meta = eventMeta(item.event);
              return `<tr>
                <td><span class="row" style="gap:7px;flex-wrap:nowrap"><span class="event-dot ${meta.cls}">${icon(meta.icon, 12)}</span>${esc(meta.label)}</span></td>
                <td class="dim">${esc(item.detail || item.ip || '—')}</td>
                <td class="right dim nowrap">${relTime(item.ts)}</td>
              </tr>`;
            }).join('')}</tbody>
          </table></div>` : `<div style="padding:0 16px 16px"><div class="empty"><strong>${esc(t('act.empty.title'))}</strong>${esc(t('act.empty.desc'))}</div></div>`}
        </section>

        <section class="card">
          <div class="card-head">
            <div><h3>${esc(t('dash.health.title'))}</h3><p>${esc(t('dash.health.desc'))}</p></div>
            <span class="badge ${healthy === 4 ? 'ok' : 'warn'}">${esc(t('dash.health.passed', { n: healthy }))}</span>
          </div>
          <div class="list">
            ${checks.map((check) => `<div class="list-item">
              <span class="event-dot ${check.ok ? 'ok' : 'warn'}">${icon(check.ok ? 'check' : 'alert', 12)}</span>
              <div class="list-main"><strong>${esc(check.label)}</strong><span>${esc(check.text)}</span></div>
              <a class="btn btn-sm btn-ghost" href="#${check.route}">${esc(t('common.details'))}</a>
            </div>`).join('')}
          </div>
        </section>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head">
            <div><h3>${esc(t('dash.account.title'))}</h3><p>${esc(t('dash.account.desc'))}</p></div>
            ${accountMenu()}
          </div>
          <div class="kv">
            <div class="kv-row"><span class="k">${esc(t('dash.account.username'))}</span><span class="v mono">${esc(user.username)}</span></div>
            <div class="kv-row"><span class="k">${esc(t('dash.account.display'))}</span><span class="v">${esc(user.display_name || '—')}</span></div>
            <div class="kv-row"><span class="k">${esc(t('dash.account.email'))}</span><span class="v">${esc(user.email || t('common.notSet'))}</span></div>
            <div class="kv-row"><span class="k">${esc(t('dash.account.created'))}</span><span class="v">${fmtDay(user.created_at)}</span></div>
            <div class="kv-row"><span class="k">${esc(t('dash.account.lastLogin'))}</span><span class="v">${relTime((sessions.items[0] || {}).last_seen_at)}</span></div>
            <div class="kv-row"><span class="k">${esc(t('dash.account.status'))}</span><span class="v"><span class="badge ok">${esc(t('dash.account.active'))}</span></span></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <div><h3>${esc(t('dash.service.title'))}</h3><p>${esc(t('dash.service.address'))}</p></div>
            ${icon('terminal')}
          </div>
          <div class="kv">
            <div class="kv-row"><span class="k">${esc(t('dash.service.address'))}</span><span class="v mono">${esc((S.cfg && S.cfg.base_url) || '')}</span></div>
            <div class="kv-row"><span class="k">${esc(t('dash.service.version'))}</span><span class="v mono">v${esc((S.cfg && S.cfg.version) || '')} · ${esc((system && system.python) || '')}</span></div>
            <div class="kv-row"><span class="k">${esc(t('dash.service.uptime'))}</span><span class="v">${system ? fmtDuration(system.uptime || 0) : '—'}</span></div>
          </div>
          <div class="form-actions" style="margin-top:14px">
            <a class="btn btn-sm" href="#/data">${icon('database', 12)}${esc(t('dash.service.data'))}</a>
            ${IS_ANDROID ? '' : `<a class="btn btn-sm" href="/demo/" target="_blank" rel="noopener">${icon('play', 12)}${esc(t('dash.service.demo'))}</a>`}
          </div>
        </section>
      </div>`;
    return shell({ title: t('dash.title'), subtitle: t('dash.subtitle'), actions: accountMenu(), body });
  }

  /* ------------------------------ viewSecurity */
  async function viewSecurity() {
    const info = await api('/api/auth/session').catch(() => null);
    if (info) {
      if (typeof info.recovery_codes_left === 'number') S.recoveryCodesLeft = info.recovery_codes_left;
      S.developer = !!info.developer;
    }
    const body = `
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><div><h3>${esc(t('sec.password.title'))}</h3><p>${esc(t('sec.password.desc'))}</p></div>${icon('key')}</div>
          <form class="form-grid" data-form="password">
            <div class="field">
              <label for="pw-cur">${esc(t('sec.password.current'))}</label>
              <div class="input-wrap">
                <input class="input" id="pw-cur" name="current" type="password" autocomplete="current-password" required>
                <button type="button" class="peek" data-act="peek" aria-label="show">${icon('eye')}</button>
              </div>
            </div>
            <div class="field">
              <label for="pw-new">${esc(t('sec.password.new'))}</label>
              <div class="input-wrap">
                <input class="input" id="pw-new" name="password" type="password" autocomplete="new-password" required data-strength="1">
                <button type="button" class="peek" data-act="peek" aria-label="show">${icon('eye')}</button>
              </div>
              ${strengthMarkup()}
            </div>
            <div class="field">
              <label for="pw-new2">${esc(t('sec.password.confirm'))}</label>
              <input class="input" id="pw-new2" name="password2" type="password" autocomplete="new-password" required>
            </div>
            <div class="form-actions"><button class="btn btn-primary" type="submit">${esc(t('sec.password.save'))}</button></div>
          </form>
        </section>

        <section class="card">
          <div class="card-head">
            <div><h3>${esc(t('sec.recovery.title'))}</h3><p>${esc(t('sec.recovery.desc'))}</p></div>
            <span class="badge ${S.recoveryCodesLeft ? 'ok' : 'warn'}">${esc(t('sec.recovery.remaining', { n: S.recoveryCodesLeft }))}</span>
          </div>
          <p class="muted" style="font-size:12px;line-height:1.6">${esc(t('sec.recovery.warn'))}</p>
          <div class="alert warn" style="margin-top:12px">${icon('alert')}<div>${esc(t('sec.recovery.note'))}</div></div>
          <div class="form-actions" style="margin-top:14px">
            <button class="btn" data-act="regen-codes">${icon('refresh', 13)}${esc(t('sec.recovery.regenerate'))}</button>
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><div><h3>${esc(t('sec.profile.title'))}</h3><p>${esc(t('sec.profile.desc'))}</p></div>${icon('user')}</div>
        <form class="form-grid" data-form="profile">
          <div class="grid-2">
            <div class="field">
              <label for="pf-name">${esc(t('sec.profile.display'))}</label>
              <input class="input" id="pf-name" name="display_name" value="${esc(S.user.display_name || '')}" maxlength="32">
            </div>
            <div class="field">
              <label for="pf-mail">${esc(t('sec.profile.email'))} <span class="hint">${esc(t('common.optional'))}</span></label>
              <input class="input" id="pf-mail" name="email" type="email" value="${esc(S.user.email || '')}" placeholder="${esc(t('sec.profile.emailPh'))}">
            </div>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" type="submit">${esc(t('sec.profile.save'))}</button>
            <span class="dim" style="font-size:11.5px">${esc(t('sec.profile.locked'))} · @${esc(S.user.username)}</span>
          </div>
        </form>
      </section>

      <section class="card" style="border-color:var(--bad-border)">
        <div class="card-head"><div><h3 style="color:var(--bad)">${esc(t('sec.danger.title'))}</h3><p>${esc(t('sec.danger.desc'))}</p></div>${icon('alert')}</div>
        <div class="row-between">
          <p class="muted" style="font-size:12px;max-width:60ch">${esc(t('sec.danger.note'))}</p>
          <button class="btn btn-outline-danger" data-act="delete-account">${icon('trash', 13)}${esc(t('sec.danger.delete'))}</button>
        </div>
      </section>`;
    return shell({ title: t('sec.title'), subtitle: t('sec.subtitle'), actions: accountMenu(), body });
  }

  /* ------------------------------ viewDevices */
  async function viewDevices() {
    const sessions = await api('/api/sessions').catch(() => ({ items: [] }));
    S.counts.sessions = (sessions.items || []).length;
    const rows = (sessions.items || []).map((item) => `<tr>
      <td>
        <div class="row" style="flex-wrap:nowrap;gap:9px">
          <span class="event-dot ${item.current ? 'accent' : ''}">${icon('monitor', 12)}</span>
          <div>
            <strong>${esc(uaLabel(item.ua))}</strong>
            ${item.current ? `<span class="badge accent" style="margin-left:6px">${esc(t('dev.current'))}</span>` : ''}
            <div class="dim" style="font-size:10.5px">${esc(item.ip || '127.0.0.1')} · ${item.remember ? esc(t('dev.remember')) : esc(t('dev.temporary'))}</div>
          </div>
        </div>
      </td>
      <td class="nowrap dim">${relTime(item.last_seen_at)}</td>
      <td class="nowrap dim">${fmtDate(item.created_at)}</td>
      <td class="nowrap dim">${fmtDate(item.expires_at)}</td>
      <td class="right">${item.current
        ? '<span class="dim">—</span>'
        : `<button class="btn btn-sm btn-outline-danger" data-act="revoke-session" data-id="${esc(item.id)}">${esc(t('dev.revoke'))}</button>`}</td>
    </tr>`).join('');
    const body = `
      <section class="card flush">
        <div class="card-head">
          <div><h3>${esc(t('dev.title'))}</h3><p>${esc(t('dev.subtitle'))}</p></div>
          <button class="btn btn-sm" data-act="revoke-others">${icon('logout', 12)}${esc(t('dev.revokeAll'))}</button>
        </div>
        ${rows ? `<div class="table-wrap"><table class="table">
          <thead><tr>
            <th>${esc(t('dev.col.device'))}</th><th>${esc(t('dev.col.active'))}</th>
            <th>${esc(t('dev.col.login'))}</th><th>${esc(t('dev.col.expires'))}</th>
            <th class="right">${esc(t('dev.col.actions'))}</th>
          </tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div style="padding:0 16px 16px"><div class="empty"><strong>${esc(t('dev.empty.title'))}</strong>${esc(t('dev.empty.desc'))}</div></div>`}
      </section>
      <div class="alert">${icon('info')}<div>${esc(t('dev.note'))}</div></div>`;
    return shell({ title: t('dev.title'), subtitle: t('dev.subtitle'), body });
  }

  /* ------------------------------ viewApps */
  async function viewApps() {
    const [grants, tokens] = await Promise.all([
      api('/api/grants').catch(() => ({ items: [] })),
      api('/api/tokens').catch(() => ({ items: [] }))
    ]);
    const grantList = grants.items || [];
    const tokenList = tokens.items || [];
    S.counts.grants = grantList.length;
    S.counts.tokens = tokenList.length;

    const grouped = {};
    tokenList.forEach((item) => {
      if (!grouped[item.app_id]) {
        grouped[item.app_id] = { app_id: item.app_id, name: item.app_name, tokens: [] };
      }
      grouped[item.app_id].tokens.push(item);
    });
    const signed = Object.keys(grouped).map((key) => grouped[key]);
    const signedRows = signed.map((entry) => {
      const latest = entry.tokens.reduce((acc, item) => Math.max(acc, item.last_used_at || item.created_at), 0);
      const expiry = Math.max(...entry.tokens.map((item) => item.expires_at));
      return `<tr>
        <td>
          <div class="row" style="flex-wrap:nowrap;gap:9px">
            ${avatar(entry.name)}
            <div><strong>${esc(entry.name)}</strong><div class="dim mono" style="font-size:10.5px">${esc(entry.app_id)}</div></div>
          </div>
        </td>
        <td><span class="badge ok"><span class="dot"></span>${esc(t('apps.status.active'))}</span></td>
        <td class="dim nowrap">${relTime(latest)}</td>
        <td class="dim nowrap">${fmtDate(expiry)}</td>
        <td class="right">
          <button class="btn btn-sm btn-outline-danger" data-act="product-logout" data-app="${esc(entry.app_id)}">${esc(t('apps.signOut'))}</button>
        </td>
      </tr>`;
    }).join('');

    const grantRows = grantList.map((item) => `<tr>
      <td><div class="row" style="flex-wrap:nowrap;gap:9px">${avatar(item.app_name)}<div><strong>${esc(item.app_name)}</strong><div class="dim mono" style="font-size:10.5px">${esc(item.app_id)}</div></div></div></td>
      <td class="dim">${esc((item.scopes || []).join(' · ') || 'profile')}</td>
      <td class="dim nowrap">${fmtDate(item.created_at)}</td>
      <td class="right"><button class="btn btn-sm btn-outline-danger" data-act="revoke-grant" data-app="${esc(item.app_id)}">${esc(t('apps.revoke'))}</button></td>
    </tr>`).join('');

    const body = `
      <section class="card flush">
        <div class="card-head">
          <div><h3>${esc(t('apps.signed.title'))}</h3><p>${esc(t('apps.signed.desc'))}</p></div>
          <span class="badge">${esc(t('apps.grants.count', { n: signed.length }))}</span>
        </div>
        ${signedRows ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>${esc(t('apps.col.app'))}</th><th>${esc(t('apps.col.status'))}</th><th>${esc(t('apps.col.active'))}</th><th>${esc(t('apps.col.expires'))}</th><th class="right">${esc(t('apps.col.actions'))}</th></tr></thead>
          <tbody>${signedRows}</tbody></table></div>`
        : `<div style="padding:0 16px 16px"><div class="empty"><strong>${esc(t('apps.signed.empty.title'))}</strong>${esc(t('apps.signed.empty.desc'))}</div></div>`}
      </section>

      <section class="card flush">
        <div class="card-head">
          <div><h3>${esc(t('apps.grants.title'))}</h3><p>${esc(t('apps.grants.desc'))}</p></div>
          <span class="badge">${esc(t('apps.grants.count', { n: grantList.length }))}</span>
        </div>
        ${grantRows ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>${esc(t('apps.col.app'))}</th><th>${esc(t('apps.scope'))}</th><th>${esc(t('apps.grantedAt'))}</th><th class="right">${esc(t('apps.col.actions'))}</th></tr></thead>
          <tbody>${grantRows}</tbody></table></div>`
        : `<div style="padding:0 16px 16px"><div class="empty"><strong>${esc(t('apps.grants.empty.title'))}</strong>${esc(t('apps.grants.empty.desc'))}</div></div>`}
      </section>`;
    return shell({ title: t('apps.title'), subtitle: t('apps.subtitle'), body });
  }

  /* ------------------------------ agreementMarkup */
  function agreementMarkup(compact = false) {
    const items = ['1', '2', '3', '4', '5'];
    return `<div class="agreement-list">${items.map((index) => `
      <label class="agree-item" data-agree="${index}">
        <input type="checkbox" data-act="agree-toggle" data-key="item${index}" style="position:absolute;opacity:0;pointer-events:none">
        <span class="num">${index}</span>
        <span>${esc(t('dev.gate.item' + index))}</span>
        <span class="agree-box">${icon('check', 11)}</span>
      </label>`).join('')}</div>
      <div class="agreement-progress">
        <span data-agree-count>0 / ${items.length}</span>
        <span class="bar"><i data-agree-bar></i></span>
        <span>${esc(t('dev.gate.agreement'))}</span>
      </div>
      <div class="modal-actions">
        ${compact ? '' : `<button class="btn" data-act="close-modal">${esc(t('common.cancel'))}</button>`}
        <button class="btn btn-primary" data-act="developer-unlock" disabled>${esc(t('dev.gate.accept'))}</button>
      </div>`;
  }

  function openDeveloperGate() {
    S.gateAccepted = [];
    openModal(`
      <h3>${esc(t('dev.gate.title'))}</h3>
      <p class="modal-sub">${esc(t('dev.gate.desc'))}</p>
      <div class="modal-body">${agreementMarkup(false)}</div>`);
    syncAgreement();
  }
  function syncAgreement() {
    const total = 5;
    const count = S.gateAccepted.length;
    const label = $('[data-agree-count]');
    if (label) label.textContent = `${count} / ${total}`;
    const bar = $('[data-agree-bar]');
    if (bar) bar.style.width = `${Math.round((count / total) * 100)}%`;
    const submit = $('[data-act="developer-unlock"]');
    if (submit) {
      submit.disabled = count < total;
      submit.title = count < total ? t('dev.gate.locked') : '';
    }
    $$('[data-agree]').forEach((el) => {
      const key = el.dataset.agree;
      el.classList.toggle('on', S.gateAccepted.indexOf('item' + key) >= 0);
    });
  }

  function developerLockedView() {
    return shell({
      title: t('dev.gate.title'),
      subtitle: t('dev.gate.desc'),
      body: `<section class="card" style="max-width:780px">
        <div class="card-head"><div><h3>${esc(t('dev.gate.title'))}</h3><p>${esc(t('dev.gate.menuDesc'))}</p></div>${icon('lock')}</div>
        ${agreementMarkup(true)}
      </section>`
    });
  }

  /* ------------------------------ API_ROWS */
  const API_ROWS = [
    ['GET', '/sso/authorize', 'session', 'dev.api.authorize'],
    ['GET', '/sso/authorize?prompt=none', 'session', 'dev.api.silent'],
    ['POST', '/api/sso/approve', 'session', 'dev.api.approve'],
    ['POST', '/api/v1/ticket/redeem', 'secret', 'dev.api.redeem'],
    ['GET', '/api/v1/userinfo', 'token', 'dev.api.userinfo'],
    ['POST', '/api/v1/auth/login', 'secret', 'dev.api.login'],
    ['POST', '/api/v1/app/verify', 'secret', 'dev.api.verify'],
    ['POST', '/api/v1/logout', 'token', 'dev.api.revoke'],
    ['GET', '/api/v1/health', 'none', 'dev.api.health']
  ];
  const ERROR_ROWS = [
    ['login_required', '302', 'dev.err.loginRequired'],
    ['consent_required', '302', 'dev.err.consentRequired'],
    ['invalid_redirect', '400', 'dev.err.invalidRedirect'],
    ['invalid_client', '401', 'dev.err.invalidClient'],
    ['invalid_ticket', '400', 'dev.err.invalidTicket'],
    ['invalid_token', '401', 'dev.err.invalidToken'],
    ['access_denied', '302', 'dev.err.accessDenied'],
    ['unauthenticated', '401', 'dev.err.unauthorized']
  ];

  async function viewDeveloper() {
    if (!S.developer) return developerLockedView();
    const data = await api('/api/apps').catch(() => ({ items: [] }));
    const apps = data.items || [];
    S.apps = apps;
    const apiRows = API_ROWS.map(([method, path, auth, key]) => `<tr>
      <td><span class="endpoint"><span class="method ${method === 'GET' ? 'get' : ''}">${method}</span>${esc(path)}</span></td>
      <td class="dim nowrap">${esc(t('dev.api.auth.' + auth))}</td>
      <td class="muted">${esc(t(key))}</td>
    </tr>`).join('');
    const errRows = ERROR_ROWS.map(([code, http, key]) => `<tr>
      <td class="mono">${esc(code)}</td><td class="dim">${esc(http)}</td><td class="muted">${esc(t(key))}</td>
    </tr>`).join('');

    const appRows = apps.map((app) => `<div class="card-section" style="display:grid;gap:10px">
      <div class="row-between">
        <div class="row" style="gap:9px;flex-wrap:nowrap">
          ${avatar(app.name)}
          <div>
            <strong style="font-size:13px">${esc(app.name)}</strong>
            ${app.is_demo ? `<span class="badge accent" style="margin-left:6px">${esc(t('dev.app.demo'))}</span>` : ''}
            <div class="dim" style="font-size:11.5px">${esc(app.description || '')}</div>
          </div>
        </div>
        <div class="row" style="gap:6px">
          ${app.is_demo ? '' : `<button class="btn btn-sm" data-act="edit-app" data-app="${esc(app.app_id)}">${esc(t('dev.app.edit'))}</button>`}
          <button class="btn btn-sm" data-act="rotate-secret" data-app="${esc(app.app_id)}">${esc(t('dev.app.rotate'))}</button>
          ${app.is_demo ? '' : `<button class="btn btn-sm btn-outline-danger" data-act="delete-app" data-app="${esc(app.app_id)}">${esc(t('dev.app.delete'))}</button>`}
        </div>
      </div>
      <div class="grid-2" style="gap:10px">
        <div class="copy-inline">
          <span class="dim" style="font-family:var(--font);font-size:11px;flex:none">${esc(t('dev.app.id'))}</span>
          <span class="mono">${esc(app.app_id)}</span>
          <button class="btn btn-sm btn-ghost" data-act="copy" data-copy="${esc(app.app_id)}" title="${esc(t('common.copy'))}">${icon('copy', 12)}</button>
        </div>
        <div class="copy-inline">
          <span class="dim" style="font-family:var(--font);font-size:11px;flex:none">${esc(t('dev.app.secret'))}</span>
          <span class="mono">${esc(app.secret_hint)}</span>
        </div>
      </div>
      ${IS_ANDROID ? '' : `<div class="copy-inline">
        <span class="dim" style="font-family:var(--font);font-size:11px;flex:none">${esc(t('protect.code'))}</span>
        <span class="mono">${esc(app.public_code || '')}</span>
        <button class="btn btn-sm btn-ghost" data-act="copy" data-copy="${esc(app.public_code || '')}" title="${esc(t('common.copy'))}">${icon('copy', 12)}</button>
        ${app.protect && app.protect.verified
          ? `<span class="badge ok" style="flex:none">${icon('shield', 11)}${esc(t('protect.badge'))}</span>`
          : `<span class="badge" style="flex:none">${esc(t('protect.unverified'))}</span>`}
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
        <span class="dim" style="font-size:11px">${esc(t('protect.publisher', { name: app.publisher || '—' }))}</span>
        ${app.protect && app.protect.verified
          ? `<span class="dim mono" style="font-size:11px">${esc(t('protect.cert'))}: ${esc(app.protect.certificate_id || '')}</span>
             <button class="btn btn-sm" data-act="protect-revoke" data-app="${esc(app.app_id)}">${esc(t('protect.revoke'))}</button>`
          : `<button class="btn btn-sm" data-act="protect" data-app="${esc(app.app_id)}">${icon('shield', 12)}${esc(t('protect.enable'))}</button>`}
      </div>`}
      <div class="kv">
        <div class="kv-row"><span class="k">${esc(t('dev.app.redirects'))}</span><span class="v">${(app.redirect_uris || []).map((uri) => `<span class="mono">${esc(uri)}</span>`).join('<br>') || esc(t('dev.app.noRedirects'))}</span></div>
        <div class="kv-row"><span class="k">${esc(t('dev.app.lastUsed'))}</span><span class="v">${app.last_used_at ? relTime(app.last_used_at) : esc(t('common.neverUsed'))}</span></div>
      </div>
    </div>`).join('');

    const snippetTabs = Object.keys(window.YL_SNIPPETS).map((key, index) =>
      `<button class="code-tab${index === 0 ? ' active' : ''}" data-act="snippet" data-lang="${esc(key)}">${esc(window.YL_SNIPPETS[key].label)}</button>`
    ).join('');

    const body = `
      <section class="card">
        <div class="card-head">
          <div><h3>${esc(t('dev.flow.title'))}</h3><p>${esc(t('dev.flow.desc'))}</p></div>
          <div class="row" style="gap:6px">
            <span class="badge accent">${esc(t('auth.foot.protocol'))}</span>
            <button class="btn btn-sm" data-act="developer-lock">${icon('lock', 12)}${esc(t('dev.gate.lock'))}</button>
          </div>
        </div>
        <div class="flow">
          <div class="flow-step"><div class="idx">STEP 1</div><h4>${esc(t('dev.flow.s1t'))}</h4><p>${esc(t('dev.flow.s1d'))}</p></div>
          <div class="flow-step"><div class="idx">STEP 2</div><h4>${esc(t('dev.flow.s2t'))}</h4><p>${esc(t('dev.flow.s2d'))}</p></div>
          <div class="flow-step"><div class="idx">STEP 3</div><h4>${esc(t('dev.flow.s3t'))}</h4><p>${esc(t('dev.flow.s3d'))}</p></div>
        </div>
      </section>

      <section class="card flush">
        <div class="card-head">
          <div><h3>${esc(t('dev.api.title'))}</h3><p>${esc(t('dev.api.desc'))}</p></div>
          <code class="mono dim">${esc(((S.cfg && S.cfg.base_url) || 'http://127.0.0.1:8600').replace(/^https?:\/\//, ''))}</code>
        </div>
        <div class="table-wrap"><table class="api-table">
          <thead><tr><th>${esc(t('dev.api.col.endpoint'))}</th><th>${esc(t('dev.api.col.auth'))}</th><th>${esc(t('dev.api.col.desc'))}</th></tr></thead>
          <tbody>${apiRows}</tbody>
        </table></div>
      </section>

      <section class="card">
        <div class="card-head"><div><h3>${esc(t('dev.samples.title'))}</h3><p>${esc(t('dev.samples.desc'))}</p></div>${icon('code')}</div>
        <div class="code-tabs" id="snippet-tabs">${snippetTabs}</div>
        <pre class="code-block" id="snippet-box">${esc(window.YL_SNIPPETS.browser.code)}</pre>
      </section>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><div><h3>${esc(t('dev.err.title'))}</h3><p>${esc(t('dev.err.desc'))}</p></div></div>
          <div class="table-wrap"><table class="api-table">
            <thead><tr><th>${esc(t('dev.err.col.code'))}</th><th>${esc(t('dev.err.col.http'))}</th><th>${esc(t('dev.err.col.meaning'))}</th></tr></thead>
            <tbody>${errRows}</tbody>
          </table></div>
        </section>

        <section class="card">
          <div class="card-head"><div><h3>${esc(t('dev.sec.title'))}</h3><p>${esc(t('dev.sec.desc'))}</p></div>${icon('shield')}</div>
          <div class="list">
            ${['1', '2', '3', '4', '5'].map((index) => `<div class="list-item">
              <span class="event-dot ok">${icon('check', 12)}</span>
              <div class="list-main"><strong>${esc(t('dev.sec.i' + index + 't'))}</strong><span>${esc(t('dev.sec.i' + index + 'd'))}</span></div>
            </div>`).join('')}
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><div><h3>${esc(t('dev.sdk.title'))}</h3><p>${esc(t('dev.sdk.desc'))}</p></div></div>
        <div class="kv">
          <div class="kv-row"><span class="k">${esc(t('dev.sdk.browser'))}</span><span class="v mono">web/yl-sso.js</span></div>
          <div class="kv-row"><span class="k">${esc(t('dev.sdk.python'))}</span><span class="v mono">integration/python/yistarline_sso.py</span></div>
          <div class="kv-row"><span class="k">${esc(t('dev.sdk.node'))}</span><span class="v mono">integration/node/yistarline-sso.js</span></div>
        </div>
        <div class="alert" style="margin-top:12px">${icon('info')}<div>${esc(t('dev.sdk.note'))}</div></div>
      </section>

      <section class="card flush">
        <div class="card-head">
          <div><h3>${esc(t('dev.apps.title'))}</h3><p>${esc(t('dev.apps.desc'))}</p></div>
          <a class="btn btn-sm" href="/docs/integration.md" target="_blank" rel="noopener">${icon('external', 12)}${esc(t('dev.docs'))}</a>
        </div>
        ${appRows || `<div style="padding:0 16px 16px"><div class="empty"><strong>${esc(t('dev.apps.title'))}</strong>${esc(t('dev.apps.submitHint'))}</div></div>`}
      </section>

      <section class="card">
        <div class="card-head"><div><h3>${esc(t('dev.apps.create'))}</h3><p>${esc(t('dev.apps.submitHint'))}</p></div>${icon('plus')}</div>
        <form class="form-grid" data-form="createApp">
          <div class="grid-2">
            <div class="field">
              <label for="app-name">${esc(t('dev.apps.name'))}</label>
              <input class="input" id="app-name" name="name" maxlength="40" required>
            </div>
            <div class="field">
              <label for="app-desc">${esc(t('dev.apps.descLabel'))} <span class="hint">${esc(t('common.optional'))}</span></label>
              <input class="input" id="app-desc" name="description" maxlength="200" placeholder="${esc(t('dev.apps.descPh'))}">
            </div>
          </div>
          <div class="field">
            <label for="app-uris">${esc(t('dev.apps.redirects'))} <span class="hint">${esc(t('dev.apps.redirectsHint'))}</span></label>
            <textarea class="textarea" id="app-uris" name="redirect_uris" placeholder="http://127.0.0.1:{port}/sso/callback" required></textarea>
            <span class="hint">${esc(t('dev.apps.redirectsNote'))}</span>
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">${icon('plus', 13)}${esc(t('dev.apps.submit'))}</button></div>
        </form>
      </section>

      <section class="card">
        <div class="card-head"><div><h3>${esc(t('dev.trouble.title'))}</h3><p>${esc(t('dev.trouble.desc'))}</p></div></div>
        <div class="list">
          ${['1', '2', '3', '4'].map((index) => `<div class="list-item" style="align-items:flex-start">
            <span class="event-dot warn">${icon('alert', 12)}</span>
            <div class="list-main"><strong>${esc(t('dev.trouble.q' + index))}</strong><span style="line-height:1.6">${esc(t('dev.trouble.a' + index))}</span></div>
          </div>`).join('')}
        </div>
      </section>`;
    return shell({ title: t('dev.devTitle'), subtitle: t('dev.devSubtitle'), actions: accountMenu(), body });
  }

  /* ------------------------------ EVENT_ICONS */
  const EVENT_ICONS = {
    register: ['ok', 'check'], login: ['ok', 'check'], login_failed: ['bad', 'alert'],
    logout: ['', 'logout'], password_changed: ['accent', 'key'],
    recovery_used: ['warn', 'key'], recovery_regenerated: ['accent', 'refresh'],
    recovery_failed: ['bad', 'alert'], session_revoked: ['warn', 'monitor'],
    sessions_revoked: ['warn', 'monitor'], grant_revoked: ['warn', 'link'],
    token_revoked: ['warn', 'key'], app_created: ['accent', 'plus'],
    app_updated: ['accent', 'code'], app_deleted: ['bad', 'trash'],
    app_secret_rotated: ['warn', 'key'], sso_authorized: ['ok', 'check'],
    sso_silent: ['ok', 'key'], sso_denied: ['warn', 'x'],
    ticket_redeemed: ['ok', 'key'], product_login: ['ok', 'user'],
    backup: ['accent', 'database'], autostart: ['', 'power'],
    shutdown: ['warn', 'power'], account_deleted: ['bad', 'trash'],
    audit_cleared: ['warn', 'trash'], profile_updated: ['accent', 'user'],
    developer_unlocked: ['accent', 'code'], developer_locked: ['warn', 'lock'],
    product_logout: ['warn', 'logout']
  };
  function eventMeta(event) {
    const known = EVENT_ICONS[event];
    const label = t('event.' + event);
    return { label: label === 'event.' + event ? event : label, cls: known ? known[0] : '', icon: known ? known[1] : 'activity' };
  }

  async function viewActivity(params) {
    const scope = params.scope === 'all' ? 'all' : 'me';
    const data = await api(`/api/activity?limit=120&scope=${scope}`).catch(() => ({ items: [] }));
    const items = data.items || [];
    const rows = items.map((item) => {
      const meta = eventMeta(item.event);
      return `<tr>
        <td><span class="row" style="gap:7px;flex-wrap:nowrap"><span class="event-dot ${meta.cls}">${icon(meta.icon, 12)}</span>${esc(meta.label)}</span></td>
        <td class="dim">${esc(item.detail || '—')}</td>
        <td class="dim nowrap">${esc(item.username || '—')}</td>
        <td class="dim nowrap">${esc(item.ip || '—')}</td>
        <td class="dim nowrap">${fmtDate(item.ts)}</td>
      </tr>`;
    }).join('');
    const body = `
      <section class="card flush">
        <div class="card-head">
          <div><h3>${esc(t('act.title'))}</h3><p>${esc(t('act.subtitle'))}</p></div>
          <div class="row" style="gap:6px">
            <button class="btn btn-sm ${scope === 'me' ? 'btn-primary' : 'btn-ghost'}" data-act="activity-scope" data-scope="me">${esc(t('act.mine'))}</button>
            <button class="btn btn-sm ${scope === 'all' ? 'btn-primary' : 'btn-ghost'}" data-act="activity-scope" data-scope="all">${esc(t('act.all'))}</button>
            <button class="btn btn-sm btn-outline-danger" data-act="clear-activity">${esc(t('act.clear'))}</button>
          </div>
        </div>
        ${rows ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>${esc(t('act.col.event'))}</th><th>${esc(t('act.col.detail'))}</th><th>${esc(t('act.col.user'))}</th><th>${esc(t('act.col.source'))}</th><th>${esc(t('act.col.time'))}</th></tr></thead>
          <tbody>${rows}</tbody></table></div>`
        : `<div style="padding:0 16px 16px"><div class="empty"><strong>${esc(t('act.empty.title'))}</strong>${esc(t('act.empty.desc'))}</div></div>`}
      </section>`;
    return shell({ title: t('act.title'), subtitle: t('act.subtitle'), body });
  }

  /* ------------------------------ viewData */
  async function viewData() {
    const system = await api('/api/system').catch(() => null);
    S.system = system;
    const info = system || {};
    const body = `
      <div class="grid-2">
        <section class="card">
          <div class="card-head"><div><h3>${esc(t('data.dir.title'))}</h3><p>${esc(t('data.dir.desc'))}</p></div>${icon('database')}</div>
          <div class="copy-inline" style="margin-bottom:12px">
            <span class="mono">${esc(info.data_dir || '')}</span>
            <button class="btn btn-sm" data-act="copy" data-copy="${esc(info.data_dir || '')}">${icon('copy', 12)}</button>
          </div>
          <div class="kv">
            <div class="kv-row"><span class="k">${esc(t('data.dir.size'))}</span><span class="v">${fmtBytes(info.db_bytes)}</span></div>
            <div class="kv-row"><span class="k">${esc(t('data.dir.users'))}</span><span class="v">${num(info.users)}</span></div>
            <div class="kv-row"><span class="k">${esc(t('data.dir.apps'))}</span><span class="v">${num(info.apps)}</span></div>
            <div class="kv-row"><span class="k">${esc(t('data.dir.audit'))}</span><span class="v">${num(info.audit_count)}</span></div>
            <div class="kv-row"><span class="k">${esc(t('data.dir.url'))}</span><span class="v mono">${esc(info.base_url || '')}</span></div>
            <div class="kv-row"><span class="k">${esc(t('data.dir.pid'))}</span><span class="v mono">PID ${esc(info.pid || '')} · ${esc(info.python || '')}</span></div>
          </div>
          ${IS_ANDROID ? '' : `<div class="form-actions" style="margin-top:14px">
            <button class="btn" data-act="open-folder" data-target="data">${icon('folder', 13)}${esc(t('data.dir.openData'))}</button>
            <button class="btn" data-act="open-folder" data-target="logs">${esc(t('data.dir.openLogs'))}</button>
          </div>`}
        </section>

        <section class="card">
          <div class="card-head"><div><h3>${esc(t('data.backup.title'))}</h3><p>${esc(t('data.backup.desc'))}</p></div>${icon('download')}</div>
          <p class="muted" style="font-size:12px;line-height:1.65">${esc(t('data.backup.note'))}</p>
          <div class="alert warn" style="margin-top:12px">${icon('alert')}<div>${esc(t('data.backup.restore'))}</div></div>
          <div class="form-actions" style="margin-top:14px">
            <button class="btn btn-primary" data-act="backup">${icon('download', 13)}${esc(t('data.backup.now'))}</button>
            <button class="btn" data-act="open-folder" data-target="backups">${esc(t('data.backup.open'))}</button>
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><div><h3>${esc(t('data.run.title'))}</h3><p>${esc(t('data.run.desc'))}</p></div></div>
        <div class="list">
          ${IS_ANDROID ? `<div class="list-item">
            <span class="event-dot accent">${icon('download', 12)}</span>
            <div class="list-main"><strong>${esc(t('data.backup.now'))}</strong><span>${esc(t('data.backup.desc'))}</span></div>
            <button class="btn btn-sm" data-act="restore-backup">${esc(t('data.backup.restore'))}</button>
          </div>` : `<div class="list-item">
            <span class="event-dot ${info.autostart ? 'ok' : ''}">${icon('power', 12)}</span>
            <div class="list-main"><strong>${esc(t('data.run.autostart'))}</strong><span>${esc(t('data.run.autostartDesc'))}</span></div>
            <label class="check" style="font-size:0"><input type="checkbox" data-toggle-autostart ${info.autostart ? 'checked' : ''} aria-label="${esc(t('data.run.autostart'))}"></label>
          </div>`}
          <div class="list-item">
            <span class="event-dot">${icon('clock', 12)}</span>
            <div class="list-main"><strong>${esc(t('data.run.uptime'))}</strong><span>${esc(t('data.run.started', { time: fmtDate(info.started_at) }))}</span></div>
            <span class="badge">${fmtDuration(info.uptime || 0)}</span>
          </div>
          ${IS_ANDROID ? '' : `<div class="list-item">
            <span class="event-dot warn">${icon('power', 12)}</span>
            <div class="list-main"><strong>${esc(t('data.run.stop'))}</strong><span>${esc(t('data.run.stopDesc'))}</span></div>
            <button class="btn btn-sm btn-outline-danger" data-act="shutdown">${esc(t('data.run.stop'))}</button>
          </div>`}
        </div>
      </section>`;
    return shell({ title: t('data.title'), subtitle: t('data.subtitle'), body });
  }

  /* ------------------------------ viewAbout */
  function viewAbout() {
    const version = (S.cfg && S.cfg.version) || '1.2.0';
    const items = ['1', '2', '3', '4', '5'].map((index) => `<div class="list-item" style="align-items:flex-start">
      <span class="event-dot ${index === '5' ? 'warn' : 'ok'}">${icon(index === '5' ? 'alert' : 'check', 12)}</span>
      <div class="list-main"><strong>${esc(t('about.sec.i' + index + 't'))}</strong><span style="line-height:1.6">${esc(t('about.sec.i' + index + 'd'))}</span></div>
    </div>`).join('');
    const body = `
      <section class="card">
        <div class="row-between">
          <div class="row" style="gap:12px;flex-wrap:nowrap">
            <span class="brand-mark lg">${esc(t('app.mark'))}</span>
            <div>
              <h3 style="font-size:16px">${esc(t('app.full'))}</h3>
              <p class="dim" style="font-size:12px;margin-top:2px">${esc(t('about.version', { v: version }))} · ${esc(t('about.protocol'))} · Python</p>
            </div>
          </div>
          <a class="btn btn-sm" href="/demo/" target="_blank" rel="noopener">${icon('play', 12)}${esc(t('nav.demo'))}</a>
        </div>
      </section>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><div><h3>${esc(t('about.sec.title'))}</h3><p>${esc(t('about.sec.desc'))}</p></div></div>
          <div class="list">${items}</div>
        </section>
        <section class="card">
          <div class="card-head"><div><h3>${esc(t('about.files.title'))}</h3><p>${esc(t('about.files.desc'))}</p></div>${icon('database')}</div>
          <div class="kv">
            <div class="kv-row"><span class="k mono">data/accounts.db</span><span class="v">${esc(t('about.files.db'))}</span></div>
            <div class="kv-row"><span class="k mono">data/secret.key</span><span class="v">${esc(t('about.files.key'))}</span></div>
            <div class="kv-row"><span class="k mono">data/config.json</span><span class="v">${esc(t('about.files.config'))}</span></div>
            <div class="kv-row"><span class="k mono">data/runtime.json</span><span class="v">${esc(t('about.files.runtime'))}</span></div>
            <div class="kv-row"><span class="k mono">logs/server.log</span><span class="v">${esc(t('about.files.log'))}</span></div>
            <div class="kv-row"><span class="k mono">data/backups/</span><span class="v">${esc(t('about.files.backup'))}</span></div>
          </div>
          <div class="alert accent" style="margin-top:12px">${icon('info')}<div>${esc(t('about.note'))}</div></div>
        </section>
      </div>

      <section class="card">
        <div class="row-between">
          <p class="dim" style="font-size:11.5px">${esc(t('about.endpoints'))}: <span class="mono">/sso/authorize · /api/v1/ticket/redeem · /api/v1/userinfo · /api/v1/auth/login</span></p>
          <a class="btn btn-sm" href="/docs/integration.md" target="_blank" rel="noopener">${icon('code', 12)}${esc(t('about.docs'))}</a>
        </div>
      </section>`;
    return shell({ title: t('about.title'), subtitle: t('about.subtitle'), body });
  }

  /* ------------------------------ viewConsent */
  async function viewConsent(params) {
    const appId = params.app_id || '';
    const code = (params.code || '').toUpperCase();
    const appName = params.name || '';
    const publisher = params.publisher || '';
    const redirectUri = params.redirect_uri || '';
    const state = params.state || '';
    if (!S.user) {
      const next = `/sso/authorize?${new URLSearchParams({
        app_id: appId, code, redirect_uri: redirectUri, state, name: appName, publisher
      }).toString()}`;
      location.replace(`/#/login?${new URLSearchParams({ next }).toString()}`);
      return '';
    }
    if ((!appId && !code) || !redirectUri) {
      return `<div class="consent-wrap"><div class="consent"><h2>${esc(t('consent.invalidTitle'))}</h2><p class="muted" style="margin-top:6px;font-size:12px">${esc(t('consent.invalidDesc'))}</p></div></div>`;
    }
    const info = await api('/api/sso/consent', {
      method: 'POST',
      body: { app_id: appId, code, name: appName, publisher, redirect_uri: redirectUri, state }
    }).catch((err) => ({ error: err.message }));
    if (info.error) {
      return `<div class="consent-wrap"><div class="consent"><h2>${esc(t('consent.failTitle'))}</h2><p class="muted" style="margin-top:6px;font-size:12px">${esc(info.error)}</p></div></div>`;
    }
    S.consent = {
      app_id: info.app.app_id || '', code, name: appName, publisher,
      redirect_uri: redirectUri, state
    };
    const app = info.app;
    const isPopup = !!window.opener;
    return `<div class="consent-wrap">
      <div class="consent">
        <div class="consent-brand">
          <span class="brand-mark">${esc(t('app.mark'))}</span>
          <span>${esc(t('app.brand'))}</span>
        </div>
        <div class="consent-app">
          ${avatar(app.name)}
          <div style="min-width:0">
            <h2>${esc(app.name)}</h2>
            <p>${esc(t('consent.subtitle', { app: app.host }))}</p>
            <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:6px;align-items:center">
              ${app.public_code ? `<span class="mono dim" style="font-size:11px">${esc(app.public_code)}</span>` : ''}
              ${app.publisher ? `<span class="dim" style="font-size:11px">${esc(t('consent.publisher', { name: app.publisher }))}</span>` : ''}
              ${app.protect && app.protect.verified
                ? `<span class="badge ok">${icon('shield', 11)}${esc(t('protect.badge'))}</span>`
                : `<span class="badge">${esc(t('protect.unverified'))}</span>`}
            </div>
          </div>
        </div>

        ${info.pending ? `<div class="alert accent" style="margin-top:12px">${icon('info')}<div><strong>${esc(t('consent.pendingTitle'))}</strong><br>${esc(t('consent.pendingDesc'))}</div></div>` : ''}

        <div class="consent-user">
          ${avatar(info.user.display_name || info.user.username)}
          <div style="min-width:0">
            <strong>${esc(info.user.display_name || info.user.username)}</strong>
            <div class="dim" style="font-size:11px">@${esc(info.user.username)}</div>
          </div>
          <a class="switch" href="/#/login?switch=1" data-act="consent-switch">${esc(t('consent.switch'))}</a>
        </div>

        <div class="consent-section-title">${esc(t('consent.permissions'))}</div>
        <div class="perm-list">
          <div class="perm">
            <span class="ico">${icon('user', 13)}</span>
            <div><strong>${esc(t('consent.permProfile'))}</strong><span>${esc(t('consent.permProfileDesc'))}</span></div>
          </div>
          <div class="perm">
            <span class="ico">${icon('key', 13)}</span>
            <div><strong>${esc(t('consent.permSignin'))}</strong><span>${esc(t('consent.permSigninDesc'))}</span></div>
          </div>
        </div>

        <div class="consent-details">
          <button type="button" class="link-btn" data-act="consent-details" aria-expanded="false">
            <span data-details-label>${esc(t('consent.detailsShow'))}</span>${icon('chevron', 12)}
          </button>
          <div class="details-body hidden" id="consent-details">
            <div class="details-intro">${esc(t('consent.detailsIntro'))}</div>
            <div class="scope-row">${icon('check', 12)}<span>${esc(t('consent.scopeProfile'))}</span></div>
            <div class="scope-row">${icon('check', 12)}<span>${esc(t('consent.scopeToken'))}</span></div>
            <div class="scope-row">${icon('check', 12)}<span>${esc(t('consent.scopeSession'))}</span></div>
          </div>
        </div>

        <label class="check" style="margin-top:14px"><input type="checkbox" id="consent-remember" checked> ${esc(t('consent.remember'))}</label>

        <div class="consent-actions">
          <button class="btn" data-act="consent-deny">${esc(t('consent.deny'))}</button>
          <button class="btn btn-primary" data-act="consent-allow">${esc(t('consent.allow'))}</button>
        </div>
        <div class="consent-foot">
          ${icon('lock', 11)}<span>${esc(t('consent.secure'))}</span><span class="dot"></span>
          <span>${esc(isPopup ? t('consent.popupNote') : t('consent.note'))}</span>
        </div>
      </div>
    </div>`;
  }

  /* ------------------------------ GUARDED */
  const GUARDED = new Set(['/dashboard', '/security', '/devices', '/apps', '/developer', '/activity', '/data', '/about']);

  async function render() {
    const { path, params } = parseHash();
    S.route = path;
    const app = $('#app');
    if (document.body.classList.contains('m-sheet-open')) {
      const root = document.getElementById('modal-root');
      if (root) root.innerHTML = '';
      document.body.classList.remove('m-sheet-open');
    }
    if (GUARDED.has(path) && !S.user) {
      location.replace('#/login');
      return;
    }
    if (path === '/') {
      if (S.user) location.replace('#/dashboard');
      else if (S.cfg && !S.cfg.has_users) location.replace('#/register');
      else location.replace('#/login');
      return;
    }
    if (path === '/login') {
      if (S.user && !params.next) { location.replace('#/dashboard'); return; }
      await ensureAccounts();
      app.innerHTML = viewLogin(params);
      document.title = `${t('auth.login.title')} · ${t('app.name')}`;
      return;
    }
    if (path === '/register') {
      if (S.user && !params.next) { location.replace('#/dashboard'); return; }
      app.innerHTML = viewRegister(params);
      document.title = `${t('auth.register.title')} · ${t('app.name')}`;
      return;
    }
    if (path === '/recover') {
      app.innerHTML = viewRecover();
      document.title = `${t('auth.recover.title')} · ${t('app.name')}`;
      return;
    }
    if (path === '/authorize') {
      app.innerHTML = `<div class="page"><div class="empty">${esc(t('common.loading'))}</div></div>`;
      app.innerHTML = await viewConsent(params);
      document.title = t('app.name');
      return;
    }

    let html = '';
    if (path === '/dashboard') {
      html = await viewDashboard();
      document.title = `${t('dash.title')} · ${t('app.name')}`;
    } else if (path === '/security') {
      html = await viewSecurity();
      document.title = `${t('sec.title')} · ${t('app.name')}`;
    } else if (path === '/devices') {
      html = await viewDevices();
      document.title = `${t('dev.title')} · ${t('app.name')}`;
    } else if (path === '/apps') {
      html = await viewApps();
      document.title = `${t('apps.title')} · ${t('app.name')}`;
    } else if (path === '/developer') {
      html = await viewDeveloper();
      document.title = `${t('dev.devTitle')} · ${t('app.name')}`;
    } else if (path === '/activity') {
      html = await viewActivity(params);
      document.title = `${t('act.title')} · ${t('app.name')}`;
    } else if (path === '/data') {
      html = await viewData();
      document.title = `${t('data.title')} · ${t('app.name')}`;
    } else if (path === '/about') {
      html = viewAbout();
      document.title = `${t('about.title')} · ${t('app.name')}`;
    } else {
      html = shell({
        title: '404',
        subtitle: '',
        body: `<div class="empty"><strong>404</strong><a href="#/dashboard">${esc(t('nav.overview'))}</a></div>`
      });
    }
    app.innerHTML = html;
  }

  /* ------------------------------ copyText */
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      area.remove();
      return ok;
    }
  }
  function downloadText(filename, content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1200);
  }

  function showRecoveryCodes(codes, title) {
    S.pendingCodes = codes;
    openModal(`
      <h3>${esc(title || t('modal.codes.title'))}</h3>
      <p class="modal-sub">${esc(t('modal.codes.desc'))}</p>
      <div class="modal-body">
        <div class="codes-grid">${codes.map((code) => `<div class="code-pill">${esc(code)}</div>`).join('')}</div>
        <div class="alert warn" style="margin-top:12px">${icon('alert')}<div>${esc(t('modal.codes.warn'))}</div></div>
      </div>
      <div class="modal-actions">
        <button class="btn" data-act="download-codes">${icon('download', 13)}${esc(t('modal.codes.download'))}</button>
        <button class="btn btn-primary" data-act="close-modal">${esc(t('modal.codes.saved'))}</button>
      </div>`);
  }
  function showSecret(appId, secret, appName) {
    openModal(`
      <h3>${esc(t('dev.secret.title'))}</h3>
      <p class="modal-sub">${esc(t('dev.secret.desc', { name: appName }))}</p>
      <div class="modal-body">
        <div class="kv">
          <div class="kv-row"><span class="k">${esc(t('dev.app.id'))}</span><span class="v mono">${esc(appId)}</span></div>
        </div>
        <div class="copy-inline" style="margin-top:8px">
          <span>${esc(secret)}</span>
          <button class="btn btn-sm" data-act="copy" data-copy="${esc(secret)}">${icon('copy', 12)}${esc(t('common.copy'))}</button>
        </div>
        <div class="alert warn" style="margin-top:12px">${icon('alert')}<div>${esc(t('dev.secret.warn'))}</div></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" data-act="close-modal">${esc(t('dev.secret.saved'))}</button>
      </div>`);
  }

  /* ------------------------------ FORMS */
  const FORMS = {
    async login(form, fd) {
      const data = await api('/api/auth/login', {
        method: 'POST',
        body: {
          username: String(fd.get('username') || '').trim(),
          password: String(fd.get('password') || ''),
          remember: fd.get('remember') === 'on'
        }
      });
      S.user = data.user;
      S.recoveryCodesLeft = data.recovery_codes_left || 0;
      S.accounts = null;
      S.loginStep = 'choose';
      S.pickedUsername = '';
      toast(t('toast.loginOk'));
      const next = form.dataset.next || '';
      if (next) location.href = next;
      else location.hash = '#/dashboard';
    },

    async register(form, fd) {
      const password = String(fd.get('password') || '');
      if (password !== String(fd.get('password2') || '')) throw new Error(t('toast.mismatch'));
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: {
          username: String(fd.get('username') || '').trim(),
          display_name: String(fd.get('display_name') || '').trim(),
          password
        }
      });
      S.user = data.user;
      S.recoveryCodesLeft = (data.recovery_codes || []).length;
      if (S.cfg) S.cfg.has_users = true;
      S.accounts = null;
      S.loginStep = 'choose';
      showRecoveryCodes(data.recovery_codes || []);
      toast(t('toast.registerOk'));
      location.hash = '#/dashboard';
    },

    async recover(form, fd) {
      const data = await api('/api/auth/reset', {
        method: 'POST',
        body: {
          username: String(fd.get('username') || '').trim(),
          code: String(fd.get('code') || '').trim(),
          password: String(fd.get('password') || '')
        }
      });
      toast(t('toast.resetOk', { n: data.codes_left }));
      location.hash = '#/login';
    },

    async password(form, fd) {
      const password = String(fd.get('password') || '');
      if (password !== String(fd.get('password2') || '')) throw new Error(t('toast.mismatch'));
      const data = await api('/api/auth/password', {
        method: 'POST',
        body: { current: String(fd.get('current') || ''), password }
      });
      toast(t('toast.passwordChanged', { n: data.revoked_others }));
      form.reset();
    },

    async profile(form, fd) {
      const data = await api('/api/me', {
        method: 'PATCH',
        body: {
          display_name: String(fd.get('display_name') || '').trim(),
          email: String(fd.get('email') || '').trim()
        }
      });
      S.user = { ...S.user, ...data.user };
      toast(t('toast.profileSaved'));
    },

    async createApp(form, fd) {
      const data = await api('/api/apps', {
        method: 'POST',
        body: {
          name: String(fd.get('name') || '').trim(),
          description: String(fd.get('description') || '').trim(),
          redirect_uris: String(fd.get('redirect_uris') || '')
        }
      });
      form.reset();
      toast(t('toast.appCreated'));
      showSecret(data.app.app_id, data.app_secret, data.app.name);
      render();
    },

    async editApp(form, fd) {
      const appId = form.dataset.app || '';
      await api(`/api/apps/${encodeURIComponent(appId)}`, {
        method: 'PATCH',
        body: {
          name: String(fd.get('name') || '').trim(),
          description: String(fd.get('description') || '').trim(),
          redirect_uris: String(fd.get('redirect_uris') || '')
        }
      });
      closeModal();
      toast(t('toast.appUpdated'));
      render();
    },

    async protect(form, fd) {
      const appId = form.dataset.app || '';
      const accepted = fd.getAll('claim');
      try {
        await api(`/api/apps/${encodeURIComponent(appId)}/protect/verify`, {
          method: 'POST',
          body: { accepted, privacy_url: String(fd.get('privacy_url') || '').trim() }
        });
        closeModal();
        toast(t('protect.passed'));
        S.apps = null;
        render();
      } catch (err) {
        toast(err.message || t('protect.failed'), 'bad');
      }
    }
  };

  /* ------------------------------ ACTIONS */
  const ACTIONS = {
    'dd-toggle'(btn) {
      const wrap = btn.closest('.dd');
      const open = wrap.classList.contains('open');
      $$('.dd.open').forEach((el) => {
        el.classList.remove('open');
        const trigger = el.querySelector('.dd-trigger');
        if (trigger) trigger.setAttribute('aria-expanded', 'false');
      });
      if (!open) {
        wrap.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    },
    'set-lang'(btn) {
      const value = btn.dataset.value;
      closeDropdowns();
      if (window.I18N.setLang(value)) render();
    },
    'set-theme'(btn) {
      applyThemeMode(btn.dataset.value);
      closeDropdowns();
      render();
    },
    go(btn) {
      closeDropdowns();
      location.hash = btn.dataset.value;
    },
    peek(btn) {
      const input = btn.parentElement.querySelector('input');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eyeoff' : 'eye');
    },
    async copy(btn) {
      const ok = await copyText(btn.dataset.copy || '');
      toast(ok ? t('common.copied') : t('common.copyFail'), ok ? 'ok' : 'bad');
    },
    async logout() {
      try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (err) { /* ignore */ }
      S.user = null;
      S.developer = false;
      S.accounts = null;
      S.loginStep = 'choose';
      S.pickedUsername = '';
      location.hash = '#/login';
      toast(t('toast.logout'));
    },
    async 'pick-account'(btn) {
      const username = btn.dataset.username;
      if (S.deviceUsername && username === S.deviceUsername) {
        await ACTIONS['quick-login'](btn);
        return;
      }
      const account = (S.accounts || []).find((item) => item.username === username);
      S.pickedUsername = username;
      S.pickedName = account ? (account.display_name || account.username) : username;
      S.loginStep = 'password';
      render();
    },
    async 'quick-login'() {
      try {
        const data = await api('/api/auth/quick', { method: 'POST', body: {} });
        S.user = data.user;
        S.recoveryCodesLeft = data.recovery_codes_left || 0;
        S.accounts = null;
        S.loginStep = 'choose';
        toast(t('toast.quickOk'));
        if (S.loginNext) location.href = S.loginNext;
        else location.hash = '#/dashboard';
      } catch (err) {
        toast(t('login.quickFailed'), 'bad');
        const username = S.deviceUsername;
        const account = (S.accounts || []).find((item) => item.username === username);
        S.pickedUsername = username || '';
        S.pickedName = account ? (account.display_name || account.username) : (username || '');
        S.loginStep = username ? 'password' : 'manual';
        render();
      }
    },
    'login-manual'() {
      S.loginStep = 'manual';
      render();
    },
    'login-back'() {
      S.loginStep = 'choose';
      render();
    },
    'm-more'() {
      const root = document.getElementById('modal-root');
      if (!root) return;
      root.innerHTML = mobileSheet();
      document.body.classList.add('m-sheet-open');
    },
    'm-close'() {
      const root = document.getElementById('modal-root');
      if (root) root.innerHTML = '';
      document.body.classList.remove('m-sheet-open');
    },
    'm-sheet'() {
      /* 点击抽屉内部不关闭 */
    },
    'modal-cancel'() { if (S.modalResolve) S.modalResolve(null); },
    'modal-ok'() { if (S.modalResolve) S.modalResolve(true); },
    'modal-password-ok'() {
      const input = $('#modal-pw');
      const value = input ? input.value : '';
      if (!value) { toast(t('toast.passwordRequired'), 'bad'); return; }
      if (S.modalResolve) S.modalResolve(value);
    },
    'close-modal'() { closeModal(); },
    'download-codes'() {
      const codes = S.pendingCodes || [];
      const text = [
        t('modal.codes.fileTitle'),
        `${t('modal.codes.fileTime')}: ${new Date().toLocaleString(window.I18N.lang)}`,
        '',
        ...codes,
        '',
        t('modal.codes.fileNote')
      ].join('\n');
      downloadText('yistarline-recovery-codes.txt', text);
      toast(t('toast.codesDownloaded'));
    },
    async 'revoke-session'(btn) {
      const ok = await confirmDialog({
        title: t('modal.revoke.title'),
        message: t('dev.revoke.desc'),
        confirmText: t('modal.revoke.confirm'),
        danger: true
      });
      if (!ok) return;
      await api('/api/sessions/revoke', { method: 'POST', body: { id: btn.dataset.id } });
      toast(t('toast.sessionRevoked'));
      render();
    },
    async 'revoke-others'() {
      const ok = await confirmDialog({
        title: t('modal.revokeAll.title'),
        message: t('dev.revokeAll.desc'),
        confirmText: t('modal.revokeAll.confirm'),
        danger: true
      });
      if (!ok) return;
      const data = await api('/api/sessions/revoke-others', { method: 'POST', body: {} });
      toast(t('toast.sessionsRevoked', { n: data.revoked }));
      render();
    },
    async 'revoke-grant'(btn) {
      const ok = await confirmDialog({
        title: t('modal.revokeGrant.title'),
        message: t('apps.revoke.desc'),
        confirmText: t('modal.revokeGrant.confirm'),
        danger: true
      });
      if (!ok) return;
      await api('/api/grants/revoke', { method: 'POST', body: { app_id: btn.dataset.app } });
      toast(t('toast.grantRevoked'));
      render();
    },
    async 'product-logout'(btn) {
      const ok = await confirmDialog({
        title: t('apps.signOut'),
        message: t('apps.signOutDesc'),
        confirmText: t('apps.signOut'),
        danger: true
      });
      if (!ok) return;
      await api('/api/products/logout', { method: 'POST', body: { app_id: btn.dataset.app } });
      toast(t('toast.productLoggedOut'));
      render();
    },
    async 'regen-codes'() {
      const password = await askPassword({
        title: t('modal.regen.title'),
        message: t('modal.regen.desc'),
        confirmText: t('modal.regen.confirm')
      });
      if (!password) return;
      const data = await api('/api/auth/recovery/regenerate', { method: 'POST', body: { password } });
      S.recoveryCodesLeft = (data.recovery_codes || []).length;
      toast(t('toast.codesRegenerated'));
      showRecoveryCodes(data.recovery_codes || []);
      render();
    },
    async 'delete-account'() {
      const ok = await confirmDialog({
        title: t('modal.deleteStep1'),
        message: t('modal.deleteStep1Desc'),
        confirmText: t('modal.deleteStep1Confirm'),
        danger: true
      });
      if (!ok) return;
      const password = await askPassword({
        title: t('modal.deleteStep2'),
        message: t('modal.deleteStep2Desc', { user: S.user.username }),
        confirmText: t('modal.deleteStep2Confirm')
      });
      if (!password) return;
      await api('/api/account/delete', { method: 'POST', body: { password } });
      S.user = null;
      closeModal();
      toast(t('toast.accountDeleted'));
      location.hash = '#/login';
    },
    async backup() {
      const data = await api('/api/system/backup', { method: 'POST', body: {} });
      closeDropdowns();
      openModal(`
        <h3>${esc(t('modal.backup.title'))}</h3>
        <p class="modal-sub">${esc(t('modal.backup.desc'))}</p>
        <div class="modal-body"><div class="copy-inline"><span>${esc(data.path)}</span></div></div>
        <div class="modal-actions">
          <button class="btn" data-act="open-folder" data-target="backups">${esc(t('data.backup.open'))}</button>
          <button class="btn btn-primary" data-act="close-modal">${esc(t('common.close'))}</button>
        </div>`);
    },
    async 'open-folder'(btn) {
      await api('/api/system/open', { method: 'POST', body: { target: btn.dataset.target || 'data' } });
    },
    async 'restore-backup'() {
      await api('/api/system/import', { method: 'POST', body: {} });
    },
    async shutdown() {
      const ok = await confirmDialog({
        title: t('modal.stop.title'),
        message: t('data.run.stopConfirm'),
        confirmText: t('modal.stop.confirm'),
        danger: true
      });
      if (!ok) return;
      await api('/api/system/shutdown', { method: 'POST', body: {} });
      $('#app').innerHTML = `<div class="consent-wrap"><div class="consent" style="text-align:center">
        <h2>${esc(t('data.stopped.title'))}</h2>
        <p class="muted" style="margin-top:6px;font-size:12px">${esc(t('data.stopped.desc'))}</p>
      </div></div>`;
    },
    async 'clear-activity'() {
      const ok = await confirmDialog({
        title: t('modal.clear.title'),
        message: t('act.clear.desc'),
        confirmText: t('modal.clear.confirm'),
        danger: true
      });
      if (!ok) return;
      await api('/api/activity', { method: 'DELETE' });
      render();
    },
    'activity-scope'(btn) {
      location.hash = `#/activity?scope=${btn.dataset.scope}`;
    },
    'edit-app'(btn) {
      const app = (S.apps || []).find((item) => item.app_id === btn.dataset.app);
      if (!app) return;
      openModal(`
        <h3>${esc(t('dev.editTitle'))}</h3>
        <p class="modal-sub mono">${esc(app.app_id)}</p>
        <form class="modal-body form-grid" data-form="editApp" data-app="${esc(app.app_id)}">
          <div class="field"><label for="edit-name">${esc(t('dev.apps.name'))}</label>
            <input class="input" id="edit-name" name="name" value="${esc(app.name)}" maxlength="40" required></div>
          <div class="field"><label for="edit-desc">${esc(t('dev.apps.descLabel'))}</label>
            <input class="input" id="edit-desc" name="description" value="${esc(app.description || '')}" maxlength="200"></div>
          <div class="field"><label for="edit-uris">${esc(t('dev.apps.redirects'))}</label>
            <textarea class="textarea" id="edit-uris" name="redirect_uris" required>${esc((app.redirect_uris || []).join('\n'))}</textarea></div>
          <div class="modal-actions">
            <button type="button" class="btn" data-act="close-modal">${esc(t('common.cancel'))}</button>
            <button type="submit" class="btn btn-primary">${esc(t('common.save'))}</button>
          </div>
        </form>`);
    },
    async protect(btn) {
      await openProtectPanel(btn.dataset.app);
    },
    async 'protect-revoke'(btn) {
      const ok = await confirmDialog({
        title: t('protect.revoke'),
        message: t('protect.sub', { app: '' }),
        confirmText: t('protect.revoke'),
        danger: true
      });
      if (!ok) return;
      await api(`/api/apps/${encodeURIComponent(btn.dataset.app)}/protect/revoke`, {
        method: 'POST',
        body: {}
      });
      toast(t('protect.unverified'));
      S.apps = null;
      render();
    },
    async 'rotate-secret'(btn) {      const ok = await confirmDialog({
        title: t('modal.rotate.title'),
        message: t('dev.rotate.desc'),
        confirmText: t('modal.rotate.confirm'),
        danger: true
      });
      if (!ok) return;
      const app = (S.apps || []).find((item) => item.app_id === btn.dataset.app);
      const data = await api(`/api/apps/${encodeURIComponent(btn.dataset.app)}/secret`, { method: 'POST', body: {} });
      showSecret(btn.dataset.app, data.app_secret, app ? app.name : '');
      render();
    },
    async 'delete-app'(btn) {
      const ok = await confirmDialog({
        title: t('modal.deleteApp.title'),
        message: t('dev.delete.desc'),
        confirmText: t('modal.deleteApp.confirm'),
        danger: true
      });
      if (!ok) return;
      await api(`/api/apps/${encodeURIComponent(btn.dataset.app)}`, { method: 'DELETE' });
      toast(t('toast.appDeleted'));
      render();
    },
    snippet(btn) {
      const snippet = window.YL_SNIPPETS[btn.dataset.lang];
      const box = $('#snippet-box');
      if (box && snippet) box.textContent = snippet.code;
      $$('[data-act="snippet"]').forEach((el) => {
        el.classList.toggle('active', el === btn);
      });
    },
    'developer-gate'() {
      closeDropdowns();
      openDeveloperGate();
    },
    'agree-toggle'(input) {
      const key = input.dataset.key;
      const index = S.gateAccepted.indexOf(key);
      if (index >= 0) S.gateAccepted.splice(index, 1);
      else S.gateAccepted.push(key);
      syncAgreement();
    },
    async 'developer-unlock'() {
      if (S.gateAccepted.length < 5) return;
      const data = await api('/api/developer/unlock', {
        method: 'POST',
        body: { accepted: S.gateAccepted }
      });
      S.developer = !!data.developer;
      closeModal();
      toast(t('toast.developerOn'));
      render();
    },
    async 'developer-lock'() {
      const ok = await confirmDialog({
        title: t('dev.gate.lock'),
        message: t('dev.gate.lockDesc'),
        confirmText: t('dev.gate.lock'),
        danger: true
      });
      if (!ok) return;
      await api('/api/developer/lock', { method: 'POST', body: {} });
      S.developer = false;
      toast(t('toast.developerOff'));
      location.hash = '#/dashboard';
      render();
    },
    'consent-details'(btn) {
      const body = $('#consent-details');
      const open = !body.classList.contains('hidden');
      body.classList.toggle('hidden', open);
      btn.classList.toggle('open', !open);
      btn.setAttribute('aria-expanded', open ? 'false' : 'true');
      const label = btn.querySelector('[data-details-label]');
      if (label) label.textContent = t(open ? 'consent.detailsShow' : 'consent.detailsHide');
    },
    'consent-switch'() {
      const next = location.hash.replace(/^#/, '');
      location.href = `/#/login?next=${encodeURIComponent(`/${next}`)}`;
    },
    async 'consent-allow'() {
      const remember = $('#consent-remember') ? $('#consent-remember').checked : true;
      const data = await api('/api/sso/approve', { method: 'POST', body: { ...S.consent, remember } });
      if (data.redirect) location.replace(data.redirect);
    },
    async 'consent-deny'() {
      const data = await api('/api/sso/deny', { method: 'POST', body: { ...S.consent } }).catch(() => null);
      if (data && data.redirect) location.replace(data.redirect);
      else if (window.opener) window.close();
      else location.hash = '#/dashboard';
    }
  };

  function closeDropdowns() {
    $$('.dd.open').forEach((el) => {
      el.classList.remove('open');
      const trigger = el.querySelector('.dd-trigger');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  /* ------------------------------ nav */
  document.addEventListener('click', async (event) => {
    const nav = event.target.closest('.nav-item[data-route]');
    if (nav) { location.hash = `#${nav.dataset.route}`; return; }

    if (!event.target.closest('.dd')) closeDropdowns();

    const overlay = event.target.closest('[data-overlay]');
    if (overlay && event.target === overlay) {
      if (S.modalResolve) S.modalResolve(null);
      return;
    }
    const target = event.target.closest('[data-act]');
    if (!target) return;

    if (target.dataset.act === 'agree-toggle') {
      target.checked = !target.checked;
      ACTIONS['agree-toggle'](target);
      return;
    }

    const handler = ACTIONS[target.dataset.act];
    if (!handler) return;
    event.preventDefault();
    if (!['peek', 'dd-toggle', 'agree-toggle', 'consent-details'].includes(target.dataset.act)) {
      target.classList.add('is-busy');
    }
    try {
      await handler(target);
    } catch (err) {
      toast((err && err.message) || t('toast.operationFailed'), 'bad');
    } finally {
      target.classList.remove('is-busy');
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target.closest('form[data-form]');
    if (!form) return;
    event.preventDefault();
    const handler = FORMS[form.dataset.form];
    if (!handler) return;
    const submit = form.querySelector('button[type="submit"]');
    const original = submit ? submit.innerHTML : '';
    if (submit) { submit.disabled = true; submit.innerHTML = t('common.loading'); }
    try {
      await handler(form, new FormData(form));
    } catch (err) {
      toast((err && err.message) || t('toast.submitFailed'), 'bad');
    } finally {
      if (submit) { submit.disabled = false; submit.innerHTML = original; }
    }
  });

  document.addEventListener('input', (event) => {
    const input = event.target.closest('[data-strength]');
    if (!input) return;
    const form = input.closest('form');
    const box = form && form.querySelector('[data-strength-box]');
    if (!box) return;
    box.classList.remove('hidden');
    const score = strengthScore(input.value);
    $$('i', box).forEach((bar, index) => { bar.className = index < score ? `on-${score}` : ''; });
    const label = box.querySelector('[data-strength-label]');
    if (label) label.textContent = input.value ? t('strength.' + score) : '—';
  });

  document.addEventListener('change', async (event) => {
    const toggle = event.target.closest('[data-toggle-autostart]');
    if (!toggle) return;
    try {
      const data = await api('/api/system/autostart', { method: 'POST', body: { enabled: toggle.checked } });
      toast(data.enabled ? t('toast.autostartOn') : t('toast.autostartOff'));
    } catch (err) {
      toggle.checked = !toggle.checked;
      toast((err && err.message) || t('toast.settingFailed'), 'bad');
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if ($('#modal-root').innerHTML) {
        if (S.modalResolve) S.modalResolve(null);
        return;
      }
      closeDropdowns();
      return;
    }
    if (event.key === 'Enter' && $('#modal-pw') && document.activeElement === $('#modal-pw')) {
      event.preventDefault();
      ACTIONS['modal-password-ok']();
    }
  });

  window.I18N.onChange(() => {
    if (S.route) {
      render().catch(() => { /* ignore */ });
    }
  });

  /* ------------------------------ boot */
  async function boot() {
    applyThemeMode(themeMode());
    setInterval(() => {
      if (themeMode() === 'auto') {
        const next = resolveTheme('auto');
        if (document.documentElement.getAttribute('data-theme') !== next) {
          document.documentElement.setAttribute('data-theme', next);
        }
      }
    }, 60000);

    try {
      S.cfg = await api('/api/public/config');
    } catch (err) {
      S.cfg = { has_users: true, version: '1.2.0', base_url: location.origin };
    }
    try {
      const info = await api('/api/auth/session');
      S.user = info.user;
      S.session = info.session || null;
      S.recoveryCodesLeft = info.recovery_codes_left || 0;
      S.developer = !!info.developer;
    } catch (err) {
      S.user = null;
    }
    window.addEventListener('hashchange', () => {
      closeDropdowns();
      render().catch((err) => {
        $('#app').innerHTML = `<div class="page"><div class="alert bad">${icon('alert')}<div>${esc(t('toast.loadFailed'))}: ${esc(err.message || err)}</div></div></div>`;
      });
    });
    try {
      await render();
    } catch (err) {
      $('#app').innerHTML = `<div class="page"><div class="alert bad">${icon('alert')}<div>${esc(t('toast.loadFailed'))}: ${esc(err.message || err)}</div></div></div>`;
    }
    setInterval(() => {
      api('/api/auth/session').then((data) => {
        if (!data.user && S.user) { S.user = null; location.hash = '#/login'; }
      }).catch(() => { /* ignore */ });
    }, 120000);
  }

  boot();
})();
