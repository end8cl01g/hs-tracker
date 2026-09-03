#!/usr/bin/env node
// scripts/deploy-gas.mjs — 用 clasp 部署 GAS 後端，含密鑰設定（密鑰由本腳本產生，不依賴回應內容）
//
// 流程：show-authorized-user →（若無）create-script → 寫一次性 Bootstrap.gs(SETUP_TOKEN) → push
//      → create-deployment → 【探針等端點可匿名訪問】→ action=bootstrap（帶我們自己生成的 secret）
//      → 驗 pull/setup → 刪 Bootstrap.gs 再 push（關掉設定通道）→ 印出要貼進 App 的 URL 與密鑰
//
// 踩過的三個坑（都有對應防護）：
//  1) 非 TTY 下 `clasp push` 對 appsscript.json 要互動確認 → 印 "Skipping push." 一檔不推 ⇒ 一律 --force 並驗輸出
//  2) Apps Script REST 沒有 web app access 欄位 ⇒ 匿名 403 時停在「編輯器點一次」，再 --resume
//  3) Google 偶爾把第一個請求的回覆換成 HTML 頁 ⇒ 密鑰由本端產生，回應不見也能重試／復原（idempotent）
//
// 用法：
//   node scripts/deploy-gas.mjs                      # 預覽（不碰帳號）
//   node scripts/deploy-gas.mjs --yes                # 完整部署
//   node scripts/deploy-gas.mjs --yes --resume       # 你在編輯器開了 Anyone 權限後接續
//   node scripts/deploy-gas.mjs --yes --destroy      # 刪掉建立的 Apps Script 專案
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const GAS = join(ROOT, 'gas');
const GAS_DIST = join(GAS, 'dist');            // clasp 的 rootDir：源碼是 gas/src/*.ts，雲端只吃打包產物
const BOOTSTRAP = join(GAS_DIST, 'Bootstrap.gs');  // 一次性通道檔（用畢即刪；放 dist 才會被 push）
const OUT = join(ROOT, '.deploy');
const AUTH = [process.env.clasp_config_auth, process.env.CLASP_AUTH, '/home/user/.cache/clasp/.clasprc.json', '/tmp/clasp/.clasprc.json']
  .find((p) => p && existsSync(p)) || '/home/user/.cache/clasp/.clasprc.json';
const TITLE = process.env.GAS_TITLE || 'HS Tracker Backend';
const YES = process.argv.includes('--yes');
const RESUME = process.argv.includes('--resume');
const DESTROY = process.argv.includes('--destroy');
process.env.clasp_config_auth = AUTH;

// clasp 常不在 PATH（全域 npm 目錄不可寫）→ 依序找本地安裝處
const CLASP_BIN = process.env.CLASP_BIN || ['/home/user/.cache/clasp-tools/node_modules/.bin/clasp', '/tmp/clasp-tools/node_modules/.bin/clasp'].find((p) => existsSync(p)) || 'clasp';

const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', cwd: opts.cwd || GAS, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.trim();
    if (opts.tolerate) return out;
    throw new Error(`${cmd} ${args.join(' ')} 失敗：${out || e.message}`);
  }
}
const clasp = (args, opts = {}) => run(CLASP_BIN, ['-A', AUTH, ...args], { cwd: GAS, ...opts });

// clasp 3.4.1：覆蓋 appsscript.json 需要互動確認，非 TTY 會回「Skipping push.」而不推任何檔
function push() {
  const out = clasp(['push', '--force']).trim();
  if (/Skipping push/.test(out) || !/Pushed (one file|\d+ files)/.test(out)) {
    throw new Error('clasp push 沒推任何檔案（雲端仍是舊碼），輸出：' + JSON.stringify(out));
  }
  return out.split('\n').filter((l) => /^Pushed|appsscript/.test(l)).join(' / ') || out.split('\n').slice(-1)[0];
}

