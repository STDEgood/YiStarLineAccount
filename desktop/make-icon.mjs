/**
 * 生成桌面客户端图标：用 Edge 渲染品牌图形，再打包成多尺寸 ICO。
 * 用法: node desktop/make-icon.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const SIZES = [256, 128, 64, 48, 32, 16];
const outFile = 'desktop/app.ico';
const port = 9511 + Math.floor(Math.random() * 100);
const profile = mkdtempSync(path.join(tmpdir(), 'yl-icon-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const edge = EDGE_CANDIDATES.find((c) => existsSync(c));
if (!edge) {
  console.error('找不到 Edge');
  process.exit(1);
}

function html(size) {
  const radius = Math.round(size * 0.228);
  const font = Math.round(size * 0.255);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;width:${size}px;height:${size}px;background:transparent;overflow:hidden}
    .mark{width:${size}px;height:${size}px;border-radius:${radius}px;
      background:linear-gradient(145deg,#3b82f6 0%,#2563eb 48%,#1e40af 100%);
      box-shadow:inset 0 ${Math.max(1, Math.round(size * 0.012))}px 0 rgba(255,255,255,.32);
      display:grid;place-items:center}
    span{font-family:"Segoe UI Variable Display","Segoe UI",sans-serif;font-weight:800;
      font-size:${font}px;line-height:1;color:#fff;letter-spacing:${Math.max(0.5, size * 0.004)}px;
      text-shadow:0 ${Math.max(1, Math.round(size * 0.006))}px ${Math.round(size * 0.018)}px rgba(10,20,60,.35)}
  </style></head><body><div class="mark"><span>YAUA</span></div></body></html>`;
}

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

async function devtoolsReady() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch (err) { /* retry */ }
    await sleep(150);
  }
  throw new Error('DevTools 未就绪');
}

const browser = spawn(edge, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars',
  '--force-device-scale-factor=1', 'about:blank',
], { stdio: 'ignore' });

const pngs = [];
try {
  await devtoolsReady();
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })
    .then((r) => r.json());
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

  for (const size of SIZES) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: size, height: size, deviceScaleFactor: 1, mobile: false,
    });
    const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html(size));
    await cdp.send('Page.navigate', { url });
    await sleep(360);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    pngs.push({ size, data: Buffer.from(shot.data, 'base64') });
    console.log(`rendered ${size}x${size}`);
  }
  cdp.ws.close();
} catch (err) {
  console.error('图标渲染失败:', err.message);
  process.exitCode = 1;
} finally {
  browser.kill();
  await sleep(300);
  try { rmSync(profile, { recursive: true, force: true }); } catch (err) { /* ignore */ }
}

if (!pngs.length) process.exit(1);

// 打包为 ICO（PNG 压缩条目，Vista+ 支持）
const count = pngs.length;
const header = Buffer.alloc(6 + 16 * count);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(count, 4);
let offset = header.length;
pngs.forEach((png, index) => {
  const entry = 6 + index * 16;
  header.writeUInt8(png.size >= 256 ? 0 : png.size, entry);
  header.writeUInt8(png.size >= 256 ? 0 : png.size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.data.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.data.length;
});
mkdirSync(path.dirname(outFile), { recursive: true });
writeFileSync(outFile, Buffer.concat([header, ...pngs.map((p) => p.data)]));
console.log(`写入 ${outFile}（${count} 个尺寸，${offset} 字节）`);
