#!/usr/bin/env node
// scripts/deploy-gas.mjs — 用 clasp 全自動部署 GAS 後端（含密鑰設定，不用去編輯器點函式）
//
// 流程：show-authorized-user → create-script → 寫入一次性 Bootstrap.gs(SETUP_TOKEN) → push
//      → create-deployment → POST action=bootstrap（設 SHARED_SECRET + 建三個工作表）
//      → 刪掉 Bootstrap.gs → 再 push（把設定通道關掉）→ 印出要貼進 App 的 URL 與密鑰
//
// 用法：
//   node scripts/deploy-gas.mjs            # 預覽會做什麼（不碰你帳號）
//   node scripts/deploy-gas.mjs --yes      # 真的部署
//   node scripts/deploy-gas.mjs --yes --destroy   # 把建立的 Apps Script 專案刪掉
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const GAS = join(ROOT, 'gas');
const OUT = join(ROOT, '.deploy');
const AUTH = process.env.clasp_config_auth || process.env.CLASP_AUTH || '/usr/local/share/clasp/.clasprc.json';
const TITLE = process.env.GAS_TITLE || 'HS Tracker Backend';
const RESUME = process.argv.includes('--resume');
const YES = process.argv.includes('--yes');
const DESTROY = process.argv.includes('--destroy');
process.env.clasp_config_auth = AUTH;

const log = (...a) => console.log(...a);
const run = (cmd, args, opts = {}) => {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', cwd: opts.cwd || ROOT, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  } catch (e) {
    const out = `${e.stdout || ''}${e.stderr || ''}`.trim();
    if (opts.tolerate) return out;
    throw new Error(`${cmd} ${args.join(' ')} 失敗：${out || e.message}`);
  }
};
// 沙箱裡 clasp 常常不在 PATH（全域 npm 目錄不可寫）→ 允許 CLASP_BIN 指到本地安裝處
const CLASP_BIN = process.env.CLASP_BIN || (existsSync('/tmp/clasp-tools/node_modules/.bin/clasp') ? '/tmp/clasp-tools/node_modules/.bin/clasp' : 'clasp');
// 所有 clasp 命令都在 gas/ 裡執行：clasp 以 cwd 決定 .clasp.json 與 rootDir 的位置
// （上一版在 repo 根跑 create-script，專案檔與預設 appsscript.json 就落到根目錄了）
const clasp = (args, opts = {}) => run(CLASP_BIN, ['-A', AUTH, ...args], { cwd: GAS, ...opts });