function readClaspJson() {
  const p = join(GAS, '.clasp.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

// Apps Script 部署清單最新一版（含 deploymentId）
export function parseDeploymentId(text) {
  const t = String(text || '');
  const labeled = t.match(/deployment\s*id"?\s*[:=]\s*"?([A-Za-z0-9_-]{10,})"?/i);
  if (labeled) return labeled[1];
  const bare = t.match(/\b([A-Za-z0-9_-]{20,})\b(?!\.)/);   // 例：AKfy3fQp3zKpQnGvHN3dTVNfJmLXQYnZqOg
  return bare ? bare[1] : null;
}

async function postJson(execUrl, body) {
  try {
    const res = await fetch(execUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // 簡單請求，避 preflight
      body: JSON.stringify(body),
      redirect: 'follow',
      credentials: 'omit',
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* Google 偶爾先給 HTML 頁 */ }
    return { status: res.status, ok: res.ok, json, text };
  } catch (e) {
    return { status: 0, ok: false, json: null, text: e.message };
  }
}

const readLocalToken = () => {
  const p = BOOTSTRAP;
  if (!existsSync(p)) return null;
  const m = readFileSync(p, 'utf8').match(/SETUP_TOKEN = "([^"]+)"/);
  return m ? m[1] : null;
};

/** 等端點能用（冷啟動/剛改權限時會 403、404 或吐 HTML）；回傳最後一次 ping 結果 */
async function waitUntilReachable(execUrl, tries = 60) {
  for (let i = 0; i < tries; i++) {
    const p = await postJson(execUrl, { action: 'ping', device_id: 'probe' });
    if (p.json) return p;
    if (i % 6 === 0) log(`  探針 ${i + 1}/${tries}：HTTP ${p.status} ${p.json ? '' : '（非 JSON 回應）'}`);
    await sleep(5000);
  }
  return null;
}

function manualAccessSteps(execUrl) {
  log('\n⚠ Apps Script REST（v1 projects.deployments）的 DeploymentConfig 只有');
  log('  {description, scriptId, manifestFileName, versionNumber}——**沒有 access 欄位**；');
  log('  clasp create-deployment 建出來的部署預設「只有自己」，匿名 POST 會拿到 HTTP 403。');
  log('  （appsscript.json 的 webapp.access 必須是小寫 webapp，寫成 webApp 會被 Google 擋。）');
  log('\n  這一步只能你在瀏覽器點，約 20 秒：');
  log('    1) 開 https://script.google.com/d/' + (readClaspJson()?.scriptId || '<scriptId>') + '/edit');
  log('    2) 右上 Deploy ▸ Manage deployments ▸ ⋮ ▸ Edit（或 New deployment ▸ Web app）');
  log('    3) Execute as: **Me**；Who has access: **Anyone**');
  log('    4) Deploy（URL 不變：' + execUrl + '）');
  log('\n  做完再跑：node scripts/deploy-gas.mjs --yes --resume');
}

/**
 * bootstrap：密鑰由我們產生並送過去（回應被 Google 吃掉也能重試），
 * 送完改用 ping/pull 驗證，不靠那一次回應的成敗。
 */
async function bootstrapAndVerify(execUrl, token, secret) {
  let r = null;
  let lastVerify = null;
  for (let i = 0; i < 6; i++) {
    r = await postJson(execUrl, { action: 'bootstrap', setup_token: token, secret, force: true });
    if (r.json?.ok || r.json?.error === 'already-initialized' || r.json?.error === 'bad-setup-token') break;
    log(`  bootstrap 第 ${i + 1} 次：HTTP ${r.status} ${r.json?.error || '（非 JSON 回應，稍後以 pull 覆核）'}`);
    await sleep(4000);
  }
  if (r.json?.error === 'bad-setup-token') throw new Error('雲端認得舊 SETUP_TOKEN 與本地不同 → 先 node scripts/deploy-gas.mjs --yes 重推');
  // 覆核：密鑰真的能用嗎？
  for (let i = 0; i < 30; i++) {
    const pull = await postJson(execUrl, { action: 'pull', device_id: 'deploy-probe', secret, since: null });
    if (pull.json?.ok) return { verified: true, sheetsReady: r.json?.sheets_ready !== false, via: i + 1 };
    lastVerify = pull;
    // 範圍沒核准時重試一百次也不會好——直接認出來，告訴人要點哪裡
    if (/do not have permission|Authorization is required|Required permissions/i.test(String(pull.json?.detail || pull.text || ''))) break;
    await sleep(2000);
  }
  const detail = JSON.stringify(lastVerify?.json?.detail || lastVerify?.text || '').slice(0, 200);
  if (/do not have permission|Authorization is required|Required permissions/i.test(detail)) {
    throw new Error([
      '雲端要一次「首次執行核准」：appsscript.json 已不宣告 oauthScopes（交給 Google 自動推），但新推斷出來的 scope 仍要本人核准一次，headless 做不了。',
      '  1) 開 https://script.google.com/d/' + (readClaspJson()?.scriptId || '<scriptId>') + '/edit',
      '  2) 上方選單 Run（執行）▸ 函式選 doctor_ ▸ Run（執行）',
      '  3) 跳出 "Authorization required" ▸ Review Permissions ▸ 選帳號 ▸ Advanced ▸ Go to ... (unsafe) ▸ Allow',
      '  4) 回來重跑同一條命令即可（bootstrap 帶 force，重複執行是安全的）',
      '  錯誤原文：' + detail,
    ].join('\n'));
  }
  throw new Error('bootstrap 送出了，但用該密鑰 pull 仍失敗：' + detail);
}

/** 用 clasp 的憑證換一個 short-lived access token（不依賴 clasp 內部實作）。 */
async function mintAccessToken() {
  const c = JSON.parse(readFileSync(AUTH, 'utf8')).tokens.default;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }),
  });
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) throw new Error('換 access token 失敗：' + JSON.stringify(j).slice(0, 200));
  return j.access_token;
}

