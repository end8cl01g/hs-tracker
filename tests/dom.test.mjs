// tests/dom.test.mjs — 用真實 index.html 的顯隱 markup + 真實 CSS 規則，把真 ui.js / animations.js 跑在迷你 DOM 上。
// 意圖很單純：驗「按了按鈕之後東西真的看得見」。上一輪靜態檢查全綠但首開會卡在載入畫面，
// 就是因為 JS 用 classList 切 class、markup 用的是 hidden 屬性，兩者互不相干。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// 元素透過 innerHTML 注入的 id（例：skill-close）也要查得到，所以共用一張註冊表
let REG = new Map();

function mkEl(id, classes = [], hidden = false) {
  const set = new Set(classes);
  const el = {
    id, __hidden: !!hidden, _q: new Map(), style: {}, dataset: {}, value: '', textContent: '', innerHTML: '',
    listeners: {},
    get hidden() { return this.__hidden; },
    set hidden(v) { this.__hidden = !!v; },
    get className() { return [...set].join(' '); },
    set className(v) { set.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => set.add(c)); },
    get classList() {
      return {
        add: (...c) => c.forEach((x) => set.add(x)),
        remove: (...c) => c.forEach((x) => set.delete(x)),
        toggle: (c, force) => { const on = force === undefined ? !set.has(c) : !!force; on ? set.add(c) : set.delete(c); return on; },
        contains: (c) => set.has(c),
      };
    },
    set innerHTML(v) {
      this._html = v;
      for (const m of String(v).matchAll(/\bid="([^"]+)"/g)) if (!REG.has(m[1])) REG.set(m[1], mkEl(m[1]));
    },
    get innerHTML() { return this._html || ''; },
    addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); },
    removeEventListener() {},
    appendChild() {},
    remove() {},
    closest() { return null; },
    focus() {},
    querySelector(sel) { if (!this._q.has(sel)) this._q.set(sel, mkEl(`${this.id}:${sel}`)); return this._q.get(sel); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; },
    click() { (this.listeners.click || []).forEach((f) => f({ preventDefault() {} })); if (this.onclick) this.onclick({ preventDefault() {} }); },
  };
  return el;
}

// 從真實 markup 建 DOM：只抓「有 id 的元素 + 它的 class / 是否帶 hidden 屬性」
function buildDom(html) {
  REG = new Map();
  const els = new Map();
  for (const m of html.matchAll(/<([a-zA-Z][\w-]*)\b([^>]*)>/g)) {
    const attrs = m[2];
    const idm = attrs.match(/\bid="([^"]+)"/);
    if (!idm || els.has(idm[1])) continue;
    const cls = (attrs.match(/\bclass="([^"]+)"/) || [, ''])[1].split(/\s+/).filter(Boolean);
    els.set(idm[1], mkEl(idm[1], cls, /(?:^|\s)hidden(?:\s|=|>|$)/.test(attrs)));
  }
  return els;
}

const CSS = read('css/style.css');
const ATTR_RULE = /\[hidden\]\s*\{[^}]*display:\s*none/.test(CSS);

// CSS 用 `.modal.hidden` 這種 class 規則藏元素時才算；得同時「元素真的有 .hidden class」才算
function hiddenByClass(el) {
  if (!el.classList.contains('hidden')) return false;
  return [...el.className.split(/\s+/).filter(Boolean)].some((c) =>
    new RegExp(`\\.${c}\\.hidden\\b[^{]*\\{[^}]*display:\\s*none`).test(CSS));
}
const visible = (el) => !((ATTR_RULE && el.hidden) || hiddenByClass(el));

function loadUI() {
  const els = buildDom(read('index.html'));
  const document = {
    getElementById: (id) => els.get(id) || REG.get(id) || null,
    querySelectorAll: () => [],
    createElement: (t) => mkEl('created-' + t),
    addEventListener: () => {},
    hidden: false,
  };
  const ctx = createContext({
    document, window: null, setTimeout, clearTimeout, console,
    navigator: { onLine: true, serviceWorker: { register: async () => ({ update: async () => {} }) } },
    localStorage: { getItem: () => null, setItem: () => {} },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
  });
  ctx.window = ctx;
  runInContext(read('js/ui.js'), ctx, { filename: 'js/ui.js' });
  runInContext(read('js/animations.js'), ctx, { filename: 'js/animations.js' });
  ctx.UI.vm = {
    skillNodes: [{ id: 's1', name: '靠牆倒立', min_xp: 450, min_streak: 0, requires: [] }],
    skillStatuses: { s1: { unlocked: false, video_url: '', notes: '' } },
    totalXP: 500, streak: { current: 3 }, badges: [], weekly: [], conflicts: 0,
  };
  const saved = [];
  ctx.DataLayer = { setSkillMeta: async (id, meta) => { saved.push([id, meta]); return { ok: true }; } };
  ctx.GameEngine = { tryUnlockSkill: async () => ({ ok: false, why: 'XP 不足', need: 900 }) };
  return { els, ctx, saved };
}

