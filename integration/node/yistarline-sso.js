'use strict';
/**
 * YiStarLine Account · Node.js 客户端（Node 18+，零依赖）
 *
 * 用法：
 *   const { YiStarLineSSO } = require('./yistarline-sso');
 *   const sso = new YiStarLineSSO({ appId: 'ylc_xxx', appSecret: 'ylsec_xxx' });
 *   const url = sso.authorizeUrl('http://127.0.0.1:5173/sso/callback', 'nonce');
 *   const { user, access_token } = await sso.redeem(ticket);
 */

const DEFAULT_PORTS = Array.from({ length: 30 }, (_, index) => 8600 + index);
const DEFAULT_BASE = 'http://127.0.0.1:8600';

class SSOError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.name = 'SSOError';
    this.code = code;
    this.status = status;
  }
}

async function httpJson(base, method, path, payload, headers = {}, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(base + path, {
      method,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'yistarline-sso-node/1.0',
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      data = {};
    }
    if (!response.ok) {
      const error = data.error || {};
      throw new SSOError(error.code || 'http_error', error.message || `HTTP ${response.status}`, response.status);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/** 在 8600-8629 上自动发现本机服务。 */
async function discover(timeout = 700) {
  const probes = DEFAULT_PORTS.map(async (port) => {
    const base = `http://127.0.0.1:${port}`;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      const response = await fetch(`${base}/api/v1/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (!response.ok) return null;
      const data = await response.json();
      return data.app === 'YiStarLine Account' ? base : null;
    } catch (err) {
      return null;
    }
  });
  const results = await Promise.all(probes);
  return results.find(Boolean) || DEFAULT_BASE;
}

class YiStarLineSSO {
  constructor({ appId, appSecret = '', baseUrl = '', timeout = 8000 } = {}) {
    this.appId = appId;
    this.appSecret = appSecret;
    this.baseUrl = (baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    this.timeout = timeout;
  }

  async init() {
    if (!this.baseUrl) this.baseUrl = await discover();
    return this;
  }

  async request(method, path, payload, headers) {
    return httpJson(this.baseUrl, method, path, payload, headers, this.timeout);
  }

  /** 授权页地址，浏览器跳转到这里开始登录。 */
  authorizeUrl(redirectUri, state = '', prompt = '') {
    const query = new URLSearchParams({ app_id: this.appId, redirect_uri: redirectUri, state });
    if (prompt) query.set('prompt', prompt);
    return `${this.baseUrl}/sso/authorize?${query.toString()}`;
  }

  /** 静默登录：已授权时直接回调 ticket，否则带 error 回调。 */
  silentUrl(redirectUri, state = '') {
    return this.authorizeUrl(redirectUri, state, 'none');
  }

  /** 用一次性票据换取用户资料与访问令牌。 */
  async redeem(ticket) {
    return this.request('POST', '/api/v1/ticket/redeem', {
      app_id: this.appId,
      app_secret: this.appSecret,
      ticket,
    });
  }

  async userinfo(accessToken) {
    return this.request('GET', '/api/v1/userinfo', undefined, {
      Authorization: `Bearer ${accessToken}`,
    });
  }

  /** 产品自带登录框时使用。 */
  async login(username, password) {
    return this.request('POST', '/api/v1/auth/login', {
      app_id: this.appId,
      app_secret: this.appSecret,
      username,
      password,
    });
  }

  async logout(accessToken) {
    const result = await this.request('POST', '/api/v1/logout', {}, {
      Authorization: `Bearer ${accessToken}`,
    });
    return Boolean(result.ok);
  }

  /** 校验 app_id / app_secret 是否匹配。 */
  async verify() {
    return this.request('POST', '/api/v1/app/verify', {
      app_id: this.appId,
      app_secret: this.appSecret,
    });
  }

  async health() {
    return this.request('GET', '/api/v1/health');
  }

  /** 等待本机服务就绪（产品启动时使用）。 */
  async waitForService(timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const data = await this.health();
        if (data.ok) return this.baseUrl;
      } catch (err) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    throw new SSOError('service_unavailable', 'YiStarLine Account service is not ready');
  }

  /** 从回调地址中解析 ticket 与 state。 */
  static ticketFromUrl(url) {
    const parsed = new URL(url, 'http://127.0.0.1');
    return {
      ticket: parsed.searchParams.get('ticket') || '',
      state: parsed.searchParams.get('state') || '',
      error: parsed.searchParams.get('error') || '',
    };
  }
}

module.exports = { YiStarLineSSO, SSOError, discover, DEFAULT_BASE };
