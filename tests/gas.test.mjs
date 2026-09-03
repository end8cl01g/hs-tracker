// gas/*.gs 的檢查：語法（node --check）＋ 規格紅線（密鑰、不回 URL、快取上限、不靠 subpath）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const GAS = join(ROOT, 'gas');
const files = readdirSync(GAS).filter((f) => f.endsWith('.gs'));
const src = Object.fromEntries(files.map((f) => [f, readFileSync(join(GAS, f), 'utf8')]));
const all = Object.values(src).join('\n');
// 註解裡出現 eval() 是文件說明（Utils.gs 寫「禁用 eval()」），斷言前要先剝掉
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
const code = Object.values(src).map(strip).join('\n');

test('每個 .gs 都能通過 V8 語法檢查（Apps Script 跑的就是 V8）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gscheck-'));
  for (const f of files) {
    const p = join(dir, f.replace(/\.gs$/, '.js'));
    writeFileSync(p, src[f]);
    try { execFileSync(process.execPath, ['--check', p], { encoding: 'utf8' }); }
    catch (e) { assert.fail(`${f} 語法錯誤：${e.stderr || e.message}`); }
  }
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
  assert.match(src['Code.gs'], /getProperty\('SHARED_SECRET'\)/);
  assert.match(src['Code.gs'], /safeEqual_\(/);
  assert.match(src['Utils.gs'], /function safeEqual_/);
  assert.match(src['Code.gs'], /secret-not-configured/);
  assert.match(src['Code.gs'], /unauthorized/);
});

test('紅線：不得把 spreadsheet URL / id 回傳給前端', () => {
  assert.ok(!/getUrl\(\)/.test(all), '不准 getUrl()');
  assert.ok(!/spreadsheetUrl/.test(all));
  // id 只能存在 Properties，且回應物件裡不能出現
  const resp = /return jsonOut_\(\{[\s\S]*?\}\);/.exec(src['Code.gs']);
  assert.ok(!resp || !/SHEET_ID|spreadsheet/.test(resp[0]), '回應內容含表格識別碼');
});

test('紅線：回傳一律走 ContentService + JSON mimetype，且註明要跟隨 302', () => {
  assert.match(src['Code.gs'], /ContentService\.createTextOutput\(JSON\.stringify/);
  assert.match(src['Code.gs'], /MimeType\.JSON/);
  assert.match(src['Code.gs'], /googleusercontent/);
});

test('快取：CacheService TTL 不超過 21600 秒（規格原寫的 24h 做不到）', () => {
  const ttl = [...all.matchAll(/(\d+)\s*\)?;?\s*\/\/.*TTL|CACHE_TTL\s*=\s*(\d+)/g)].map((m) => Number(m[1] || m[2])).filter(Boolean);
  assert.ok(ttl.length, '找不到快取 TTL 設定');
  for (const t of new Set(ttl)) assert.ok(t <= 21600, `TTL ${t}s 超過 CacheService 上限 21600s`);
  assert.match(src['Config.gs'], /getScriptCache\(\)/);
  // 快取之外要有可長存的備援（PropertiesService）
  assert.match(src['Config.gs'], /getScriptProperties\(\)/);
});

test('單次寫入有上限，避免 6 分鐘執行逾時與配額被打爆', () => {
  assert.match(src['Sheets.gs'], /MAX_ROWS_PER_CALL\s*=\s*(\d+)/);
  const m = /MAX_ROWS_PER_CALL\s*=\s*(\d+)/.exec(src['Sheets.gs']);
  assert.ok(Number(m[1]) <= 1000, `單次 ${m[1]} 列過大`);
  assert.match(src['Sheets.gs'], /truncated/);
});

test('Sheets 結構：三個表 + 表頭冪等建立', () => {
  assert.match(src['Sheets.gs'], /Changes/); assert.match(src['Sheets.gs'], /Backups/); assert.match(src['Sheets.gs'], /Meta/);
  assert.match(src['Sheets.gs'], /setFrozenRows\(1\)/);
  assert.match(src['Sheets.gs'], /appendRow|setValues/);
  assert.match(src['Sheets.gs'], /JSON\.parse/);
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
