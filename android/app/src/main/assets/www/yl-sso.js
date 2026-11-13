/*!
 * YiStarLine Account · 浏览器端 SSO SDK
 * 纯原生 JS，无依赖，可离线使用。
 *
 * 用法：
 *   1) 产品页面引入本文件；
 *   2) 点击按钮时调用 YLAccount.login({ appId, redirectUri })；
 *   3) 回调页调用 YLAccount.handleCallback()；
 *   4) 把拿到的 ticket 交给产品后端，由后端调用 /api/v1/ticket/redeem 兑换用户信息。
 */
(function (global) {
  'use strict';

  var DEFAULT_PORTS = [];
  for (var i = 0; i < 30; i += 1) DEFAULT_PORTS.push(8600 + i);
  var STORAGE_KEY = 'yistarline:sso-base';
  var state = { baseUrl: '', resolved: false };

  function trimBase(url) {
    return String(url || '').replace(/\/+$/, '');
  }

  function randomState() {
    var bytes = new Uint8Array(16);
    if (global.crypto && global.crypto.getRandomValues) {
      global.crypto.getRandomValues(bytes);
    } else {
      for (var j = 0; j < bytes.length; j += 1) bytes[j] = Math.floor(Math.random() * 256);
    }
    return Array.prototype.map.call(bytes, function (b) {
      return ('0' + b.toString(16)).slice(-2);
    }).join('');
  }

  function healthCheck(base) {
    var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 700) : null;
    return fetch(base + '/api/v1/health', {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined,
    })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (data) {
        if (timer) clearTimeout(timer);
        return data && data.app === 'YiStarLine Account' ? base : null;
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        return null;
      });
  }

  /**
   * 自动发现本机上正在运行的 YiStarLine Account 服务端口。
   * 端口固定为 8600 起，服务会自动顺延寻找可用端口。
   */
  function discover() {
    if (state.resolved && state.baseUrl) return Promise.resolve(state.baseUrl);
    try {
      var saved = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        state.baseUrl = trimBase(saved);
        state.resolved = true;
        return Promise.resolve(state.baseUrl);
      }
    } catch (err) { /* 隐私模式忽略 */ }
    var probes = DEFAULT_PORTS.map(function (port) {
      return healthCheck('http://127.0.0.1:' + port);
    });
    return Promise.all(probes).then(function (results) {
      var found = null;
      for (var k = 0; k < results.length; k += 1) {
        if (results[k]) { found = results[k]; break; }
      }
      state.baseUrl = found || 'http://127.0.0.1:8600';
      state.resolved = true;
      try {
        if (found && global.localStorage) global.localStorage.setItem(STORAGE_KEY, found);
      } catch (err) { /* ignore */ }
      return state.baseUrl;
    });
  }

  function configure(options) {
    options = options || {};
    if (options.baseUrl) {
      state.baseUrl = trimBase(options.baseUrl);
      state.resolved = true;
      try {
        if (global.localStorage) global.localStorage.setItem(STORAGE_KEY, state.baseUrl);
      } catch (err) { /* ignore */ }
    }
    return api;
  }

  /**
   * 打开授权窗口完成登录。
   * @param {Object} options
   * @param {string} options.appId       应用 ID（ylc_ 开头）
   * @param {string} options.redirectUri 回调地址，必须在应用白名单内
   * @param {string} [options.state]     自定义 state，默认随机
   * @param {string} [options.prompt]    'none' 表示静默登录（不弹确认页）
   * @param {number} [options.width]
   * @param {number} [options.height]
   * @param {number} [options.timeout]   毫秒
   * @returns {Promise<{ticket:string, state:string}>}
   */
  function login(options) {
    options = options || {};
    if (!options.appId) return Promise.reject(new Error('缺少 appId'));
    if (!options.redirectUri) return Promise.reject(new Error('缺少 redirectUri'));

    return (options.baseUrl ? Promise.resolve(trimBase(options.baseUrl)) : discover()).then(function (base) {
      return new Promise(function (resolve, reject) {
        var nonce = options.state || randomState();
        var query = new URLSearchParams({
          app_id: options.appId,
          redirect_uri: options.redirectUri,
          state: nonce,
          popup: '1',
        });
        if (options.prompt) query.set('prompt', options.prompt);
        var width = options.width || 460;
        var height = options.height || 660;
        var left = Math.max(0, (global.screenX || 0) + ((global.outerWidth || width) - width) / 2);
        var top = Math.max(0, (global.screenY || 0) + ((global.outerHeight || height) - height) / 2.4);
        var features = 'width=' + width + ',height=' + height + ',left=' + Math.round(left) +
          ',top=' + Math.round(top) + ',resizable=yes,scrollbars=yes';
        var popup = global.open(base + '/sso/authorize?' + query.toString(), 'yistarline-sso', features);
        if (!popup) {
          reject(new Error('登录窗口被浏览器拦截，请允许弹出窗口后重试'));
          return;
        }
        var settled = false;
        var timer = setTimeout(function () {
          finish(new Error('登录超时，请重试'));
        }, options.timeout || 300000);
        var poll = setInterval(function () {
          if (popup.closed && !settled) finish(new Error('登录窗口已关闭'));
        }, 900);

        function finish(error, result) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          clearInterval(poll);
          global.removeEventListener('message', onMessage);
          try { if (!popup.closed) popup.close(); } catch (err) { /* ignore */ }
          if (error) reject(error);
          else resolve(result);
        }

        function onMessage(event) {
          // 回调页与产品同源，只接受同源消息
          if (event.origin !== global.location.origin) return;
          var data = event.data || {};
          if (!data || data.type !== 'yistarline:sso') return;
          if (data.state && nonce && data.state !== nonce) return;
          if (data.error) {
            finish(new Error(data.error === 'access_denied' ? '用户取消了授权' : '登录失败：' + data.error));
            return;
          }
          if (!data.ticket) {
            // 产品若在回调页完成了服务端兑换（示例产品就是这种模式），
            // 会回传 ok:true 但不带票据，此时视为成功，登录状态由 Cookie 承载。
            if (data.ok) {
              finish(null, { ticket: '', state: data.state || nonce, cookie: true });
              return;
            }
            finish(new Error('回调未携带票据'));
            return;
          }
          finish(null, { ticket: data.ticket, state: data.state || nonce });
        }

        global.addEventListener('message', onMessage);
      });
    });
  }

  /**
   * 在回调页调用：把 ticket / state 传给打开它的产品窗口，然后自动关闭。
   * 若不在弹窗中（直接跳转回来），则只返回解析结果，由页面脚本自行处理。
   */
  function handleCallback() {
    var params = new URLSearchParams(global.location.search);
    var payload = {
      type: 'yistarline:sso',
      ticket: params.get('ticket') || '',
      state: params.get('state') || '',
      error: params.get('error') || '',
    };
    var inPopup = !!global.opener;
    if (inPopup) {
      try {
        global.opener.postMessage(payload, global.location.origin);
      } catch (err) { /* ignore */ }
      setTimeout(function () { try { global.close(); } catch (err) { /* ignore */ } }, 160);
    }
    return payload;
  }

  /**
   * 使用访问令牌读取用户信息（可选，通常由产品后端完成）。
   */
  function userinfo(accessToken, options) {
    options = options || {};
    return (options.baseUrl ? Promise.resolve(trimBase(options.baseUrl)) : discover()).then(function (base) {
      return fetch(base + '/api/v1/userinfo', {
        headers: { Authorization: 'Bearer ' + accessToken },
        cache: 'no-store',
      }).then(function (res) {
        if (!res.ok) throw new Error('令牌无效或已过期');
        return res.json();
      });
    });
  }

  /** 使用账户密码登录（产品自带登录框时使用，需要应用密钥，通常放在后端） */
  function passwordLogin(options) {
    options = options || {};
    return (options.baseUrl ? Promise.resolve(trimBase(options.baseUrl)) : discover()).then(function (base) {
      return fetch(base + '/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: options.appId,
          app_secret: options.appSecret,
          username: options.username,
          password: options.password,
        }),
      }).then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error((data.error && data.error.message) || '登录失败');
          return data;
        });
      });
    });
  }

  function health(options) {
    options = options || {};
    return (options.baseUrl ? Promise.resolve(trimBase(options.baseUrl)) : discover()).then(function (base) {
      return fetch(base + '/api/v1/health', { cache: 'no-store' }).then(function (res) { return res.json(); });
    });
  }

  var api = {
    configure: configure,
    discover: discover,
    login: login,
    silentLogin: function (options) {
      return login(Object.assign({}, options, { prompt: 'none' }));
    },
    handleCallback: handleCallback,
    userinfo: userinfo,
    passwordLogin: passwordLogin,
    health: health,
    get baseUrl() { return state.baseUrl; },
  };

  global.YLAccount = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