/** clasp push 只「新增／更新」，不會刪除本機已移除的檔案——
 *  所以要把雲端某个檔案真的拿掉（例如關閉一次性通道）必須走 content API 覆寫整份檔案清單。
 *  實測：rm Bootstrap.gs + push 之後 bootstrap 仍回 bad-setup-token（舊檔案還在），必須這裡補一刀。 */
async function deleteCloudFiles(scriptId, names) {
  const tok = await mintAccessToken();
  const via = (path, init = {}) => fetch(`https://script.googleapis.com/v1/projects/${scriptId}${path}`, {
    ...init, headers: { Authorization: `Bearer ${tok}`, 'content-type': 'application/json' },
  });
  const cur = await (await via('/content')).json();
  const drop = new Set(names);
  const keep = (cur.files || []).filter((f) => !drop.has(f.name.replace(/\.gs$/, '')));
  if (keep.length === (cur.files || []).length) return { removed: [], total: (cur.files || []).length };
  const res = await via('/content', { method: 'PUT', body: JSON.stringify({ files: keep.map((f) => ({ name: f.name, source: f.source, type: f.type })) }) });
  if (!res.ok) throw new Error('覆寫雲端檔案清單失敗 HTTP ' + res.status + ' ' + (await res.text()).slice(0, 160));
  return { removed: (cur.files || []).map((f) => f.name).filter((n) => drop.has(n.replace(/\.gs$/, ''))), total: keep.length };
}

function saveState(extra) {
  mkdirSync(OUT, { recursive: true });
  const p = join(OUT, 'gas.json');
  const prev = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  writeFileSync(p, JSON.stringify({ ...prev, ...extra, at: new Date().toISOString() }, null, 2) + '\n');
  return p;
}

/** 沙箱重啟會清空 /tmp 與 /home/user/.cache（兩者都不進快照）→ 憑證與本地裝的 clasp 都會消失。
 *  少了這層預檢查，報錯會是難懂的 `spawnSync clasp ENOENT`。 */
function preflight() {
  const missing = [];
  if (CLASP_BIN !== 'clasp' ? !existsSync(CLASP_BIN) : !whichClasp()) missing.push(`clasp 找不到（試過：${CLASP_BIN}）`);
  if (!existsSync(AUTH)) missing.push(`憑證檔不存在：${AUTH}`);
  if (!missing.length) return;
  throw new Error([
    ...missing,
    '  → 裝：mkdir -p /home/user/.cache/clasp-tools && cd /home/user/.cache/clasp-tools && npm i @google/clasp',
    '  → 憑證：把 .clasprc.json 內容寫進 /home/user/.cache/clasp/.clasprc.json（0600，不進 repo、不進快照，重啟即蒸发）',
    '  → 或直接指定：CLASP_BIN=/路徑/clasp CLASP_AUTH=/路徑/.clasprc.json node scripts/deploy-gas.mjs --yes',
  ].join('\n'));
}