test('標記事實：#app / #onboarding-modal / #toast 一開始用 hidden 屬性藏起來', () => {
  const els = buildDom(read('index.html'));
  for (const id of ['app', 'onboarding-modal', 'toast', 'skill-modal', 'level-up-overlay']) {
    assert.ok(els.get(id)?.hidden === true, `#${id} 應該初始帶 hidden 屬性`);
    assert.ok(!els.get(id).classList.contains('hidden'), `#${id} 不該同時又掛一個 .hidden class（兩種機制混用就是这次的 bug）`);
  }
  assert.ok(ATTR_RULE, 'CSS 要有 [hidden]{display:none}，否則 hidden 屬性形同虛設');
});

test('showApp() 之後主畫面真的可見（只用 classList 會被這條打回）', () => {
  const { els, ctx } = loadUI();
  assert.equal(visible(els.get('app')), false, 'boot 前必須是藏起來的');
  ctx.UI.showApp();
  assert.equal(visible(els.get('app')), true, 'showApp() 之後 #app 必須可見');
});

test('showOnboarding() 之後引導頁可見；hideLoading() 把載入畫面收掉', () => {
  const { els, ctx } = loadUI();
  ctx.UI.showOnboarding();
  assert.equal(visible(els.get('onboarding-modal')), true);
  ctx.UI.hideLoading();
  assert.equal(visible(els.get('loading-screen')), false, '啟動成功後 loading 必須消失');
});

test('啟動失敗時：loading 留著、錯誤訊息可見（不能靜默卡住）', () => {
  const { els, ctx } = loadUI();
  ctx.UI.hideLoading('sql.js 載入失敗');
  assert.equal(visible(els.get('loading-screen')), true);
  assert.equal(els.get('loading-screen').querySelector('.loading-text').textContent, '啟動失敗');
  assert.equal(visible(els.get('loading-error')), true);
  assert.equal(els.get('loading-error').textContent, 'sql.js 載入失敗');
});

test('技能 modal：開 → 填 → 存 → 關，innerHTML 注入的按鈕也接得上線', async () => {
  const { els, ctx, saved } = loadUI();
  const G = (id) => els.get(id) || REG.get(id);
  ctx.UI.openSkill('s1');
  assert.equal(visible(els.get('skill-modal')), true, '開 modal 後必須可見');
  const content = els.get('skill-modal-content').innerHTML;
  assert.match(content, /靠牆倒立/);
  assert.match(content, /id="skill-close"/);
  assert.match(content, /id="skill-video"/);
  // 表單存檔：走真實 DOM 事件，不是測試另寫一套邏輯
  G('skill-video').value = 'https://youtu.be/abc';
  G('skill-notes').value = '<img src=x onerror=alert(1)>';
  await G('skill-save').onclick();
  assert.deepEqual(saved.map(([id]) => id), ['s1'], 'skill-save 必須真的呼叫 DataLayer.setSkillMeta');
  assert.equal(saved[0][1].videoUrl, 'https://youtu.be/abc');
  assert.equal(visible(els.get('skill-modal')), false, '存完要自動收 modal');
  // 再開一次，用關閉按鈕收
  ctx.UI.openSkill('s1');
  assert.equal(visible(els.get('skill-modal')), true);
  G('skill-close').onclick();
  assert.equal(visible(els.get('skill-modal')), false, '按關閉後必須Hide');
});

test('Esc 關閉的責任在 app.js：必須監聽 keydown 並呼叫 closeSkillAndRefresh', () => {
  const app = read('js/app.js');
  assert.match(app, /addEventListener\('keydown'/);
  assert.match(app, /Escape/);
  assert.match(app, /closeSkillAndRefresh\(\)/);
});

test('toast 真的會浮出來，2.6 秒後自己收掉', async () => {
  const { els, ctx } = loadUI();
  ctx.UI.toast('已保存');
  assert.equal(visible(els.get('toast')), true, 'toast 叫了卻看不見 = 沒有回饋');
  assert.equal(els.get('toast').textContent, '已保存');
  await new Promise((r) => setTimeout(r, 2750));
  assert.equal(visible(els.get('toast')), false, 'toast 要會消失');
});

test('Animations.levelUp 用同一套顯隱機制', () => {
  const { els, ctx } = loadUI();
  ctx.Animations.levelUp({ level: 7, title: '倒立新手' });
  assert.equal(visible(els.get('level-up-overlay')), true);
  ctx.Animations.confetti = () => {};
});

test('政策：全站不得再出現 classList 切 hidden（混用就是這次卡死的原因）', () => {
  for (const f of ['js/ui.js', 'js/app.js', 'js/animations.js', 'js/game-engine.js', 'js/backup.js']) {
    const s = read(f);
    assert.ok(!/classList\s*\.\s*(add|remove|toggle)\(\s*['"]hidden['"]/.test(s), `${f} 還用 classList 切 hidden`);
  }
});
