// gas/src/*.ts 的規格紅線檢查 ＋ 對 gas/dist/Code.gs（rollup 產物）做真語法／完整性覆核。
// 為什麼覆核產物而不是源碼：雲端跑的是 dist/Code.gs，源碼漂亮但打包搖掉了等於线上壞掉（實測過 648 bytes 空殼）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAS = join(ROOT, 'gas');
const SRC = join(GAS, 'src');
const BUNDLE = join(GAS, 'dist', 'Code.gs');
const files = readdirSync(SRC).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts') && f !== 'index.ts');
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(SRC, f), 'utf8')]));
const all = Object.values(src).join('\n');
// 註解裡出現 eval() 是文件說明（Utils.gs 寫「禁用 eval()」），斷言前要先剝掉
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const code = Object.values(src).map(strip).join('\n');

test('gas/dist/Code.gs 存在、過 V8 語法檢查，且源碼的每個頂層函式都在（打包不會搖掉入口）', () => {
  assert.ok(existsSync(BUNDLE), '缺 gas/dist/Code.gs → 先 npm run gas:build（pretest 會跑）');
  const bundle = readFileSync(BUNDLE, 'utf8');
  const dir = mkdtempSync(join(tmpdir(), 'gscheck-'));
  const p = join(dir, 'Code.js');
  writeFileSync(p, bundle);
  try { execFileSync(process.execPath, ['--check', p], { encoding: 'utf8' }); }
  catch (e) { assert.fail(`打包產物語法錯誤：${e.stderr || e.message}`); }
  const srcFns = new Set();
  for (const f of files) for (const m of src[f].matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) srcFns.add(m[1]);
  const missing = [...srcFns].filter((n) => !new RegExp('^function ' + n + '\\s*\\(', 'm').test(bundle));
  assert.deepEqual(missing, [], `產物缺這些函式：${missing.join(', ')}（被 tree-shake 或被 rollup 改名）`);
  assert.ok(!/\$\d+\b/.test(bundle.match(/^function\s+\w+\$\d+/m) || ''), '產物出現 xxx_$1 → 各檔被當成獨立模組，跨檔呼叫會掛');
});

test('沒有重複定義的 function（重複會讓 push 整個失敗）', () => {
  const seen = new Map();
  for (const f of files) {
    for (const m of src[f].matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) {
      assert.ok(!seen.has(m[1]), `${m[1]} 同時定義在 ${seen.get(m[1])} 與 ${f}`);
      seen.set(m[1], f);
    }
  }
  for (const need of ['doGet', 'doPost', 'pushRows_', 'pullRows_', 'getConfig_', 'ensureSheets_', 'bootstrapSecret_']) {
    assert.ok(seen.has(need), `缺少 ${need}()`);
  }
});

test('紅線：不靠 subpath 路由（e.pathInfo 在「任何人」部署下會被導向登入頁）', () => {
  assert.ok(!/pathInfo/.test(all), 'GAS 內不得使用 e.pathInfo');
  assert.ok(/doGet|doPost/.test(all));
});

