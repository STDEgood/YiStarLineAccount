/**
 * 通过 adb forward 连接到 Android WebView 的 DevTools，执行一段 JS 并打印结果。
 * 用法: node tests/android-eval.mjs <port> "<expression>"
 */
const port = process.argv[2] || '9333';
const expression = process.argv[3] || 'document.title';

const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
const page = list.find((item) => item.type === 'page');
if (!page) {
  console.error('no page target');
  process.exit(1);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const result = await send('Runtime.evaluate', {
  expression,
  returnByValue: true,
  awaitPromise: true,
});
console.log(result.result && result.result.value !== undefined ? result.result.value : JSON.stringify(result));
ws.close();
process.exit(0);
