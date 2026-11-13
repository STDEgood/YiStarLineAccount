/**
 * 诊断桌面客户端内嵌 WebView2 的实际页面状态。
 * 需以 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9333 启动客户端。
 */
import { writeFileSync } from 'node:fs';

const port = process.argv[2] || '9333';
const outFile = process.argv[3] || 'docs/screenshots/97-webview2.png';

const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const pages = list.filter((item) => item.type === 'page');
if (!pages.length) {
  console.error('没有页面目标');
  process.exit(1);
}
const target = pages[0];
console.log('target:', target.url);

const ws = new WebSocket(target.webSocketDebuggerUrl);
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

const info = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    href: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyLength: document.body ? document.body.innerHTML.length : -1,
    text: document.body ? document.body.innerText.slice(0, 400) : ''
  })`,
  returnByValue: true,
});
console.log(info.result.value);

const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
console.log('screenshot ->', outFile);
ws.close();
