#!/usr/bin/env node
// scripts/check.mjs — 上線前靜態閉環檢查（不用瀏覽器也能抓出「檔名打錯」這種致命低级錯）
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const pass = [], warn = [], fail = [];
const T = (cond, okMsg, failMsg, level = 'fail') => (cond ? pass : level === 'warn' ? warn : fail).push(cond ? okMsg : failMsg);

const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);

// 1) index.html 引用的每個本地資源都要存在
const html = read('index.html');
const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]).filter((u) => !/^(https?:|data:|mailto:)/.test(u));
for (const a of assets) T(existsSync(join(ROOT, a)) || existsSync(join(ROOT, 'build', a)), `index.html → ${a}`, `index.html 引用的 ${a} 不存在（也不是 rollup 產物 build/${a}）`);

// 2) 前端不得有外部 CDN / fonts（離線優先的硬條件）
//    先剝掉註解再掃：註解裡「提到 cdnjs」是文件說明，不是依賴。
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"\`])\/\/[^\n]*/g, '$1');
const frontFiles = ['index.html', 'manifest.json', ...walk('src'), ...walk('css')];
const cdnHits = frontFiles.filter((f) => /https?:\/\/(cdnjs|cdn\.jsdelivr|unpkg|fonts\.googleapis|ajax\.googleapis)\./i.test(stripComments(read(f))));
T(!cdnHits.length, '前端零外部 CDN（剝註解後掃描）', `發現外部 CDN 依賴：${cdnHits.join(', ')}`);

