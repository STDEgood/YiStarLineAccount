/**
 * 生成 Android 自适应图标的前景层：透明背景 + 白色 YAUA（108dp 画布，72dp 安全区）。
 * 用法: node android/tools/make-foreground.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => existsSync(p));

const SIZE = 432; // 108dp @ 4x
const outFile = 'android/app/src/main/res/drawable/ic_launcher_foreground.png';
const profile = mkdtempSync(path.join(tmpdir(), 'yaua-fg-'));
const port = 9611 + Math.floor(Math.random() * 100);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${SIZE}px;height:${SIZE}px;background:transparent;overflow:hidden}
  .wrap{width:${SIZE}px;height:${SIZE}px;display:grid;place-items:center}
  span{font-family:"Segoe UI Variable Display","Segoe UI",sans-serif;font-weight:800;
    font-size:${Math.round(SIZE * 0.205)}px;line-height:1;color:#ffffff;letter-spacing:${Math.round(SIZE * 0.004)}px}
</style></head><body><div class="wrap"><span>YAUA</span></div></body></html>`;

const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank',
], { stdio: 'ignore' });

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
  send(method, params = {}) {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

try {
  let target = null;
  for (let i = 0; i < 120 && !target; i += 1) {
    try {
      const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
      target = list.find((item) => item.type === 'page') || null;
    } catch (err) { /* retry */ }
    if (!target) await sleep(150);
  }
  if (!target) throw new Error('DevTools not ready');
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: SIZE, height: SIZE, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await cdp.send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
  await sleep(500);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
  console.log('written', outFile);
  cdp.ws.close();
} finally {
  edge.kill();
  await sleep(200);
  try { rmSync(profile, { recursive: true, force: true }); } catch (err) { /* ignore */ }
  setTimeout(() => process.exit(0), 100);
}