export function parseDeploymentId(text) {
  const t = String(text || '');
  const labeled = t.match(/deployment\s*id"?\s*[:=]\s*"?([A-Za-z0-9_-]{10,})"?/i);
  if (labeled) return labeled[1];
  const bare = t.match(/\b([A-Za-z0-9_-]{20,})\b(?!\.)/);   // 例：AKfy3fQp3zKpQnGvHN3dTVNfJmLXQYnZqOg
  return bare ? bare[1] : null;
}

// clasp 3.4.1：覆蓋 appsscript.json 需要互動確認；非 TTY 會回「Skipping push.」而不推任何檔
// → 必須 --force，且驗證輸出，否則會誤以為已部署（本輪實測踩到）
function push() {
  const out = clasp(['push', '--force']).trim();
  if (!/Pushed\s+\d+\s+file|Pushed one file|Pushed no files/.test(out) || /Skipping push/.test(out)) {
    throw new Error('clasp push 沒推任何檔案，輸出：' + JSON.stringify(out));
  }
  return out.split('\n').filter((l) => l.startsWith('Pushed') || l.includes('appsscript')).join(' / ') || out.split('\n').slice(-1)[0];
}

function readClaspJson() {
  const p = join(GAS, '.clasp.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
}

async function postJson(url, body, { follow = 5 } = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // 簡單請求，避 preflight
    body: JSON.stringify(body),
    redirect: 'follow',
    credentials: 'omit',
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 通常是登入頁 HTML */ }
  return { status: res.status, ok: res.ok, json, text };
}

function plan(lines) {
  log('將執行（依序）：');
  for (const l of lines) log('  · ' + l);
}

async function probeAnon(execUrl) {
  const r = await postJson(execUrl, { action: 'ping', device_id: 'probe' });
  return { reachable: !!r.json, status: r.status, json: r.json };
}

function manualAccessSteps(execUrl) {
  log('\n⚠ Apps Script REST（v1 projects.deployments）的 DeploymentConfig 只有');
  log('  {description, scriptId, manifestFileName, versionNumber}——**沒有 access 欄位**；');
  log('  clasp create-deployment 建出來的部署因此落在「只有自己」，匿名 POST 會拿到 HTTP 403「Access Denied」');
  log('  （本機 appsscript.json 已寫 webapp.access=ANYONE_ANONYMOUS 並 push 成功，實測 redeploy 仍是 403）。');
  log('\n  這一步只能你在瀏覽器點，約 20 秒：');
  log('    1) 開 https://script.google.com/d/' + (readClaspJson()?.scriptId || '<scriptId>') + '/edit');
  log('    2) 右上 Deploy ▸ Manage deployments ▸ ⋮ ▸ Edit');
  log('    3) New deployment ▸ Web app；Execute as: **Me**；Who has access: **Anyone**');
  log('    4) Deploy（URL 不变：' + execUrl + '）');
  log('\n  做完再跑：node scripts/deploy-gas.mjs --yes --resume   # 會等端點通、設密鑰、關掉 bootstrap 通道');
}

async function main() {
  if (!YES) {
    log('這是**會改動你 Google 帳號**的部署（建 Apps Script 專案、公開 Web App 端點）。');
    log('預覽模式，未做任何變更。要執行請加 --yes。\n');
    plan([
      `clasp show-authorized-user（確認帳號）`,
      `clasp create-script --title "${TITLE}" --type standalone（在 gas/ 目錄內執行）`,
      '寫入 gas/Bootstrap.gs（一次性 SETUP_TOKEN，已在 .gitignore/.claspignore 內）',
      'clasp push',
      'clasp create-deployment -d "init"（訪問權限依 gas/appsscript.json：ANYONE_ANONYMOUS，但無密鑰時端點只回 secret-not-configured，不寫表）',
      'POST action=bootstrap → 寫入 SHARED_SECRET、建 Changes/Backups/Meta 工作表',
      '刪除 gas/Bootstrap.gs 再 push（關閉設定通道）',
      `寫 .deploy/gas.json（exec URL + 密鑰），你貼進 App 設定即可`,
    ]);
    log('\n執行：node scripts/deploy-gas.mjs --yes');
    return;
  }

  if (RESUME) {
    if (!existsSync(join(GAS, 'Bootstrap.gs'))) throw new Error('gas/Bootstrap.gs 不見了（一次性 token 已丟）→ 重跑 `node scripts/deploy-gas.mjs --yes`');
    const m = readFileSync(join(GAS, 'Bootstrap.gs'), 'utf8').match(/SETUP_TOKEN = "([^"]+)"/);
    if (!m) throw new Error('gas/Bootstrap.gs 裡讀不到 SETUP_TOKEN');
    const prev = existsSync(join(OUT, 'gas.json')) ? JSON.parse(readFileSync(join(OUT, 'gas.json'), 'utf8')) : null;
    if (!prev?.execUrl) throw new Error('找不到 .deploy/gas.json，無法 resume');
    log('→ 等端點開放匿名訪問（最多 5 分鐘）');
    let ok = false;
    for (let i = 0; i < 60; i++) {
      const p = await probeAnon(prev.execUrl);
      if (p.reachable) { ok = true; log(`  ✓ HTTP ${p.status} ${JSON.stringify(p.json).slice(0, 90)}`); break; }
      if (i % 6 === 0) log(`  第 ${i + 1} 次：HTTP ${p.status}（還不通；確認 Who has access 已改成 Anyone）`);
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (!ok) throw new Error('端點仍然 403/404 —— 請先在編輯器把 Who has access 設成 Anyone');
    const boot = await postJson(prev.execUrl, { action: 'bootstrap', setup_token: m[1] });
    if (!boot.json?.ok) throw new Error('bootstrap 失敗：' + JSON.stringify(boot.json ?? boot.text?.slice(0, 200)));
    rmSync(join(GAS, 'Bootstrap.gs'), { force: true });
    log('  ' + push());
    writeFileSync(join(OUT, 'gas.json'), JSON.stringify({ ...prev, secret: boot.json.secret, sheets_ready: boot.json.sheets_ready, at: new Date().toISOString() }, null, 2) + '\n');
    log('\n✓ 初始化完成。App 設定頁貼：');
    log('  GAS Web App URL ：' + prev.execUrl);
    log('  同步密鑰        ：' + boot.json.secret);
    return;
  }

  log('→ 授權確認');
  const who = clasp(['show-authorized-user']).trim();
  log('  ' + who);
  if (/Not logged in/.test(who)) throw new Error('clasp 未授權');

  if (DESTROY) {
    const cfg = readClaspJson();
    if (!cfg) throw new Error('找不到 gas/.clasp.json，無可刪除');
    log('→ 刪除 Apps Script 專案 ' + cfg.scriptId);
    log('  ' + clasp(['delete-script', cfg.scriptId, '--force']).trim());
    rmSync(join(GAS, '.clasp.json'), { force: true });
    rmSync(join(OUT, 'gas.json'), { force: true });
    log('✓ 已刪除（Google Sheet 若存在請自行到 Drive 移除）');
    return;
  }

  let cfg = readClaspJson();
  if (!cfg) {
    log('→ 建立 Apps Script 專案');
    const out = clasp(['create-script', '--title', TITLE, '--type', 'standalone']);
    log('  ' + out.trim().split('\n').slice(-2).join(' / '));
    cfg = readClaspJson();
    if (!cfg?.scriptId) throw new Error('建立後仍讀不到 .clasp.json：' + out);
  } else {
    log('→ 沿用既有專案 ' + cfg.scriptId);
  }

  const token = randomBytes(24).toString('base64url');
  writeFileSync(join(GAS, 'Bootstrap.gs'), `// 一次性安裝用；部署完即被刪除，且不進 git、不進雲端（見 .gitignore/.claspignore）\nconst SETUP_TOKEN = ${JSON.stringify(token)};\n`);

  log('→ clasp push（含 Bootstrap.gs）');
  log('  ' + push());

  log('→ 建立部署');
  const dep = clasp(['create-deployment', '-d', 'init']).trim();
  log('  ' + dep.split('\n').slice(-2).join(' / '));
  const listed = clasp(['list-deployments', cfg.scriptId]).trim();
  const deploymentId = process.env.DEPLOYMENT_ID || parseDeploymentId(dep) || parseDeploymentId(listed);
  if (!deploymentId) throw new Error('無法從 clasp 輸出解析 deploymentId，請手動指定後重跑：DEPLOYMENT_ID=xxx node scripts/deploy-gas.mjs --yes\n--- create-deployment 輸出 ---\n' + dep + '\n--- list-deployments 輸出 ---\n' + listed);
  const execUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
  log('  端點：' + execUrl);

  mkdirSync(OUT, { recursive: true });
  const anon = await probeAnon(execUrl);
  if (!anon.reachable) {
    writeFileSync(join(OUT, 'gas.json'), JSON.stringify({ scriptId: cfg.scriptId, deploymentId, execUrl, project: TITLE, pending: 'web-app-access', at: new Date().toISOString() }, null, 2) + '\n');
    manualAccessSteps(execUrl);
    process.exitCode = 3;
    return;
  }

  log('→ bootstrap（設密鑰 + 建表）');
  // 剛建的部署可能需要幾秒生效
  // 新建部署要等 Google 那邊生效（首擊常 404/500 或吐登入頁 HTML），最多等 60 秒
  let boot = null;
  for (let i = 0; i < 12; i++) {
    boot = await postJson(execUrl, { action: 'bootstrap', setup_token: token });
    if (boot.json?.ok) break;
    log(`  第 ${i + 1} 次嘗試：HTTP ${boot.status} ${boot.json?.error || boot.text?.slice(0, 60) || ''}`);
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!boot?.json?.ok) {
    const hint = boot?.status === 403
      ? '\n  403 = 匿名被拒。Apps Script REST 無法設定 web app 訪問權限，它只讀 appsscript.json 的 **webApp**（大寫 A；寫成 webapp 會被忽略而落成「只有自己」）。\n  先跑 node scripts/gas-access.mjs 看每個部署的探針結果，再重跑本腳本。'
      : '';
    throw new Error('bootstrap 失敗：HTTP ' + boot?.status + ' ' + JSON.stringify(boot?.json || boot?.text?.slice(0, 200)) + hint);
  }
  const secret = boot.json.secret;

  log('→ 關閉設定通道（刪 Bootstrap.gs 再 push）');
  rmSync(join(GAS, 'Bootstrap.gs'), { force: true });
  log('  ' + push());

  log('→ 驗證 ping');
  const ping = await postJson(execUrl, { action: 'ping' });
  log('  ' + JSON.stringify(ping.json ?? ping.text.slice(0, 120)));

  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'gas.json'), JSON.stringify({ scriptId: cfg.scriptId, deploymentId, execUrl, secret, project: TITLE, at: new Date().toISOString() }, null, 2) + '\n');

  log('\n✓ 後端就緒。把這兩項貼進 App 設定頁：');
  log('  GAS Web App URL ：' + execUrl);
  log('  同步密鑰        ：' + secret);
  log('  （也已存進 .deploy/gas.json，該目錄已 gitignore）');
  log('\n下一步：App 裡按「📡 測試連線」應綠燈，再按「🔄 立即同步」。');
  log('反悔：node scripts/deploy-gas.mjs --yes --destroy');
}

main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