// 3) SW 必須被註冊（原規格全文 grep serviceWorker = 0 → 離線/安裝性全廢）
T(/navigator\.serviceWorker\.register\(/.test(read('src/app.ts')), 'app.js 有 serviceWorker.register()', '找不到 SW 註冊：離線與 PWA 安裝性都會失效');

// 4) PRECACHE 的每一項都要存在（少一個檔 → cache.addAll 整批 reject → SW 永遠 install 失敗）
const sw = read('src/sw.ts');
const precache = [...sw.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
const ghosts = precache.filter((p) => !existsSync(join(ROOT, p)) && !existsSync(join(ROOT, 'build', p)));
T(!ghosts.length, `PRECACHE ${precache.length} 項全部存在`, `PRECACHE 列了不存在的檔：${ghosts.join(', ')}（會讓 SW install 失敗）`);
// sw.js 自己不能進 PRECACHE（會鎖死更新），所以排除
const shellAssets = ['app.js', 'css/style.css', 'index.html', 'manifest.json', 'vendor/sql-wasm.js', 'vendor/sql-wasm.wasm'];
const notCached = shellAssets.filter((f) => !precache.includes(f));
T(!notCached.length, 'shell 全數進 PRECACHE', `未 pre-cache（會走 runtime cache）：${notCached.join(', ')}`, 'warn');
T(/'__BUILD__'/.test(sw) && /hs-tracker-\$\{VERSION\}/.test(sw), 'sw.js 以 __BUILD__ 佔位、由 build 注入 cache key', 'sw.js 快取代碼未參數化（改版會卡舊殼，todo 1.8）');

// 5) GAS：函式不可重複定義（重複定義 clasp push 會直接失敗）
const gsFiles = readdirSync(join(ROOT, 'gas', 'src')).filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'));
const defs = {};
for (const f of gsFiles) for (const m of read('gas/src/' + f).matchAll(/^function ([A-Za-z_$][\w$]*)\s*\(/gm)) (defs[m[1]] = defs[m[1]] || []).push(f);
const dup = Object.entries(defs).filter(([, v]) => v.length > 1);
T(!dup.length, `GAS ${Object.keys(defs).length} 個頂層函式、無重複`, `GAS 重複函式：${dup.map(([k, v]) => `${k}@${v.join('+')}`).join(', ')}`);

// 6) GAS 紅線：不回傳表格 URL、不用 subpath 路由、不 eval、密鑰要比對
const gsAll = gsFiles.map((f) => read('gas/src/' + f)).join('\n');
T(!/getUrl\(\)/.test(gsAll), 'GAS 不外洩 spreadsheet URL', 'GAS 回傳了 spreadsheet URL（todo 2.5 要求移除）');
T(!/pathInfo/.test(gsAll), 'GAS 不用 e.pathInfo 路由', 'GAS 使用 pathInfo：「任何人」部署下會被導向登入頁');
const srcAll = stripComments(gsAll) + frontFiles.map((f) => stripComments(read(f))).join('');
T(!/\beval\(|new Function\(/.test(srcAll), '前後端無 eval()/new Function()（註解不計）', '出現 eval/new Function（規格實作註記 4 禁止）');
T(/safeEqual_/.test(gsAll) && /SHARED_SECRET/.test(gsAll), 'GAS 有密鑰比對（常數時間）', 'GAS 端點無鉴權（公開可寫入你的表）');
T(/ContentService\.createTextOutput\(JSON\.stringify/.test(gsAll), 'ContentService + JSON 輸出', 'GAS 未用 ContentService JSON 輸出');

// 6b) 部署时序：bootstrap 路由必须在「密鑰閘門」之前，否則首次初始化永遠進不去（上輪實測踩過）
{
  const code = stripComments(read('gas/src/code.ts'));
  const boot = code.indexOf("=== 'bootstrap'");
  const gate = code.indexOf("secret-not-configured");
  T(boot > -1 && gate > -1 && boot < gate, 'GAS：bootstrap 通道在密鑰閘門之前（首次初始化才走得通）',
    'GAS：bootstrap 被密鑰閘門擋死 — 沒密鑰時無法初始化，有密鑰時不需要它');
}

// 7) 客戶端：同步失敗不得被吞（原規格 silently return 是最大數據風險）
const sm = read('src/sync-manager.ts');
T(/status:\s*'error'/.test(sm) && /lastError/.test(sm), '同步失敗會顯式進入 error 狀態並帶原因', '同步錯誤被吞掉（會假裝已同步）');
T(/'no-url'/.test(sm), '未設定 URL 回報 disabled/no-url 而非成功', '未設定 URL 時被當成同步成功');
const gp = read('src/gas-proxy.ts');
T(/text\/plain;charset=utf-8/.test(gp), 'POST 用 text/plain（規避 preflight）', 'GAS POST 不是簡單請求，會被 preflight 擋');
T(/redirect:\s*'follow'/.test(gp), 'fetch 跟隨 302（ContentService 會轉 googleusercontent）', '未 follow redirect → 拿到空回應');
T(!/mode:\s*'no-cors'/.test(gp), '未使用 no-cors（否則讀不到回應）', '用了 no-cors：回應是 opaque，前端無法解析');

// 8) schema：遷移版本 + 徽章需要 updated_at 才能 LWW
const dbSrc = read('src/db.ts');
T(/PRAGMA user_version/.test(dbSrc), 'schema 帶 user_version 遷移', '無 schema 遷移：加欄位會讓老使用者開不起來');
const badgesBlock = /CREATE TABLE IF NOT EXISTS badges \(([\s\S]*?)\);/.exec(dbSrc)?.[1] || '';
T(/updated_at/.test(badgesBlock), 'badges 表有 updated_at', 'badges 缺 updated_at（衝突解決無依據）');
T(/flushNow/.test(dbSrc) && /pagehide/.test(dbSrc), '落盤有 pagehide/visibilitychange 兜底', '只有 debounce，鎖屏會掉最後幾筆');

// 9) manifest / icons（Chrome 安裝性：192+512 實體圖示 + 已註冊 SW）
const mf = JSON.parse(read('manifest.json'));
const badIcons = (mf.icons || []).filter((i) => i.src.startsWith('data:') || !existsSync(join(ROOT, i.src)));
T(!badIcons.length, `manifest icons 皆實體檔（${(mf.icons || []).length} 個）`, `icons 有問題：${badIcons.map((i) => i.src.slice(0, 20)).join(', ')}`);
T(/192x192/.test(read('manifest.json')) && /512x512/.test(read('manifest.json')), 'icons 含 192 與 512', '缺 192/512 → Chrome 不自動提示安裝');
T(/apple-touch-icon/.test(html), 'index.html 有 apple-touch-icon（iOS 主畫面圖示）', '缺 apple-touch-icon → iOS 主畫面只有截圖');
for (const k of ['start_url', 'scope', 'display']) T(!!mf[k], `manifest.${k}=${mf[k]}`, `manifest.${k} 缺失`);
T(mf.display !== 'browser', `manifest.display=${mf.display}（可安裝）`, 'display 為 browser → 不具安裝性');

// 10) .nojekyll（避免 Pages 用 Jekyll 處理 data/*.json 與底線檔）
T(existsSync(join(ROOT, '.nojekyll')), '已放 .nojekyll', '缺 .nojekyll：Pages 會走 Jekyll 前置處理');

// 11) 體積（Pages 1GB soft）
let bytes = 0;
for (const f of [...frontFiles, 'vendor/sql-wasm.wasm', 'vendor/sql-wasm.js', ...walk('icons'), ...walk('data')]) {
  if (existsSync(join(ROOT, f))) bytes += statSync(join(ROOT, f)).size;
}
pass.push(`前端整站 ${(bytes / 1024).toFixed(0)}KB（1GB soft 上限的 ${(bytes / 1e9 * 100).toFixed(2)}%）`);

// 12) 顯隱機制：markup 用 hidden 屬性，JS 就只能用 el.hidden（上一輪首開卡死就是混用两套）
{
  const jsFiles = readdirSync(join(ROOT, 'src')).filter((f) => f.endsWith('.ts'));
  const mixing = jsFiles.filter((f) => /classList\s*\.\s*(add|remove|toggle)\(\s*['"]hidden['"]/.test(read('src/' + f)));
  T(mixing.length === 0, '顯隱只用 hidden 屬性（無 classList 切 .hidden）', `混用顯隱機制：${mixing.join(', ')} — classList 對 hidden 屬性無效，畫面會永遠藏著`);
  const css = read('css/style.css');
  T(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(css), 'CSS 有 [hidden]{display:none!important}', 'CSS 少了 [hidden] 規則：hidden 屬性變成裝飾');
  T(/\.hidden\s*=\s*(true|false)/.test(jsFiles.map((f) => read('src/' + f)).join('\n')), 'JS 用 el.hidden = true/false 切換', 'JS 沒用 el.hidden 屬性切換顯隱');
  const html = read('index.html');
  const hiddenEls = [...html.matchAll(/<\w+\b[^>]*\bid="([^"]+)"[^>]*\shidden(?:\s|>)/g)].map((m) => m[1]);
  T(hiddenEls.length >= 4, `markup 以 hidden 屬性初始藏起 ${hiddenEls.length} 個容器`, '首開要藏起來的容器沒用 hidden 屬性（會閃現未完成畫面）');
}

// 13) 軟刪除一致性：統計/列表查詢必須過濾 deleted（用行擷取，避免吃到隔壁函式）
{
  const dl = read('src/data-layer.ts').split('\n');
  const fnBody = (name) => {
    const i = dl.findIndex((l) => l.includes(name + '('));
    if (i < 0) return null;
    let out = '';
    for (let j = i; j < dl.length; j++) {
      out += dl[j] + '\n';
      if (/\}\s*[,;]?\s*$/.test(dl[j])) break;
    }
    return out;
  };
  for (const fn of ['getTotalWorkoutsCompleted', 'getRecentWorkouts', 'getWorkoutStreak', 'getWorkoutLog']) {
    const body = fnBody(fn);
    if (body === null) { T(false, '', `data-layer 找不到 ${fn}()`); continue; }
    const usesLogs = /workout_logs/.test(body);
    const needsFilter = ['getTotalWorkoutsCompleted', 'getRecentWorkouts', 'getWorkoutStreak'].includes(fn);
    T(!usesLogs || !needsFilter || /deleted\s*=\s*0/.test(body),
      `${fn}() 已過濾軟刪除列`,
      `${fn}() 查了 workout_logs 卻沒帶 deleted = 0 → 已刪紀錄還被算進統計/列表`);
  }
}

// 13b) appsscript.json 的 Web App 區塊：鍵名必須是小寫 webapp，且值要對
{
  const m = JSON.parse(read('gas/appsscript.json'));
  T(!('webApp' in m), 'appsscript.json 用 Google 認得的鍵名（webapp，不是 webApp）', '寫成 webApp 會被 Google 擋：push 報 unknown fields: [webApp]');
  T(m.webapp && m.webapp.access === 'ANYONE_ANONYMOUS' && m.webapp.executeAs === 'USER_DEPLOYING',
    'webapp 區塊：ANYONE_ANONYMOUS + USER_DEPLOYING', 'webapp 區塊不對 → 前端 POST /exec 會拿到 403 Access Denied');
  // 硬寫 oauthScopes 會蓋掉 Apps Script 的自動推斷：代碼加了新服務時，
  // 缺的 scope 永遠補不回來（實測 SpreadsheetApp.create 回「You do not have permission…Required permissions」）
  T(!('oauthScopes' in m) || !(m.oauthScopes || []).length, 'GAS 不硬寫 oauthScopes（交給 Google 自動推）',
    `appsscript.json 寫死了 ${JSON.stringify(m.oauthScopes)} → 自動推斷被蓋掉，換代碼時必炸`);
  T(m.runtimeVersion === 'V8', 'GAS runtimeVersion = V8', '沒指定 V8（會走 Rhino，crypto/Promise 行為不同）');
}

// 14) 同步佇列要排乾（雲端單次 500 列、本地單次 200 列）
{
  const sm = read('src/sync-manager.ts');
  T(/_pushRounds\(/.test(sm) && /_pushOnce\(/.test(sm), 'push 連續多輪直到佇列清空', 'push 只推一輪：大佇列會被當成「已同步」');
  T(/status:\s*report\.rejected \? 'error' : report\.truncated \? 'partial' : 'ok'/.test(sm), '同步狀態分級 ok/partial/error', '同步狀態只有成功/失敗，殘留佇列會被藏起來');
  T(/partial:/.test(read('src/ui.ts')), 'UI 有 partial 標籤', 'UI 沒接 partial 狀態 → 使用者看到的是「檢查中」');
}

// 17) TS + Rollup 管線：源碼是 .ts，雲端/網頁只吃打包產物（任何一环缺了都會部署出一個空殼）
{
  const pkg = JSON.parse(read('package.json'));
  const need = { 'rollup.config.mjs': '前端', 'rollup.gas.config.mjs': 'GAS' };
  for (const [f] of Object.entries(need)) T(existsSync(join(ROOT, f)), `建置設定 ${f} 存在`, `缺 ${f} → src/*.ts 沒有人打包`);
  T(/"build":[^\n]*rollup -c && node scripts\/build\.mjs/.test(read('package.json')), 'npm run build 先 rollup 再組 dist', 'npm run build 沒跑 rollup（dist 會是舊 bundle 或缺 app.js）');
  T(/"gas:build":[^\n]*rollup -c rollup\.gas\.config\.mjs/.test(read('package.json')), 'npm run gas:build 存在', '缺 gas:build → 部署前不會產生 gas/dist/Code.gs');
  T(/"gas:build":[^\n]*tsc -p gas\/tsconfig\.json --noEmit/.test(read('package.json')), 'gas:build 先型別檢查再打包', '沒先 tsc --noEmit → 型別壞了照样打包推雲端（雲端只會回 500）');
  T(/"typecheck":/.test(read('package.json')), 'npm run typecheck 存在', '缺 typecheck（CI 就不會擋型別錯誤）');
  T(/pkg\.devDependencies/.test('') || /typescript/.test(pkg.devDependencies ? Object.keys(pkg.devDependencies).join() : ''), 'devDependencies 有 typescript', 'typescript 沒入 devDependencies → CI 裝不到');

  const clasp = JSON.parse(read('gas/.clasp.json'));
  T(clasp.rootDir === 'dist', 'clasp rootDir = gas/dist（只推產物）', `clasp rootDir=${clasp.rootDir}：會把 .ts 推到雲端（GAS 不認得）`);
  const distFiles = existsSync(join(ROOT, 'gas', 'dist')) ? readdirSync(join(ROOT, 'gas', 'dist')) : [];
  T(distFiles.length > 0, 'gas/dist 已建置（Code.gs + appsscript.json）', 'gas/dist 是空的 → 先 npm run gas:build');
  T(!distFiles.some((f) => f.endsWith('.ts')), 'gas/dist 內沒有 .ts', `雲端會收到 .ts：${distFiles.filter((f) => f.endsWith('.ts')).join(', ')}`);
  if (distFiles.includes('Code.gs')) {
    const bundle = read('gas/dist/Code.gs');
    T(!/^\(function\s*\(\)/m.test(bundle), 'GAS 產物不包 IIFE（頂層函式才是 Apps Script 的入口）', '被包進 IIFE → doGet/doPost 變成模組內-private，雲端會找不到入口');
    for (const fn of ['doGet', 'doPost', 'bootstrapWithToken_', 'doctor_', 'ensureSheets_']) T(new RegExp('^function ' + fn + '\\s*\\(', 'm').test(bundle), `GAS 產物有頂層入口 ${fn}()`, `產物裡找不到 function ${fn}()（被改名或被搖掉了）`);
    T(!/_[A-Za-z0-9]+\$\d+\b/.test(bundle), 'GAS 產物沒有 rollup 改名（xxx_$1）', '出現 xxx_$1 代表各檔被當成獨立模組，跨檔呼叫會 ReferenceError');
    T(!/\bimport\s|\bexport\s/.test(bundle), 'GAS bundle 殘留 import/export', 'bundle 還帶 ESM 語法，Apps Script 會解析失敗');
  }
  T(!/\bjs\/[a-z-]+\.js\b/.test(read('src/sw.ts')), 'sw PRECACHE 不再列舊的多支 <script>', 'PRECACHE 還指著 js/*.js（那些檔已併進 app.js）');
  T((read('index.html').match(/<script src="app\.js"/g) || []).length === 1, 'index.html 只載入一支 app.js', '又回到多支 <script> 相依載入順序的老路');
}

console.log('靜態閉環檢查');
for (const l of pass) console.log('  ✓ ' + l);
for (const l of warn) console.log('  ! ' + l);
for (const l of fail) console.log('  ✗ ' + l);
if (fail.length) { console.error(`\n✗ ${fail.length} 項不合格`); process.exit(1); }
console.log(`\n✓ check：${pass.length} 項通過（${warn.length} 項提醒）`);
