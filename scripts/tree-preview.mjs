#!/usr/bin/env node
/**
 * scripts/tree-preview.mjs —— 把「真的會被渲染出來的星圖」瀋成一張 SVG，给人看、也给 diff 用。
 * 為什麼要这支：星圖是 JS 算出來的，只看原始碼看不出「星擠在一起」這種問題（實測過：33 顆星最近只隔 6.7 單位）。
 * 這裡跑的是 build/ts/ui.js 的 renderTree 本體（不是另寫一套），所以預覽與線上行為同一條路徑。
 *   用法：npm run tree:preview   → dist-preview/tree.svg
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = JSON.parse(readFileSync(join(ROOT, 'data/skills.json'), 'utf8'));
const els = new Map();
const mk = (id) => ({
  id, innerHTML: '', textContent: '', hidden: false, disabled: false, style: {}, dataset: {}, value: '', max: 1,
  querySelectorAll: () => [], addEventListener() {}, closest: () => null,
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute(k, v) { if (k === 'viewBox') this.__vb = v; }, appendChild() {}, showModal() {}, close() {},
});
const get = (id) => { if (!els.has(id)) els.set(id, mk(id)); return els.get(id); };
const ctx = {
  console, JSON, Math, Date, String, Number, Object, Array, Set, Map, RegExp, Boolean, Promise, Error, isNaN, parseInt,
  document: { getElementById: get, querySelectorAll: () => [], createElement: () => mk('t'), addEventListener() {}, body: mk('body') },
  window: {}, navigator: { onLine: true, storage: { persist: async () => true } },
  localStorage: { getItem: () => null, setItem() {} }, setTimeout, clearTimeout,
};
ctx.window = ctx; ctx.globalThis = ctx;
createContext(ctx);
for (const f of ['animations', 'game-core', 'ui']) runInContext(readFileSync(join(ROOT, 'build/ts', `${f}.js`), 'utf8'), ctx, { filename: f });

const unlocked = new Set(S.nodes.slice(0, 6).map((n) => n.id));           // 示範態：6 顆已亮、1 顆可點、其餘鎖著
const statuses = {}; for (const id of unlocked) statuses[id] = { unlocked: true };
const vm = {
  skillNodes: S.nodes, skillStatuses: statuses, unlockedCount: unlocked.size, totalXP: 520,
  streak: { current: 5, longest: 9 }, level: { level: 5, title: 'x', progress: 0.5, next: { xpRequired: 900 } },
  points: { level: 5, total: 4, spent: 3, available: 1 }, kindLabels: {}, badges: [], badgeStatuses: {},
};
ctx.UI.vm = vm; ctx.UI.renderTree(vm);
const STYLE = `<style>
.skyrim-tree{background:#0a0a1a;font-family:system-ui,sans-serif}
.edge{fill:none;stroke:#2c2c50;stroke-width:1.4}.edge.on{stroke:#e94560;stroke-width:2;opacity:.85}
.core{fill:#33334f;stroke:#43436b;stroke-width:2}.halo{fill:transparent}
.sky-node.unlocked .core{fill:#e94560;stroke:#ffd166}.sky-node.unlocked .halo{fill:rgba(233,69,96,.18)}
.sky-node.ready .core{fill:#fff3c4;stroke:#ffd166}.sky-node.ready .halo{fill:rgba(255,209,102,.16)}
.sky-node.waiting .core{fill:#4a4a72;stroke:#6a6aa0;stroke-dasharray:3 3}.sky-node.locked{opacity:.38}
.hub-emoji{font-size:26px;text-anchor:middle}.hub-text{fill:#6a6aa0;font-size:11px;letter-spacing:2px;text-anchor:middle}
</style>`;
mkdirSync(join(ROOT, 'dist-preview'), { recursive: true });
// 這個預覽不靠 CSS：cairosvg/ImageMagick 對 <style> class 的支援不可靠（實測：星全被畫成近黑的預設色，
// 看起來像「沒有節點」）。所以把 class 翻成 presentation attribute，只翻外观、座標一律沿用 ui.js 算出來的結果。
const raw = els.get('tree-world').innerHTML;
const COL = { unlocked: '#e94560', ready: '#fff3c4', waiting: '#4a4a72', locked: '#33334f' };
const RIM = { unlocked: '#ffd166', ready: '#ffd166', waiting: '#6a6aa0', locked: '#43436b' };
let stars = 0;
let body = raw.replace(/<g class="sky-node (\w+)"[^>]*>([\s\S]*?)<\/g>/g, (all, st) => {
  stars++;
  const c = (all.match(/class="core" cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="(\d+)"/) || []);
  const t = (all.match(/class="node-label" x="(-?[\d.]+)" y="(-?[\d.]+)">([^<]*)</) || []);
  if (c.length < 4) return all;
  const lab = t.length >= 4 ? `<text x="${t[1]}" y="${t[2]}" fill="#cfcfe8" font-size="13" text-anchor="middle">${t[3]}</text>` : '';
  return `<g><circle cx="${c[1]}" cy="${c[2]}" r="${Number(c[3]) + 12}" fill="${COL[st]}" fill-opacity=".14"/>`
    + `<circle cx="${c[1]}" cy="${c[2]}" r="${c[3]}" fill="${COL[st]}" stroke="${RIM[st]}" stroke-width="2"/>${lab}</g>`;
});
const edgesIn = (raw.match(/<path class="edge/g) || []).length;   // 與下面替換數對照，防漏件
let edges = 0;
body = body.replace(/<path class="edge([^"]*)" d="([^"]+)"\/>/g, (all, cls, d) => {
  edges++; const on = /\bon\b/.test(cls);
  return `<path d="${d}" fill="none" stroke="${on ? '#e94560' : '#3a3a66'}" stroke-width="${on ? 2.4 : 1.4}"${on ? ' opacity=".9"' : ''}/>`;
});
body = body.replace(/<ellipse class="tier-ring"[^>]*\/>/g, (all) => all.replace('<ellipse', '<ellipse fill="none" stroke="#22224' + '4"'));
const counts = { starsIn: (raw.match(/class="sky-node /g) || []).length, starsOut: stars, edgesIn, edgesOut: edges };
if (counts.starsIn !== counts.starsOut || counts.edgesIn !== counts.edgesOut) {
  process.stderr.write('⚠️ 預覽轉換漏件：' + JSON.stringify(counts) + '（漏了就是渲染誤判，先修這裡）\n');
  process.exitCode = 1;
}
const vb = els.get('skill-tree') && els.get('skill-tree').__vb;
const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb || '0 0 1000 700'}" width="1200" height="840"><rect width="100%" height="100%" fill="#0a0a1a"/><g>${body}</g></svg>`;
writeFileSync(join(ROOT, 'dist-preview/tree.svg'), out);
process.stdout.write(`dist-preview/tree.svg 已產生：${S.nodes.length} 顆星、${counts.edgesOut} 條連線（外框/顏色是預覽專用內聯，App 用 CSS class）\n`);
