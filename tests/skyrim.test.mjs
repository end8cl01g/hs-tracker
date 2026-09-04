// tests/skyrim.test.mjs —— 合併後的兩條主軸：技能點經濟（引擎）＋ Vite 產物契約（前端）。
// 舊前端（src/ui.ts + css/style.css + 手刻疊層 modal）已整個捨棄，所以這裡不再測 DOM 渲染細節；
// 但「星圖內容只能來自 data/*.json」這條必須有測試守著——否則哪天有人把課表寫進元件，PLAN.md 就失去唯一規範的地位。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const S = JSON.parse(read('data/skills.json'));

/** 只載入引擎（build/ts/game-core.js 由 npm test 前置的 ts:loose 產生，測的務必是剛重建的那份） */
function core() {
  const ctx = { console, JSON, Math, Date, String, Number, Object, Array, Set, Map, RegExp, Boolean, Promise, Error, isNaN, parseInt, document: { getElementById: () => null, addEventListener() {} }, window: {} };
  ctx.window = ctx; ctx.globalThis = ctx;
  createContext(ctx);
  runInContext(read('build/ts/game-core.js'), ctx, { filename: 'game-core.js' });
  return ctx.GameCore;
}

// 注意：物體是 vm context 產出的，deepStrictEqual 會因 prototype 不同而紅 → 逐欄比對
const eq = (got, want, msg) => assert.deepEqual(Object.entries(got).sort(), Object.entries(want).sort(), msg);

test('技能點：每升一級 1 點，已花的要扣掉，而且永不變負', () => {
  const Core = core();
  eq(Core.skillPoints(1, 0), { level: 1, total: 0, spent: 0, available: 0 }, 'Lv.1 不該有點可花');
  eq(Core.skillPoints(4, 2), { level: 4, total: 3, spent: 2, available: 1 });
  const r = Core.skillPoints(2, 9);       // 雲端解鎖過、本機等級還沒同步時不能變負
  assert.equal(r.available, 0); assert.equal(r.spent, 9);
});

test('canUnlock：條件齊備但沒點數 → no-points；有點數才放行；不傳 points 維持舊行為', () => {
  const Core = core();
  const node = S.nodes.find((n) => (n.requires || []).length === 0);
  const ok = { totalXP: 99999, streak: 99 };
  eq(Core.canUnlock(node, {}, { ...ok, points: 0 }), { ok: false, why: 'no-points', need: 1 });
  assert.equal(Core.canUnlock(node, {}, { ...ok, points: 1 }).ok, true, '有點數就該解鎖');
  assert.equal(Core.canUnlock(node, {}, ok).ok, true, '不傳 points 的舊呼叫端不憑空加閘');
});

test('解鎖由引擎統一把關；且不做 respec（沒有退點通路）', () => {
  const eng = read('src/game-engine.ts');
  assert.match(eng, /points:\s*pts\.available/, 'tryUnlockSkill 必須把可用點數餵給 canUnlock');
  assert.match(eng, /const spent = await DL\(\)\.getUnlockedCount\(\)/, '已花點數由「已解鎖節點數」推算，不另存一份帳');
  assert.doesNotMatch(eng + read('src/data-layer.ts'), /refund|respec/, '刻意不做 respec');
});

// ---------- 合併管線契約 ----------
test('dist 產物必須自給自足：無外部 CDN、相對路徑、sw 的 PRECACHE 涵蓋 vite hashed 檔', () => {
  const html = read('dist/index.html');
  assert.doesNotMatch(html, /https?:\/\/(fonts\.googleapis|fonts\.gstatic|cdnjs|cdn\.jsdelivr|unpkg)/, 'index.html 不得引用外部 CDN（離線 PWA 硬條件；字型要自架）');
  assert.match(html, /src="\.\/assets\//, '資產必須是相對路徑（Pages 在 /hs-tracker/ 子路徑，寫死 / 會全盤 404）');
  const sw = read('dist/sw.js');
  assert.match(sw, /\/hs-tracker\/assets\/index-[\w-]+\.js/, 'PRECACHE 必須列 vite 的 hashed 產物');
  assert.doesNotMatch(sw, /'\.\/app\.js'|\/css\/style\.css|__BUILD__/, 'PRECACHE 不得再列舊前端檔案，VERSION 不能留佔位');
  assert.doesNotMatch(sw, /'\/assets/i, 'PRECACHE 用 /hs-tracker/ 前綴，不得出現 root 絕對路徑');
  assert.match(sw, /\/hs-tracker\/vendor\/sql-wasm\.wasm/, 'sql.js 的 wasm 要在離線殼裡（本機資料庫靠它）');
});

test('星圖內容只能來自 data/*.json（訓練內容不進元件）', () => {
  const src = read('src/skyrim/data/skyrimPerksData.ts');
  assert.match(src, /from '\.\.\/\.\.\/\.\.\/data\/skills\.json'/, '星圖必須讀 data/skills.json');
  assert.doesNotMatch(src, /id:\s*'(wrist1|crow1|hs_wall)'/, '元件內不得手寫節點（那是 PLAN.md 的職責）');
  assert.ok(S.nodes.length >= 30, '資料本體仍應是 33 節點等級');
  const scrollSrc = read('src/skyrim/data/skyrimData.ts');
  for (const token of ['退階：', '地點：', 'PLAN.md', '可選']) {
    assert.ok(scrollSrc.includes(token), `卷軸沒帶上 ${token}（資料有但看不見等於沒有）`);
  }
  assert.match(scrollSrc, /kind_labels|KIND\[e\.kind\]/, '動作分類要用資料裡的 kind_labels，別在元件裡另翻一份');
});
