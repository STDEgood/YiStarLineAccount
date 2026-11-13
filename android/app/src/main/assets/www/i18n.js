/* YiStarLine Account · 多语言运行时（简体中文 / English / 日本語，可扩展） */
(function (global) {
  'use strict';

  var registry = global.YL_I18N || (global.YL_I18N = {});
  var LANGS = [
    { code: 'zh-CN', label: '简体中文', short: '中' },
    { code: 'en', label: 'English', short: 'EN' },
    { code: 'ja', label: '日本語', short: '日' }
  ];
  var STORAGE_KEY = 'yl-lang';
  var current = 'zh-CN';
  var listeners = [];

  function has(code) {
    return Object.prototype.hasOwnProperty.call(registry, code);
  }

  function detect() {
    var saved = null;
    try { saved = global.localStorage.getItem(STORAGE_KEY); } catch (err) { saved = null; }
    if (saved && has(saved)) return saved;
    var nav = global.navigator || {};
    var list = nav.languages && nav.languages.length ? nav.languages : [nav.language || 'zh-CN'];
    for (var i = 0; i < list.length; i += 1) {
      var value = String(list[i] || '').toLowerCase();
      if (!value) continue;
      if (value.indexOf('zh') === 0) return 'zh-CN';
      if (value.indexOf('ja') === 0) return 'ja';
      if (value.indexOf('en') === 0) return 'en';
      var base = value.split('-')[0];
      if (has(base)) return base;
    }
    return 'zh-CN';
  }

  function t(key, vars) {
    var dict = registry[current] || {};
    var text = dict[key];
    if (text === undefined) {
      var fallback = registry['zh-CN'] || {};
      text = fallback[key] !== undefined ? fallback[key] : key;
      if (global.console && global.console.warn) {
        global.console.warn('[i18n] missing key: ' + key + ' (' + current + ')');
      }
    }
    if (!vars) return text;
    return String(text).replace(/\{(\w+)\}/g, function (match, name) {
      return vars[name] !== undefined && vars[name] !== null ? String(vars[name]) : match;
    });
  }

  function setLang(code) {
    if (!has(code)) return false;
    current = code;
    try { global.localStorage.setItem(STORAGE_KEY, code); } catch (err) { /* ignore */ }
    document.documentElement.setAttribute('lang', code);
    for (var i = 0; i < listeners.length; i += 1) {
      try { listeners[i](code); } catch (err) { /* ignore */ }
    }
    return true;
  }

  function onChange(fn) { listeners.push(fn); }

  function pad(n) { return String(n).padStart(2, '0'); }

  function date(ts) {
    if (!ts) return t('common.never');
    var d = new Date(Number(ts) * 1000);
    if (current === 'en') {
      return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
        ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
      ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function day(ts) {
    if (!ts) return t('common.never');
    var d = new Date(Number(ts) * 1000);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function relative(ts) {
    if (!ts) return t('common.never');
    var diff = Math.floor(Date.now() / 1000) - Number(ts);
    if (diff < 60) return t('common.justNow');
    if (diff < 3600) return t('common.minutesAgo', { n: Math.max(1, Math.floor(diff / 60)) });
    if (diff < 86400) return t('common.hoursAgo', { n: Math.max(1, Math.floor(diff / 3600)) });
    if (diff < 86400 * 30) return t('common.daysAgo', { n: Math.max(1, Math.floor(diff / 86400)) });
    return day(ts);
  }

  function duration(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var days = Math.floor(total / 86400);
    var hours = Math.floor((total % 86400) / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    if (days > 0) return days + ' ' + t('common.days') + ' ' + hours + ' ' + t('common.hours');
    if (hours > 0) return hours + ' ' + t('common.hours') + ' ' + minutes + ' ' + t('common.minutes');
    return minutes + ' ' + t('common.minutes');
  }

  function number(value) {
    try {
      return new Intl.NumberFormat(current).format(Number(value) || 0);
    } catch (err) {
      return String(Number(value) || 0);
    }
  }

  function bytes(value) {
    var n = Number(value) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  current = detect();
  document.documentElement.setAttribute('lang', current);

  global.I18N = {
    t: t,
    setLang: setLang,
    onChange: onChange,
    langs: LANGS,
    detect: detect,
    date: date,
    day: day,
    relative: relative,
    duration: duration,
    number: number,
    bytes: bytes,
    get lang() { return current; }
  };
  global.t = t;
})(window);
