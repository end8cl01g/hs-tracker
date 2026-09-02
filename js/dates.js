// js/dates.js — 一切日期運算的地基：只用「本機日曆日」，不碰 UTC
// 規格缺陷修正 todo 1.6：SQLite datetime('now') 是 UTC、new Date('YYYY-MM-DD') 是 UTC 午夜，
// 在 HK(+8) 会让「今天」跟 streak 差一天。全部改由這裡統一。
(function (global) {
  'use strict';

  const pad = (n) => String(n).padStart(2, '0');

  /** 本機日曆日 -> 'YYYY-MM-DD' */
  function toISODate(d) {
    const x = d instanceof Date ? d : new Date(d);
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }

  /** 'YYYY-MM-DD' -> 本機午夜 Date（絕不用 new Date(str)，那是 UTC 解析） */
  function fromISODate(s) {
    if (s instanceof Date) return new Date(s.getFullYear(), s.getMonth(), s.getDate());
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  /** 本機時間戳（含時區偏移），給 updated_at 用，LWW 比較靠它 */
  function nowStamp(d) {
    const x = d instanceof Date ? d : new Date();
    const off = -x.getTimezoneOffset();
    const sign = off >= 0 ? '+' : '-';
    const abs = Math.abs(off);
    return `${toISODate(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}` +
      `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  }

  /** 兩日期相差幾個「日曆日」（忽略時分），跨月/閏年安全 */
  function dayDiff(a, b) {
    const x = fromISODate(a), y = fromISODate(b);
    if (!x || !y) return NaN;
    return Math.round((y - x) / 86400000);
  }

  function addDays(iso, n) {
    const x = fromISODate(iso);
    if (!x) return null;
    x.setDate(x.getDate() + n);
    return toISODate(x);
  }

  /** 0=日 … 6=六 */
  function weekdayOf(iso) {
    const x = fromISODate(iso);
    return x ? x.getDay() : null;
  }

  const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const weekdayKey = (iso) => WD[weekdayOf(iso)];

  function isValidISODate(s) {
    const x = fromISODate(s);
    return !!x && toISODate(x) === s;
  }

  const DateUtils = {
    toISODate, fromISODate, nowStamp, dayDiff, addDays, weekdayOf, weekdayKey, isValidISODate,
    todayISO: () => toISODate(new Date()),
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = DateUtils;
  global.DateUtils = DateUtils;
})(typeof window !== 'undefined' ? window : globalThis);