function whichClasp() {
  try { execFileSync('clasp', ['--version'], { stdio: 'ignore' }); return true; } catch { return false; }
}

async function main() {
  if (YES) preflight();
  if (!YES) {
    log('這是**會改動你 Google 帳號**的部署（建 Apps Script 專案、公開 Web App 端點）。');
    log('預覽模式，未做任何變更。要執行請加 --yes。\n');
    log('將執行（依序）：');
    [
      `clasp show-authorized-user（憑證：${AUTH}）`,
      `clasp create-script --title "${TITLE}"（在 gas/ 內執行；已有 .clasp.json 就沿用）`,
      '寫入 gas/dist/Bootstrap.gs（一次性 SETUP_TOKEN；gas/dist 已 gitignore、不進 public repo）',
      'clasp push --force（並驗證輸出，避免「Skipping push.」空推）',
      'clasp create-deployment → 匿名探針（403 時停在編輯器那一步，之後 --resume）',
      'action=bootstrap：密鑰由本腳本產生後送過去（回應被吃掉也能復原），再用 pull 覆核',
      '必要時 action=setup 補建 Changes/Backups/Meta 工作表',
      '刪除 gas/dist/Bootstrap.gs → 重新 gas:build → push → content API 移除雲端舊檔 → 發新版本，最後驗證 bootstrap 已被拒',
      `寫 .deploy/gas.json（exec URL + 密鑰；此目錄已 gitignore）`,
    ].forEach((l) => log('  · ' + l));
    log('\n反悔：node scripts/deploy-gas.mjs --yes --destroy');
    return;
  }

  log('→ 授權確認');
  const who = clasp(['show-authorized-user']).trim();
  log('  ' + who.split('\n')[0]);
  if (/Not logged in/.test(who)) throw new Error('clasp 未授權（憑證檔：' + AUTH + '）');

  if (DESTROY) {
    const cfg = readClaspJson();
    if (!cfg) throw new Error('找不到 gas/.clasp.json，無可刪除');
    log('→ 刪除 Apps Script 專案 ' + cfg.scriptId);
    log('  ' + clasp(['delete-script', cfg.scriptId, '--force']).trim());
    rmSync(join(GAS, '.clasp.json'), { force: true });
    rmSync(BOOTSTRAP, { force: true });
    rmSync(join(OUT, 'gas.json'), { force: true });
    log('✓ 已刪除（Drive 裡殘留的「HS Tracker …」工作表請手動移除）');
    return;
  }

  const token = readLocalToken() || randomBytes(18).toString('base64url');
  mkdirSync(GAS_DIST, { recursive: true });
  writeFileSync(BOOTSTRAP, `// 一次性安裝用；部署完成即被刪除，且不進 git、不進 public repo\n// 源碼是 gas/src/*.ts，雲端只吃 gas/dist/Code.gs，所以這個檔放 dist（clasp rootDir）\nconst SETUP_TOKEN = ${JSON.stringify(token)};\n`);
  const secret = randomBytes(32).toString('hex');

  let cfg = readClaspJson();
  if (!cfg) {
    log('→ 建立 Apps Script 專案');
    const out = clasp(['create-script', '--title', TITLE, '--type', 'standalone']);
    cfg = readClaspJson();
    if (!cfg?.scriptId) throw new Error('建立後仍讀不到 .clasp.json：' + out);
    log('  scriptId = ' + cfg.scriptId);
  } else {
    log('→ 沿用既有專案 ' + cfg.scriptId);
  }

  log('→ npm run gas:build（gas/src/*.ts → gas/dist/Code.gs）');
  run('npm', ['run', 'gas:build', '--silent'], { cwd: ROOT });
  log('→ clasp push --force（推 gas/dist：Code.gs + appsscript.json' + (existsSync(BOOTSTRAP) ? ' + Bootstrap.gs' : '') + '）');
  log('  ' + push());

  log('→ 建立／更新部署');
  let deploymentId = process.env.DEPLOYMENT_ID || null;
  if (deploymentId) {
    log('  ' + clasp(['create-deployment', '-i', deploymentId, '-d', 'hs-tracker']).trim().split('\n').slice(-1)[0]);
  } else {
    const dep = clasp(['create-deployment', '-d', 'hs-tracker']).trim();
    log('  ' + dep.split('\n').slice(-1)[0]);
    const listed = clasp(['list-deployments', cfg.scriptId]).trim();
    deploymentId = parseDeploymentId(dep) || parseDeploymentId(listed);
    if (!deploymentId) throw new Error('無法從 clasp 輸出解析 deploymentId，請手動指定：DEPLOYMENT_ID=xxx node scripts/deploy-gas.mjs --yes');
  }
  const execUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
  log('  端點：' + execUrl);
  saveState({ scriptId: cfg.scriptId, deploymentId, execUrl, project: TITLE });

  log('→ 等端點可匿名訪問');
  const ping0 = await waitUntilReachable(execUrl, RESUME ? 60 : 12);
  if (!ping0?.json) {
    saveState({ pending: 'web-app-access' });
    manualAccessSteps(execUrl);
    process.exitCode = 3;
    return;
  }
  log(`  ✓ HTTP ${ping0.status} ${JSON.stringify(ping0.json).slice(0, 90)}`);

  log('→ bootstrap（送我們自己產生的密鑰）＋ pull 覆核');
  // 先落盤再送出：雲端可能已收下新密鑰、腳本卻在下一步（建表／核准）才失敗，
  // 那时記憶體裡的 secret 一丟，雲端與 .deploy/gas.json 就會對不上（實測踩過：pull 回 unauthorized）。
  saveState({ secret, sheets_ready: false, pending: 'bootstrap' });
  const boot = await bootstrapAndVerify(execUrl, token, secret);
  log(`  ✓ 覆核通過（第 ${boot.verified ? boot.via : '?'} 次 pull）`);
  if (boot.sheetsReady === false) {
    log('  工作表沒建好 → 補一次 setup');
    const st = await postJson(execUrl, { action: 'setup', device_id: 'deploy-probe', secret });
    log('   ' + JSON.stringify(st.json ?? st.text.slice(0, 120)));
  }

  log('→ 關閉設定通道（刪 gas/dist/Bootstrap.gs → 重建 → content API 移除雲端那份 → 發新版本）');
  rmSync(BOOTSTRAP, { force: true });
  run('npm', ['run', 'gas:build', '--silent'], { cwd: ROOT });   // 重BUILD 會把 appsscript.json 再拷一次，且 dist 內不會再有通道檔
  log('  ' + push());
  const del = await deleteCloudFiles(cfg.scriptId, ['Bootstrap']);
  log('  雲端已移除：' + (del.removed.join(', ') || '（本來就沒有）') + `，剩 ${del.total} 檔`);
  log('  ' + clasp(['create-deployment', '-i', deploymentId, '-d', 'close-bootstrap-channel']).trim().split('\n').slice(-1)[0]);
  await sleep(6000);
  const closed = await postJson(execUrl, { action: 'bootstrap', setup_token: token, secret });
  log('  通道狀態：' + JSON.stringify(closed.json ?? '（回應非 JSON）'));
  if (closed.json?.ok) throw new Error('刪掉 Bootstrap.gs 後 bootstrap 仍可設定——通道沒關住');

  saveState({ secret, sheets_ready: true, pending: null, channel_closed: !closed.json?.ok });
  log('\n✓ 後端就緒。把這兩項貼進 App 設定頁：');
  log('  GAS Web App URL ：' + execUrl);
  log('  同步密鑰        ：' + secret);
  log('  （已存進 .deploy/gas.json）');
  log('\n下一步：App 裡按「📡 測試連線」應綠燈，再按「🔄 立即同步」。');
  log('輪替密鑰：node scripts/deploy-gas.mjs --yes（會產生新密鑰並重設）');
}

// 只有「直接執行」時才跑：被測試 import 時不能有副作用（會把 console 打進 node:test 的輸出流）
const INVOKED_DIRECTLY = process.argv[1] && process.argv[1].endsWith('deploy-gas.mjs');
if (INVOKED_DIRECTLY) main().catch((e) => {
  try { saveState({ pending: 'incomplete' }); } catch { /* 沒有 state 可寫也別把錯誤吃掉 */ }
  console.error('✗ ' + e.message);
  process.exit(1);
});
