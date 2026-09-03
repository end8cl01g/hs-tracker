// tests/skyrim.test.mjs — 「Skyrim 化」的兩件事：星圖渲染 ＋ 技能點經濟，都要真的執行過。
// 同一個教訓的延伸：靜態 grep 抓不到執行期的型別誤用（上次啟動失敗就是），所以這裡一律載入
// build/ts/*.js 在迷你 DOM 上真跑；`npm test` 會先跑 ts:loose 確保這份 JS 不是舊的。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const S = JSON.parse(read('data/skills.json'));

function mkEl(id) {
  const el = {
    id, innerHTML: '', textContent: '', hidden: false, disabled: false, style: {}, dataset: {}, value: '',
    open: false, max: 1, _set: new Set(), listeners: {},
    querySelectorAll: () => [], addEventListener() {}, closest: () => el,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, appendChild() {}, showModal() { this.open = true; this.hidden = false; }, close() { this.open = false; },
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
    localStorage: { getItem: () => null, setItem() {} }, setTimeout, clearTimeout,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  createContext(ctx);
  runInContext(read('build/ts/animations.js'), ctx, { filename: 'animations.js' });
  runInContext(read('build/ts/game-core.js'), ctx, { filename: 'game-core.js' });
  runInContext(read('build/ts/ui.js'), ctx, { filename: 'ui.js' });
  return { ctx, Core: ctx.GameCore, UI: ctx.UI, els: get };
}

// 注意：物體是 vm context 產出的，deepStrictEqual 會因 prototype 不同而紅 → 逐欄比對
const eq = (got, want, msg) => assert.deepEqual(Object.entries(got).sort(), Object.entries(want).sort(), msg);

const vmFor = (over = {}) => ({
  skillNodes: S.nodes, skillStatuses: {}, unlockedCount: 0, totalXP: 400,
  streak: { current: 4, longest: 6 }, level: { level: 4, title: 'x', progress: 0.5, next: { xpRequired: 900 } },
  points: { level: 4, total: 3, spent: 0, available: 3 }, kindLabels: {}, badges: [], badgeStatuses: {},
  ...over,
});

// ---------- 1) 點數經濟 ----------
test('技能點：每升一級 1 點，已花的要扣掉，而且永不變負', () => {
  const { Core } = boot();
  eq(Core.skillPoints(1, 0), { level: 1, total: 0, spent: 0, available: 0 }, 'Lv.1 不該有點可花');
  eq(Core.skillPoints(4, 2), { level: 4, total: 3, spent: 2, available: 1 });
  const r = Core.skillPoints(2, 9);       // 資料跑掉（雲端解鎖過、本機等級還沒同步）時不能變負
  assert.equal(r.available, 0); assert.equal(r.spent, 9);
});

test('canUnlock：條件齊備但沒點數 → no-points；有點數才放行', () => {
  const { Core } = boot();
  const node = S.nodes.find((n) => (n.requires || []).length === 0);
  const ok = { totalXP: 99999, streak: 99 };
  eq(Core.canUnlock(node, {}, { ...ok, points: 0 }), { ok: false, why: 'no-points', need: 1 });
  assert.equal(Core.canUnlock(node, {}, { ...ok, points: 1 }).ok, true, '有點數就該解鎖');
  assert.equal(Core.canUnlock(node, {}, ok).ok, true, '不傳 points（舊呼叫端）→ 維持原行為，不憑空加閘');
});

test('解鎖要花的點由引擎統一把關；且不做 respec（沒有退點 API）', () => {
  const eng = read('src/game-engine.ts');
  assert.match(eng, /points:\s*pts\.available/, 'tryUnlockSkill 必須把可用點數餵給 canUnlock（否則點數只是裝飾）');
  assert.match(eng, /const spent = await DL\(\)\.getUnlockedCount\(\)/, '已花的點數要用「已解鎖節點數」推算，不另存一份帳');
  assert.doesNotMatch(eng + read('src/data-layer.ts'), /refund|respec|unlockCount\s*\+\s*1/, '刻意不做 respec：不得出現退點/重建點數的通路');
});

// ---------- 2) 星圖渲染 ----------
test('renderTree 真跑：每個節點都成一顆星、每條 requires 都成一條連線', () => {
  const { UI, els } = boot();
  UI.renderTree(vmFor());
  const svg = els('tree-world').innerHTML;
  const nStars = [...svg.matchAll(/class="sky-node /g)].length;
  const wantEdges = S.nodes.reduce((a, n) => a + (n.requires || []).length, 0);
  assert.equal(nStars, S.nodes.length, '星數必須等於節點數');
  assert.equal([...svg.matchAll(/<path class="edge/g)].length, wantEdges, '連線數必須等於 requires 數');
  for (const n of S.nodes) assert.ok(svg.includes(`data-skill="${n.id}"`), `節點 ${n.id} 沒進星圖`);
  assert.doesNotMatch(svg, /undefined|\[object Object\]/, '星圖字串裡不能出現 undefined');
  assert.match(els('tree-progress').textContent, /0 \/ 33 已解鎖/, '進度文字要動態取總數');
  assert.match(els('tree-points').textContent, /3 點可花/, '點數要讓使用者看見');
  assert.equal(els('tree-progressbar').max, S.nodes.length);
});

test('星圖狀態：已解鎖亮的、可點的是 ready、沒點數淪為 waiting', () => {
  const { UI, els } = boot();
  const first = S.nodes.find((n) => (n.requires || []).length === 0);
  UI.renderTree(vmFor({ points: { total: 3, spent: 3, available: 0 } }));
  assert.ok(/waiting/.test(els('tree-world').innerHTML), '條件到了但沒點數時要有 waiting 態（不然使用者會以為壞了）');
  UI.renderTree(vmFor({ skillStatuses: { [first.id]: { unlocked: true } }, unlockedCount: 1 }));
  assert.match(els('tree-world').innerHTML, /sky-node unlocked/, '已解鎖節點要標成 unlocked');
});

test('放大才浮出節點名（湊近看的设计，而不是把圖壓扁）', () => {
  const { UI, els } = boot();
  UI.treeView = { x: 0, y: 0, k: 1 };
  UI.renderTree(vmFor());
  assert.doesNotMatch(els('tree-world').innerHTML, /node-label/, '縮到全景時不該塞滿字');
  UI.treeView = { x: 0, y: 0, k: 2 };
  UI.renderTree(vmFor());
  assert.match(els('tree-world').innerHTML, /class="node-label"/, '放大後要出現節點名');
});

test('放射配置不能把星堆在一起（同位置＝點得到錯的節點）', () => {
  const { UI } = boot();
  const pos = UI.layoutTree(S.nodes);
  assert.equal(Object.keys(pos).length, S.nodes.length, '每個節點都要有座標');
  const ids = Object.keys(pos); let worst = Infinity;
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const a = pos[ids[i]], b = pos[ids[j]];
    worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y));
  }
  assert.ok(worst >= 52, `最近兩顆星只隔 ${worst.toFixed(1)}（觸控點半徑 26，會點錯；至少要不重疊）`);

  const [vx, vy, vw, vh] = UI._viewBox.map((n) => Number(n));   // 自適應 viewBox：裝得下才算沒被夾扁
  assert.ok(vw <= 1500 && vh <= 1150, ` viewBox 膨到 ${vw}×${vh}：斥力解算把圖推爆了`);
  // 同一條支線內：tier 越大必須離樞紐越遠（星圖的「往外＝進步」語意；比 depth 而非比檔案順序）
  const byBranch = new Map();
  for (const n of S.nodes) { if (!byBranch.has(n.branch)) byBranch.set(n.branch, []); byBranch.get(n.branch).push(n); }
  for (const [b, arr] of byBranch) {
    const sorted = [...arr].sort((x, y) => x.tier - y.tier || (x.id < y.id ? -1 : 1));
    for (let i = 1; i < sorted.length; i++) {
      const a = pos[sorted[i - 1].id], c = pos[sorted[i].id];
      assert.ok(c.depth >= a.depth, `支線 ${b}：${sorted[i].id}（tier ${sorted[i].tier}）不該排在 ${sorted[i - 1].id} 內圈`);
    }
  }
});

// ---------- 3) dialog（原生 <dialog>） ----------
test('點星 → 原生 dialog 開；關掉時 hidden 與 close() 都要動（否則背景鎖死）', () => {
  const { UI, els } = boot();
  const node = S.nodes.find((n) => (n.requires || []).length === 0);
  UI.vm = vmFor({});
  UI.renderTree(UI.vm);
  UI.openSkill(node.id);
  assert.equal(els('skill-modal').open, true, '必須用 showModal() 開，不是只拿掉 hidden');
  assert.ok(String(els('sk-title').textContent).includes(node.name), '標題要有節點名');
  assert.match(els('sk-req').innerHTML, /1 技能點/);
  UI.closeSkillAndRefresh();
  assert.equal(els('skill-modal').hidden, true);
});

// ---------- 4) 標記與樣式要齊備 ----------
test('原生元件到位：<svg> 星圖、<dialog>、<template>、兩個 <progress>，且 CSS 全部有樣式', () => {
  const html = read('index.html');
  for (const m of [/<svg id="skill-tree"[\s\S]*?<g id="tree-world"><\/g>/, /<dialog id="skill-modal"/, /<template id="tpl-skill-detail">/,
    /<progress id="xp-fill"/, /<progress id="tree-progressbar"/]) {
    assert.match(html, m, `index.html 少了 ${m}`);
  }
  const css = read('css/style.css');
  for (const cls of ['.skyrim-tree', '.sky-node', '.sky-node.unlocked', '.sky-node.ready', '.sky-node.waiting', '.sky-node.locked', '.edge', '.hub-text', 'dialog.modal-sheet', '.tier-ring']) {
    assert.ok(css.includes(cls), `CSS 少了 ${cls}（有 class 沒樣式＝看起來壞掉）`);
  }
  assert.match(css, /touch-action:\s*none/, 'SVG 要關掉瀏覽器手勢，否則拖曳會變成滾頁面');
});

// ---------- 5) 原生 <dialog> 取代手刻疊層 ----------
test('<dialog> 兩個都是「hidden + showModal」雙軌：老機沒 showModal 也不能看不到 onboarding', () => {
  const html = read('index.html');
  assert.match(html, /<dialog id="onboarding-modal" class="modal-sheet" hidden/, 'onboarding 要用原生 dialog（focus trap／backdrop 交給瀏覽器）');
  assert.match(html, /<dialog id="skill-modal" class="modal-sheet" hidden/, '技能明細同上');
  assert.doesNotMatch(html, /<dialog[^>]*role="dialog"/, '原生元件不要再補 ARIA 角色');

  const css = read('css/style.css');
  // 作者樣式的 display 會蓋掉 UA 的 display:none：沒寫這條，關著的 dialog 會露出來
  assert.match(css, /dialog\.modal-sheet:not\(\[open\]\)\s*\{\s*display:\s*none/, '閉著的 dialog 必須明確 display:none');
  assert.match(css, /dialog\.modal-sheet:not\(\[open\]\):not\(\[hidden\]\)/, '要留「showModal 不可用」的疊層 fallback');

  const { UI, els } = boot();
  UI.showOnboarding();
  assert.equal(els('onboarding-modal').hidden, false, 'showOnboarding 要拿掉 hidden');
  assert.equal(els('onboarding-modal').open, true, '有 showModal 時必須真的 showModal()');
  UI.hideOnboarding();
  assert.equal(els('onboarding-modal').hidden, true, 'hide 要 hidden=true');
  assert.equal(els('onboarding-modal').open, false, 'hide 必須 close()，否則背景被 modal 鎖死');

  // 完全沒有 showModal 的環境（舊 WebView）：只能靠 hidden 切換，仍要看得见
  const noDlg = els('onboarding-modal'); delete noDlg.showModal; noDlg.open = false;
  UI.showOnboarding();
  assert.equal(noDlg.hidden, false, '沒 showModal 時至少 hidden 要放行（CSS fallback 才會顯示）');
});

test('Esc 與 onboarding 的相欠：未完成前 Esc 不能關掉 onboarding', () => {
  const app = read('build/ts/app.js');
  assert.match(app, /onboarding-modal/, 'keydown 處理要認得 onboarding');
  assert.match(app, /hideOnboarding\(\)/, '開始訓練按鈕走 UI.hideOnboarding（成對處理 hidden／close）');
});
