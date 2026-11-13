/**
 * 界面截图（Edge headless + CDP）：浅色/深色、三语、授权页、开发者门槛、已登录软件。
 * 用法: node tests/shots.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const seed = JSON.parse(readFileSync('tests/.seed.json', 'utf8'));
const base = seed.base;
const outDir = 'docs/screenshots';
const profile = mkdtempSync(path.join(tmpdir(), 'yl-shots-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });

const edge = spawn(EDGE, [
  '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--disable-extensions', '--mute-audio', '--window-size=1440,960', 'about:blank',
], { stdio: 'ignore' });

let devtoolsPort = 0;

class CDP {
  constructor(url) { this.ws = new WebSocket(url); this.seq = 0; this.pending = new Map(); }
  async ready() {
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      }
    };
  }
  send(method, params = {}, timeout = 20000) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function devtools() {
  for (let i = 0; i < 160; i += 1) {
    try {
      const file = path.join(profile, 'DevToolsActivePort');
      if (existsSync(file)) {
        const content = readFileSync(file, 'utf8').split('\n');
        const port = Number(content[0]);
        if (port > 0) {
          const res = await fetch(`http://127.0.0.1:${port}/json/version`);
          if (res.ok) {
            devtoolsPort = port;
            return;
          }
        }
      }
    } catch (err) { /* retry */ }
    await sleep(150);
  }
  throw new Error('DevTools not ready');
}

let cdp;
const evaluate = async (expression) => {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result.result ? result.result.value : null;
};
async function setPrefs(lang, theme) {
  await cdp.send('Page.navigate', { url: `${base}/` });
  await sleep(450);
  const state = await evaluate(`JSON.stringify({
    lang: localStorage.getItem('yl-lang'),
    theme: localStorage.getItem('yl-theme-mode'),
  })`);
  const current = JSON.parse(state || '{}');
  let reload = false;
  if (lang && current.lang !== lang) {
    await evaluate(`localStorage.setItem('yl-lang', ${JSON.stringify(lang)})`);
    reload = true;
  }
  if (theme && current.theme !== theme) {
    await evaluate(`localStorage.setItem('yl-theme-mode', ${JSON.stringify(theme)})`);
    reload = true;
  }
  if (reload) {
    await cdp.send('Page.reload', { ignoreCache: true });
    await sleep(750);
  }
}
async function shot(name, width, height) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: width < 600,
  });
  await sleep(160);
  const data = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(data.data, 'base64'));
  console.log('  ->', `${name}.png`);
}

const music = seed.apps['音乐播放器'];
const consentUrl = `${base}/#/authorize?app_id=${encodeURIComponent(music.app_id)}&redirect_uri=${encodeURIComponent(music.redirect)}&state=demo`;

