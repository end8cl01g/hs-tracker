// tests/render-smoke.test.mjs — 真的把 UI.renderToday 跑一遍（迷你 DOM ＋ 真 data/workout.json）。
// 為什麼需要它：上一次「啟動失敗」是模板裡對已 join 的字串再 .map()，typecheck/check/靜態掃源码全都過，
// 因為那是執行期才炸的型別誤用。grep 式測試（「ui.ts 有 pd.gate 字樣」）根本沒執行那條路徑。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const W = JSON.parse(read('data/workout.json'));

function mkEl(id) {
  const el = {
    id, innerHTML: '', textContent: '', hidden: false, disabled: false, style: {}, dataset: {}, value: '',
    _set: new Set(), listeners: {},
    querySelectorAll: () => [], addEventListener() {}, closest: () => el,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, appendChild() {},
  };
  return el;
}

function boot() {
  const els = new Map();
  const get = (id) => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); };
  const ctx = {
    console, JSON, Math, Date, String, Number, Object, Array, Set, Map, RegExp, Boolean, Promise, Error, isNaN, parseInt,
    document: { getElementById: get, querySelectorAll: () => [], createElement: () => mkEl('tmp'), addEventListener() {}, body: mkEl('body') },
    window: {}, navigator: { onLine: true, storage: { persist: async () => true } },
    localStorage: { getItem: () => null, setItem() {} },
    setTimeout, clearTimeout,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  createContext(ctx);
  runInContext(read('build/ts/animations.js'), ctx, { filename: 'animations.js' });
  runInContext(read('build/ts/ui.js'), ctx, { filename: 'ui.js' });
  return { ctx, UI: ctx.UI, els: get };
}

function vmFor(phase, dayKey, extra = {}) {
  const p = W.phases[`phase${phase}`];
  return {
    phase, plan: { dayKey, workout: p.days[dayKey], phaseData: p, isRestDay: false },
    workoutData: W, totalXP: 120, streak: { current: 3, longest: 5 },
    level: { level: 2, title: '新手', progress: 0.4, next: { xpRequired: 500 } },
    exercises: [], todayLog: null, skills: [], unlockedCount: 0, settings: {},
    kindLabels: W.kind_labels, ...extra,
  };
}

test('renderToday 對五個 phase × 五天都不能丟錯（啟動失敗的來源就是這一條路徑）', () => {
  const { UI } = boot();
  let n = 0;
  for (const phase of [0, 1, 2, 3, 4]) {
    for (const dayKey of Object.keys(W.phases[`phase${phase}`].days)) {
      assert.doesNotThrow(() => UI.renderToday(vmFor(phase, dayKey)), `phase${phase}.${dayKey} 渲染時丟例外`);
      n++;
    }
  }
  assert.ok(n >= 25, `只跑了 ${n} 種組合，太少了`);
});

test('訓練日卡片要真的把新欄位印出來（資料有、畫面沒等於沒有）', () => {
  const { UI, els } = boot();
  UI.renderToday(vmFor(0, 'mon'));
  const html = els('workout-card').innerHTML;
  assert.match(html, /Day 1|MON 訓練日|訓練日/, '要有當天標題');
  assert.match(html, /📍 chocoZAP/, '地點 chip');
  assert.match(html, /退階：/, '退階版要看得見');
  assert.match(html, /太輕/, '⚠️ 安全提示要看得見（前 2 週用覺得太輕的重量）');
  assert.match(html, /☐ 面牆倒立（胸朝牆）60 秒 × 2 組/, 'gate 清單要逐條列出來');
  assert.match(html, /看能力，不看日曆/, 'gate 標題');
  assert.match(html, /🎯 必達：/, '分層目標');
  assert.ok(!/undefined|\[object Object\]|function/.test(html), `卡片裡出現可疑文字：${(html.match(/.{0,60}(undefined|\[object Object\]).{0,60}/) || [''])[0]}`);
});

test('休息日與缺欄位的舊快取也不能炸（GAS 可能還回舊版 config）', () => {
  const { UI, els } = boot();
  assert.doesNotThrow(() => UI.renderToday({ ...vmFor(0, 'sat'), plan: { isRestDay: true, reason: 'rest' } }));
  assert.match(els('workout-card').innerHTML, /今日休息/);
  const thin = { ...vmFor(0, 'mon'), plan: { dayKey: 'mon', workout: W.phases.phase0.days.mon, isRestDay: false }, workoutData: { phases: W.phases } };
  assert.doesNotThrow(() => UI.renderToday(thin), 'phaseData/goals 缺席時要降級而不是拋错');
  assert.doesNotThrow(() => UI.renderToday({ ...vmFor(2, 'tue'), plan: { dayKey: 'tue', workout: [], phaseData: { gate: '錯型別', day_meta: { tue: { place: 123 } } }, isRestDay: false } }),
    'gate 是字串/數字這種髒資料時也不能炸');
});
