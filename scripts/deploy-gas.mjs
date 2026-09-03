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
const clasp = (args, opts) => run(CLASP_BIN, ['-A', AUTH, ...args], opts);

export function parseDeploymentId(text) {
  const t = String(text || '');
  const labeled = t.match(/deployment\s*id"?\s*[:=]\s*"?([A-Za-z0-9_-]{10,})"?/i);
  if (labeled) return labeled[1];
  const bare = t.match(/\b([A-Za-z0-9_-]{20,})\b(?!\.)/);   // 例：AKfy3fQp3zKpQnGvHN3dTVNfJmLXQYnZqOg
  return bare ? bare[1] : null;
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

async function main() {
  if (!YES) {
    log('這是**會改動你 Google 帳號**的部署（建 Apps Script 專案、公開 Web App 端點）。');
    log('預覽模式，未做任何變更。要執行請加 --yes。\n');
    plan([
      `clasp show-authorized-user（確認帳號）`,
      `clasp create-script --title "${TITLE}" --type standalone --rootDir .`,
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
    const out = clasp(['create-script', '--title', TITLE, '--type', 'standalone', '--rootDir', '.']);
    log('  ' + out.trim().split('\n').slice(-2).join(' / '));
    cfg = readClaspJson();
    if (!cfg?.scriptId) throw new Error('建立後仍讀不到 .clasp.json：' + out);
  } else {
    log('→ 沿用既有專案 ' + cfg.scriptId);
  }

  const token = randomBytes(24).toString('base64url');
  writeFileSync(join(GAS, 'Bootstrap.gs'), `// 一次性安裝用；部署完即被刪除，且不進 git、不進雲端（見 .gitignore/.claspignore）\nconst SETUP_TOKEN = ${JSON.stringify(token)};\n`);

  log('→ clasp push（含 Bootstrap.gs）');
  log('  ' + clasp(['push']).trim().split('\n').slice(-1)[0]);

  log('→ 建立部署');
  const dep = clasp(['create-deployment', '-d', 'init']).trim();
  log('  ' + dep.split('\n').slice(-2).join(' / '));
  const listed = clasp(['list-deployments', cfg.scriptId]).trim();
  const deploymentId = process.env.DEPLOYMENT_ID || parseDeploymentId(dep) || parseDeploymentId(listed);
  if (!deploymentId) throw new Error('無法從 clasp 輸出解析 deploymentId，請手動指定後重跑：DEPLOYMENT_ID=xxx node scripts/deploy-gas.mjs --yes\n--- create-deployment 輸出 ---\n' + dep + '\n--- list-deployments 輸出 ---\n' + listed);
  const execUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
  log('  端點：' + execUrl);

  log('→ bootstrap（設密鑰 + 建表）');
  // 剛建的部署可能需要幾秒生效
  let boot = null;
  for (let i = 0; i < 6; i++) {
    boot = await postJson(execUrl, { action: 'bootstrap', setup_token: token });
    if (boot.json?.ok) break;
    await new Promise((r) => setTimeout(r, 3000));
  }
  if (!boot?.json?.ok) throw new Error('bootstrap 失敗：HTTP ' + boot?.status + ' ' + JSON.stringify(boot?.json || boot?.text?.slice(0, 200)));
  const secret = boot.json.secret;

  log('→ 關閉設定通道（刪 Bootstrap.gs 再 push）');
  rmSync(join(GAS, 'Bootstrap.gs'), { force: true });
  log('  ' + clasp(['push']).trim().split('\n').slice(-1)[0]);

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
