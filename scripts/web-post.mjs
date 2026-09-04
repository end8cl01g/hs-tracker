#!/usr/bin/env node
/**
 * scripts/web-post.mjs —— Vite 之後補上 PWA 需要的三件事（vite 本身不管這些）
 *  ① data/*.json 進 dist（引擎執行期會 fetch ./data/...，星圖/卷軸是 import 進 bundle 的，兩邊都要有）
 *  ② dist/sw.js：用 esbuild 把 src/sw.ts 編成單檔，PRECACHE 由「dist 實際產物」生成（ hashed 檔名不能再手寫）
 *  ③ VERSION：寫入本次 git sha（舊版靠這個失效快取； Pages 上「改了看不到」都是死在這裡）
 */
import { readdirSync, readFileSync, writeFileSync, statSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { transformSync } from 'esbuild';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1).split('\\').join('/')]);

// ① data/
mkdirSync(join(DIST, 'data'), { recursive: true });
const dataFiles = readdirSync(join(ROOT, 'data')).filter((f) => f.endsWith('.json'));
for (const f of dataFiles) copyFileSync(join(ROOT, 'data', f), join(DIST, 'data', f));

// ② + ③ sw.js
const sha = (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'dev'; } })();
const rel = [...new Set(['index.html', 'manifest.json', ...walk(DIST)
  .filter((f) => f !== 'sw.js' && !f.endsWith('.map') && !f.startsWith('data/')),
  ...dataFiles.map((f) => `data/${f}`)])].sort();
// 一律用相對 Pages 子路徑的絕對形式：'./' 在 sw.js 自己身上會解析錯（SW scope），寫死 '/' 又在子路徑 404
const toUrl = (f) => `/hs-tracker/${f}`;
const precache = ['.', ...rel.map(toUrl)];
let src = readFileSync(join(ROOT, 'src/sw.ts'), 'utf8');
const before = src;
const arr = `const PRECACHE = ${JSON.stringify(precache.map((p) => (p === '.' ? './' : p)))};`;
const arrData = `const DATA_URLS = ${JSON.stringify(rel.filter((f) => f.startsWith('data/')).map(toUrl))};`;
src = src
  .replace(/const\s+PRECACHE(?:_URLS)?\s*=\s*\[[\s\S]*?\];/, arr)
  .replace(/const\s+PRECACHE_URLS\s*=\s*\[[\s\S]*?\];/, arr)
  .replace(/const\s+VERSION\s*=\s*[^;\n]+;/, `const VERSION = ${JSON.stringify(sha)};`)
  .replace(/const\s+DATA_URLS\s*=\s*\[[\s\S]*?\];/, arrData)
;
// src/sw.ts 是 TypeScript：直接寫成 .js 瀏覽器會解析失敗（上一版就在這裡炸——SW 載入即掛，
// 表面上看是「離線沒生效」，實際是 sw.js 內容含 `: string[]` 這種型別註解）。所以一律過 esbuild。
let js;
try {
  const r = transformSync(src, { loader: 'ts', format: 'iife', target: 'es2020' });
  js = r.code;
} catch (e) {
  process.stderr.write(`✗ sw.ts 經 esbuild 轉換失敗：${e.message}\n`);
  process.exit(1);
}
const injected = [
  [!before.includes(arr) && src.includes(arr), 'PRECACHE 沒被替換（sw.ts 的變數名又改了？）'],
  [src.includes(`const VERSION = ${JSON.stringify(sha)}`), 'VERSION 沒注入 → 改版不會生效'],
  [!js.includes('__BUILD__'), 'sw.js 還留著 __BUILD__ 佔位'],
  [!/:\s*(string|number|any)\[\]/.test(js) && !/\bconst\s+\w+:\s/.test(js), 'sw.js 殘留 TS 型別語法（瀏覽器會解析失敗）'],
  [!/'\.\/app\.js'|\/css\/style\.css/.test(src), 'PRECACHE 仍列舊前端檔案（vite 之後產物名不是這個）'],
];
for (const [ok, why] of injected) if (!ok) { process.stderr.write(`✗ sw.js 注入驗證失敗：${why}\n`); process.exit(1); }
writeFileSync(join(DIST, 'sw.js'), js.replace(/^/m, `/* 由 scripts/web-post.mjs 產生：PRECACHE 來自 dist 實產物，請勿手改 */\n`));

const files = {};
for (const f of walk(DIST)) files[f] = statSync(join(DIST, f)).size;
delete files['build-info.json'];
// ③′ index.html 也要帶 build 代號：設定頁/診斷靠這行判斷「你看到的是哪版」，CI 也直接 grep 它
{
  const idxP = join(DIST, 'index.html');
  let html = readFileSync(idxP, 'utf8');
  html = html.replace(/\s*<meta name="hs:build"[^>]*>/, '');
  if (!html.includes('hs:build')) {
    html = html.replace(/<\/head>/i, `  <meta name="hs:build" content="${sha}">\n</head>`);
    writeFileSync(idxP, html);
  }
}

writeFileSync(join(DIST, 'build-info.json'), JSON.stringify({ build: sha, generated_at: new Date().toISOString(), files, precache: precache.length }, null, 2) + '\n');
const total = Object.values(files).reduce((a, b) => a + b, 0);
process.stdout.write(`✓ dist 就緒：${walk(DIST).length} 檔、${(total / 1024).toFixed(1)}KB｜PRECACHE ${precache.length} 項｜VERSION=${sha.slice(0, 7)}\n`);
