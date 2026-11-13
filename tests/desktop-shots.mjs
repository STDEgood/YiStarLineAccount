/**
 * 桌面客户端截图：通过 WebView2 远程调试端口驱动内嵌页面。
 * 需以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333 启动客户端。
 * 用法: node tests/desktop-shots.mjs <cookie>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const port = process.env.WV_PORT || '9333';
const cookie = process.argv[2] || '';
const base = process.env.WV_BASE || 'http://127.0.0.1:8600';
const outDir = 'docs/screenshots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(outDir, { recursive: true });

const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const page = list.find((item) => item.type === 'page');
if (!page) {
  console.error('未找到 WebView2 页面');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = () => reject(new Error('ws error'));
});
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
const send = (method, params = {}) => {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
};
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result.result ? result.result.value : null;
};
const shot = async (name) => {
  const size = await evaluate('JSON.stringify({w: innerWidth, h: innerHeight})');
  const { w, h } = JSON.parse(size);
  const capture = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: Math.min(w, 1440), height: Math.min(h, 950), scale: 1 },
  });
  const file = path.join(outDir, `${name}.png`);
  writeFileSync(file, Buffer.from(capture.data, 'base64'));
  console.log(`${name}  ${w}x${h} -> ${file}`);
};

await send('Page.enable');
await send('Runtime.enable');
if (cookie) {
  await send('Network.enable');
  await send('Network.setCookie', {
    name: 'yl_session', value: cookie, domain: '127.0.0.1', path: '/', httpOnly: true,
  });
  console.log('cookie set');
  await send('Page.reload', { ignoreCache: true });
  await sleep(2200);
}
await shot('90-desktop-register');

const pages = [
  ['91-desktop-dashboard', '#/dashboard'],
  ['92-desktop-developer', '#/developer'],
  ['93-desktop-data', '#/data'],
  ['94-desktop-activity', '#/activity'],
];
for (const [name, hash] of pages) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(1700);
  await shot(name);
}
ws.close();