const plan = [
  { name: '01-login-choose-zh', url: `${base}/#/login`, w: 1440, h: 900, lang: 'zh-CN', theme: 'light', device: true },
  { name: '02-login-choose-dark', url: `${base}/#/login`, w: 1440, h: 900, lang: 'zh-CN', theme: 'dark', device: true },
  { name: '03-login-choose-en', url: `${base}/#/login`, w: 1440, h: 900, lang: 'en', theme: 'light', device: true },
  {
    name: '04-login-password-step', url: `${base}/#/login`, w: 1440, h: 900, lang: 'zh-CN', theme: 'light', device: true,
    prep: "document.querySelector('[data-username=\"studio\"]').click()",
  },
  {
    name: '05-login-manual', url: `${base}/#/login`, w: 1440, h: 900, lang: 'zh-CN', theme: 'light', device: true,
    prep: "document.querySelector('[data-act=\"login-manual\"]').click()",
  },
  { name: '06-register-light', url: `${base}/#/register`, w: 1440, h: 960, lang: 'zh-CN', theme: 'light' },
  { name: '07-recover-light', url: `${base}/#/recover`, w: 1440, h: 900, lang: 'zh-CN', theme: 'light' },
  {
    name: '08-consent-light', url: consentUrl, w: 1040, h: 860, auth: true, lang: 'zh-CN', theme: 'light',
  },
  {
    name: '09-consent-details', url: consentUrl, w: 1040, h: 980, auth: true, lang: 'zh-CN', theme: 'light',
    prep: "document.querySelector('[data-act=\"consent-details\"]').click()",
  },
  { name: '10-dashboard-light', url: `${base}/#/dashboard`, w: 1440, h: 1000, auth: true, lang: 'zh-CN', theme: 'light' },
  { name: '11-dashboard-dark', url: `${base}/#/dashboard`, w: 1440, h: 1000, auth: true, lang: 'zh-CN', theme: 'dark' },
  {
    name: '12-dashboard-menu', url: `${base}/#/dashboard`, w: 1440, h: 1000, auth: true, lang: 'zh-CN', theme: 'light',
    prep: "document.querySelector('.top-actions .dd:last-child .dd-trigger').click()",
  },
  { name: '13-apps-light', url: `${base}/#/apps`, w: 1440, h: 900, auth: true, lang: 'zh-CN', theme: 'light' },
  { name: '14-developer-apps', url: `${base}/#/developer`, w: 1440, h: 1100, auth: true, lang: 'zh-CN', theme: 'light' },
  {
    name: '15-protect-quiz', url: `${base}/#/developer`, w: 1440, h: 1100, auth: true, lang: 'zh-CN', theme: 'light',
    prep: "document.querySelector('[data-act=\"protect\"]').click()",
  },
  { name: '15-security-light', url: `${base}/#/security`, w: 1440, h: 1000, auth: true, lang: 'zh-CN', theme: 'light' },
  { name: '16-devices-light', url: `${base}/#/devices`, w: 1440, h: 760, auth: true, lang: 'zh-CN', theme: 'light' },
  { name: '17-activity-light', url: `${base}/#/activity`, w: 1440, h: 900, auth: true, lang: 'en', theme: 'light' },
  { name: '18-data-light', url: `${base}/#/data`, w: 1440, h: 940, auth: true, lang: 'zh-CN', theme: 'light' },
  { name: '19-about-light', url: `${base}/#/about`, w: 1440, h: 900, auth: true, lang: 'zh-CN', theme: 'light' },
  { name: '20-demo', url: `${base}/demo/`, w: 1440, h: 960, lang: 'zh-CN', theme: 'light' },
  { name: '21-login-mobile', url: `${base}/#/login`, w: 430, h: 900, lang: 'zh-CN', theme: 'light', device: true },
];

try {
  await devtools();
  const target = await fetch(`http://127.0.0.1:${devtoolsPort}/json/new?about:blank`, { method: 'PUT' })
    .then((r) => r.json());
  cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Network.enable');
  await cdp.send('Runtime.enable');

  for (const item of plan) {
    const capture = async () => {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: item.w, height: item.h, deviceScaleFactor: 1, mobile: item.w < 600,
      });
      if (item.auth) {
        await cdp.send('Network.setCookie', {
          name: 'yl_session', value: seed.cookie, domain: '127.0.0.1', path: '/', httpOnly: true,
        });
      } else {
        await cdp.send('Network.deleteCookies', { name: 'yl_session', domain: '127.0.0.1' }).catch(() => {});
      }
      if (item.device && seed.device) {
        await cdp.send('Network.setCookie', {
          name: 'yl_device', value: seed.device, domain: '127.0.0.1', path: '/', httpOnly: true,
        });
      } else {
        await cdp.send('Network.deleteCookies', { name: 'yl_device', domain: '127.0.0.1' }).catch(() => {});
      }
      await setPrefs(item.lang, item.theme);
      await cdp.send('Page.navigate', { url: item.url });
      await sleep(item.auth ? 1800 : 1200);
      if (item.prep) {
        await evaluate(item.prep);
        await sleep(450);
      }
      await shot(item.name, item.w, item.h);
    };
    try {
      await capture();
    } catch (err) {
      console.warn('  !! retry', item.name, err.message);
      await sleep(1200);
      try { await capture(); } catch (err2) { console.error('  xx skipped', item.name, err2.message); }
    }
  }
  cdp.ws.close();
} catch (err) {
  console.error('截图失败:', err.message);
  process.exitCode = 1;
} finally {
  edge.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch (err) { /* ignore */ }
  setTimeout(() => process.exit(process.exitCode || 0), 200);
}