test('紅線：密鑰一定要比對，且比對用常數時間；未設定密鑰時拒絕服務', () => {
  assert.match(src['code.ts'], /getProperty\('SHARED_SECRET'\)/);
  assert.match(src['code.ts'], /safeEqual_\(/);
  assert.match(src['utils.ts'], /function safeEqual_/);
  assert.match(src['code.ts'], /secret-not-configured/);
  assert.match(src['code.ts'], /unauthorized/);
});

test('紅線：不得把 spreadsheet URL / id 回傳給前端', () => {
  assert.ok(!/getUrl\(\)/.test(all), '不准 getUrl()');
  assert.ok(!/spreadsheetUrl/.test(all));
  // id 只能存在 Properties，且回應物件裡不能出現
  const resp = /return jsonOut_\(\{[\s\S]*?\}\);/.exec(src['code.ts']);
  assert.ok(!resp || !/SHEET_ID|spreadsheet/.test(resp[0]), '回應內容含表格識別碼');
});

test('紅線：回傳一律走 ContentService + JSON mimetype，且註明要跟隨 302', () => {
  assert.match(src['code.ts'], /ContentService\.createTextOutput\(JSON\.stringify/);
  assert.match(src['code.ts'], /MimeType\.JSON/);
  assert.match(src['code.ts'], /googleusercontent/);
});

test('快取：CacheService TTL 不超過 21600 秒（規格原寫的 24h 做不到）', () => {
  const ttl = [...all.matchAll(/(\d+)\s*\)?;?\s*\/\/.*TTL|CACHE_TTL\s*=\s*(\d+)/g)].map((m) => Number(m[1] || m[2])).filter(Boolean);
  assert.ok(ttl.length, '找不到快取 TTL 設定');
  for (const t of new Set(ttl)) assert.ok(t <= 21600, `TTL ${t}s 超過 CacheService 上限 21600s`);
  assert.match(src['config.ts'], /getScriptCache\(\)/);
  // 快取之外要有可長存的備援（PropertiesService）
  assert.match(src['config.ts'], /getScriptProperties\(\)/);
});

test('單次寫入有上限，避免 6 分鐘執行逾時與配額被打爆', () => {
  assert.match(src['sheets.ts'], /MAX_ROWS_PER_CALL\s*=\s*(\d+)/);
  const m = /MAX_ROWS_PER_CALL\s*=\s*(\d+)/.exec(src['sheets.ts']);
  assert.ok(Number(m[1]) <= 1000, `單次 ${m[1]} 列過大`);
  assert.match(src['sheets.ts'], /truncated/);
});

test('Sheets 結構：三個表 + 表頭冪等建立', () => {
  assert.match(src['sheets.ts'], /Changes/); assert.match(src['sheets.ts'], /Backups/); assert.match(src['sheets.ts'], /Meta/);
  assert.match(src['sheets.ts'], /setFrozenRows\(1\)/);
  assert.match(src['sheets.ts'], /appendRow|setValues/);
  assert.match(src['sheets.ts'], /JSON\.parse/);
  assert.ok(!/\beval\s*\(/.test(code), 'GAS 不准 eval（代碼層面）');
  assert.ok(!/new Function\s*\(/.test(code), 'GAS 不准 new Function');
});

test('appsscript.json：V8、最小權限、Web App 設定齊備', () => {
  const m = JSON.parse(readFileSync(join(GAS, 'appsscript.json'), 'utf8'));
  assert.equal(m.runtimeVersion, 'V8');
  assert.equal(m.exceptionLogging, 'STACKDRIVER');
  assert.equal(m.webapp.access, 'ANYONE_ANONYMOUS');
  assert.equal(m.webapp.executeAs, 'USER_DEPLOYING');
  // 依六帽裁定的實測教訓：oauthScopes 一旦寫死就蓋掉 Apps Script 的自動推斷，
  // 代碼換服務時就會出現「You do not have permission to call SpreadsheetApp.create」這種難查的 500。
  // → 不宣告，交給 Google 自動推（使用者明示的政策）。
  assert.ok(!('oauthScopes' in m) || !m.oauthScopes.length, 'appsscript.json 不該硬寫 oauthScopes（會蓋掉自動推斷）');
});

test('雲端有「人能按」的 public 入口（底線結尾的函式不會出現在 Run 選單）', () => {
  const bundle = existsSync(BUNDLE) ? readFileSync(BUNDLE, 'utf8') : '';
  assert.match(bundle, /^function setupDatabase\(\)\s*\{/m, 'gas/dist/Code.gs 缺 public 的 setupDatabase()（人工建表入口）');
  assert.match(bundle, /^function runDoctor\(\)\s*\{/m, '缺 public 的 runDoctor()');
  const setup = /function setupDatabase\(\)[\s\S]*?\n}/.exec(bundle)?.[0] || '';
  assert.ok(!/bootstrapSecret_|SHARED_SECRET'\)\.setProperty|setProperty\('SHARED_SECRET'/.test(setup), 'setupDatabase 不准碰密鑰（會讓 App 貼好的 secret 失效）');
  assert.match(setup, /ensureSheets_\(/, 'setupDatabase 必須走同一套 ensureSheets_（冪等建表），不是另刻一份');
});
