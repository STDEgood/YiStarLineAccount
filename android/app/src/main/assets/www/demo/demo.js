/* 示例产品 · 快速登录演示 */
(function () {
  'use strict';
  var $ = function (sel) { return document.querySelector(sel); };
  var state = { appId: '', me: null };

  try {
    var theme = localStorage.getItem('yl-theme');
    if (theme) document.documentElement.setAttribute('data-theme', theme);
  } catch (err) { /* ignore */ }

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function initials(name) {
    var text = String(name || '?').trim();
    var cn = text.match(/[\u4e00-\u9fa5]/g);
    if (cn && cn.length) return cn[0];
    var parts = text.split(/[\s_\-.@]+/).filter(Boolean);
    if (parts.length > 1) return (parts[0][0] + parts[1][0]).toUpperCase();
    return text.slice(0, 2).toUpperCase();
  }
  function hueOf(name) {
    var h = 0;
    String(name || '').split('').forEach(function (ch) { h = (h * 31 + ch.charCodeAt(0)) % 360; });
    return h;
  }
  function fmt(ts) {
    if (!ts) return '—';
    var d = new Date(Number(ts) * 1000);
    return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }
  function showError(message) {
    var box = $('#demo-error');
    if (!box) return;
    box.textContent = message || '登录失败';
    box.classList.remove('hidden');
  }
  function clearError() {
    var box = $('#demo-error');
    if (box) { box.textContent = ''; box.classList.add('hidden'); }
  }

  function request(path, options) {
    options = options || {};
    return fetch(path, {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : {},
      body: options.body ? JSON.stringify(options.body) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var message = (data.error && data.error.message) || '请求失败';
          throw new Error(message);
        }
        return data;
      });
    });
  }

  function showView(id) {
    ['loading-card', 'login-card', 'profile-card'].forEach(function (key) {
      var el = document.getElementById(key);
      if (el) el.classList.toggle('hidden', key !== id);
    });
  }

  function renderProfile(me) {
    showView('profile-card');
    var user = me.user || {};
    var name = user.display_name || user.username || '用户';
    var avatar = $('#profile-avatar');
    avatar.textContent = initials(name);
    avatar.style.background = 'hsl(' + hueOf(name) + ' 42% 38%)';
    $('#profile-name').textContent = name;
    $('#profile-meta').textContent = '@' + (user.username || '') + ' · 账户创建于 ' + fmt(user.created_at);
    $('#profile-username').textContent = user.username || '—';
    $('#profile-email').textContent = user.email || '未设置';
    $('#profile-exp').textContent = fmt(me.expires_at);
  }

  function refresh() {
    return request('/demo/api/me')
      .then(function (data) {
        state.me = data;
        renderProfile(data);
        return data;
      })
      .catch(function () {
        state.me = null;
        showView('login-card');
        return null;
      });
  }

  function bindQuickLogin() {
    var button = $('#quick-login');
    if (!button) return;
    button.addEventListener('click', function () {
      clearError();
      var original = button.innerHTML;
      button.disabled = true;
      button.innerHTML = '正在打开授权窗口…';
      YLAccount.login({
        appId: state.appId,
        redirectUri: window.location.origin + '/demo/callback',
      })
        .then(function () {
          return refresh();
        })
        .catch(function (err) {
          showError(err && err.message ? err.message : '登录失败');
        })
        .then(function () {
          button.disabled = false;
          button.innerHTML = original;
        });
    });
  }

  function bindPasswordLogin() {
    var form = $('#password-form');
    if (!form) return;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      clearError();
      var data = new FormData(form);
      var button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      request('/demo/api/login', {
        method: 'POST',
        body: { username: String(data.get('username') || '').trim(), password: String(data.get('password') || '') },
      })
        .then(function () {
          form.reset();
          return refresh();
        })
        .catch(function (err) {
          showError(err.message);
        })
        .then(function () {
          button.disabled = false;
        });
    });
  }

  function bindProfileActions() {
    var logout = $('#logout');
    if (logout) {
      logout.addEventListener('click', function () {
        request('/demo/api/logout', { method: 'POST', body: {} })
          .then(function () { return refresh(); })
          .catch(function () { return refresh(); });
      });
    }
    var refreshBtn = $('#refresh-profile');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        refreshBtn.disabled = true;
        refresh().then(function () { refreshBtn.disabled = false; });
      });
    }
  }

  function bindHealth() {
    var badge = $('#sso-badge');
    if (!badge) return;
    YLAccount.health()
      .then(function (data) {
        badge.className = 'badge ok';
        badge.innerHTML = '<span class="dot"></span>服务正常 · v' + (data.version || '1.0.0');
      })
      .catch(function () {
        badge.className = 'badge bad';
        badge.innerHTML = '<span class="dot"></span>未连接到本机服务';
      });
  }

  function boot() {
    bindQuickLogin();
    bindPasswordLogin();
    bindProfileActions();
    bindHealth();
    request('/api/public/config')
      .then(function (config) {
        state.appId = config.demo_app_id || '';
        var el = $('#demo-app-id');
        if (el) el.textContent = state.appId || '未初始化';
        if (!state.appId) showError('示例应用尚未初始化，请重启 YiStarLine Account 服务');
      })
      .catch(function () { /* ignore */ })
      .then(function () { return refresh(); });
  }

  boot();
})();
