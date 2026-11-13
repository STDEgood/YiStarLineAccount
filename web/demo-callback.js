/* 由 /demo/callback 渲染的页面加载：把授权结果交还给打开它的示例产品窗口 */
(function () {
  'use strict';
  var script = document.currentScript;
  var ok = script && script.getAttribute('data-ok') === '1';
  var state = (script && script.getAttribute('data-state')) || '';
  var payload = { type: 'yistarline:sso', ok: ok, state: state, ticket: '', error: '' };
  try {
    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(payload, window.location.origin);
    }
  } catch (err) {
    /* 跨源或已关闭，忽略 */
  }
  setTimeout(function () {
    try { window.close(); } catch (err) { /* 非弹窗时忽略 */ }
  }, 420);
})();
