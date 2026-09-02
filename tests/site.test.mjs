// tests/site.test.mjs — 用真實 HTTP 驗證部署產物（content-type、404、引用閉環、JS↔HTML 的 id 對齊）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createStaticServer } from '../scripts/serve.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = existsSync(join(ROOT, 'dist')) ? join(ROOT, 'dist') : ROOT;

let srv, base;
before(async () => { srv = await createStaticServer(DIR); base = `http://127.0.0.1:${srv.port}`; });
after(async () => { await srv.close(); });

const get = (p) => fetch(base + p);

test('目錄根 / 與 index.html 都 200（Pages 的 /hs-tracker/ 子路徑用相對引用即可）', async () => {
  for (const p of ['/', '/index.html']) {
    const r = await get(p);
    assert.equal(r.status, 200, `${p} → ${r.status}`);
    assert.match(r.headers.get('content-type'), /text\/html/);
  }
});

test('wasm 必須以 application/wasm 送出（否則實例化會退回整檔進記憶體）', async () => {
  const r = await get('/vendor/sql-wasm.wasm');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/wasm');
  const buf = await r.arrayBuffer();
  const magic = [...new Uint8Array(buf).slice(0, 4)];
  assert.deepEqual(magic, [0x00, 0x61, 0x73, 0x6d], '不是合法 wasm 檔頭（\0asm）');
  assert.ok(buf.byteLength > 500000, `wasm 太小：${buf.byteLength}`);
});

test('index.html 的每個本地引用都能 200（含 12 支 js 與 css/manifest/icons）', async () => {
  const html = readFileSync(join(DIR, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|#|mailto:)/.test(u));
  assert.ok(refs.length >= 14, `引用太少：${refs.length}`);
  for (const ref of refs) {
    const r = await get('/' + ref.replace(/^\.\//, '').replace(/^\//, ''));
    assert.equal(r.status, 200, `${ref} → ${r.status}`);
  }
});

test('三份設定檔可取回且能 parse', async () => {
  for (const f of ['workout.json', 'skills.json', 'badges.json']) {
    const r = await get('/data/' + f);
    assert.equal(r.status, 200, f);
    const j = await r.json();
    assert.ok(j.version >= 1 && j.updated_at, `${f} 需要 version/updated_at（給 GAS 端 ETag 判斷用）`);
  }
});

test('manifest 與圖示都能取到（PWA 安裝性）', async () => {
  const mf = await (await get('/manifest.json')).json();
  assert.match((await get('/manifest.json')).headers.get('content-type'), /json/);
  for (const icon of mf.icons) {
    const r = await get('/' + icon.src);
    assert.equal(r.status, 200, `icon ${icon.src}`);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.match(icon.sizes, /^\d+x\d+$/, `sizes 必須是真實尺寸而非 data: URI 佔位（${icon.sizes}）`);
  }
  assert.ok(mf.icons.some((i) => i.purpose === 'maskable'), '缺 maskable 圖示 → Android 圓形遮版會切掉內容');
});

test('sw.js 已被 build 戳過版本，不留 __BUILD__', async () => {
  const src = await (await get('/sw.js')).text();
  assert.ok(!src.includes('__BUILD__'), 'sw.js 仍含 __BUILD__ → cache key 固定，改版不會生效');
  assert.match(src, /const VERSION = '[^']+'/);
  assert.match(src, /navigator\.serviceWorker|self\.addEventListener\('install'/);
});

test("JS 裡 \$('id') 用到的節點必須都存在于 index.html（防接錯線）", () => {
  const html = readFileSync(join(DIR, 'index.html'), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]));
  const jsFiles = ['js/app.js', 'js/ui.js', 'js/backup.js', 'js/animations.js', 'js/game-engine.js']
    .filter((f) => existsSync(join(DIR, f)));
  const missing = [];
  for (const f of jsFiles) {
    const src = readFileSync(join(DIR, f), 'utf8');
    for (const m of src.matchAll(/\$\('([a-zA-Z0-9_-]+)'\)/g)) {
      if (!ids.has(m[1])) missing.push(`${f} → #${m[1]}`);
    }
  }
  // skill-modal 內容是動態渲染的，允許那幾個 id 不在靜態 HTML 裡
  const dynamic = new Set(['skill-video', 'skill-notes', 'skill-save', 'skill-unlock', 'skill-close']);
  const real = missing.filter((s) => !dynamic.has(s.split(' → #')[1]));
  assert.deepEqual(real, [], `HTML 缺這些 id：${real.join(', ')}`);
});

test('沒有殘留的 YOUR_USERNAME 佔位（佈署前必查）', () => {
  const files = ['index.html', 'manifest.json', 'README.md'].filter((f) => existsSync(join(ROOT, f)));
  for (const f of files) assert.ok(!/YOUR_USERNAME(?!\.github\.io\/hs-tracker\/data)/.test(readFileSync(join(ROOT, f), 'utf8')), `${f} 有未替換佔位`);
});
