/* 首屏主题：避免白/黑闪烁；支持 浅色 / 深色 / 跟随时间 */
(function () {
  'use strict';
  var mode = 'light';
  try {
    mode = localStorage.getItem('yl-theme-mode') || 'light';
  } catch (err) { mode = 'light'; }
  var dark = mode === 'dark';
  if (mode === 'auto') {
    var hour = new Date().getHours();
    dark = hour < 7 || hour >= 19;
  }
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
