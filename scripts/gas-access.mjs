#!/usr/bin/env node
// scripts/gas-access.mjs — 逐个部署打 anonymous POST {action:"ping"}，把「能不能被前端呼叫」變成可測的事實。
// 為什麼需要：Apps Script REST（v1 projects.deployments）的 DeploymentConfig 只有
// {description, scriptId, manifestFileName, versionNumber}——**沒有 access 欄位**，
// Web App 的訪問權限完全由 `appsscript.json` 的 `webApp` 區塊決定（鍵名大小寫敏感，
// 寫成 `webapp` 會被 Google 忽略而落成「只有自己」→ 前端拿到 HTTP 403）。
// 用法：node scripts/gas-access.mjs            # 探針（唯讀）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const GAS = new URL('../gas/', import.meta.url).pathname.replace(/\/$/, '');
const cfg = JSON.parse(readFileSync(join(GAS, '.clasp.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(GAS, 'appsscript.json'), 'utf8'));

async function main() {
  if (!manifest.webApp) {
    console.error('✗ appsscript.json 沒有 webApp（注意大小寫：是 webApp 不是 webapp）→ 部署會是「只有自己」，前端必然 403');
    process.exit(1);
  }
  console.log(`本機 manifest：webApp=${JSON.stringify(manifest.webApp)}`);
  const AUTH = process.env.clasp_config_auth || process.env.CLASP_AUTH || '/tmp/clasp/.clasprc.json';
  const raw = JSON.parse(readFileSync(AUTH, 'utf8'));
  const c = raw.tokens.default;
  const tokRes = await (await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client_id, client_secret: c.client_secret, refresh_token: c.refresh_token, grant_type: 'refresh_token' }),
  })).json();
  if (!tokRes.access_token) throw new Error('換 token 失敗：' + JSON.stringify(tokRes).slice(0, 200));
  const list = await (await fetch(`https://script.googleapis.com/v1/projects/${cfg.scriptId}/deployments?pageSize=100`, {
    headers: { authorization: `Bearer ${tokRes.access_token}` },
  })).json();
  if (!list.deployments?.length) { console.log('（尚無部署）'); return; }
  const sorted = [...list.deployments].sort((a, b) => String(b.createTime || '').localeCompare(String(a.createTime || '')));
  for (const d of sorted) {
    const url = `https://script.google.com/macros/s/${d.deploymentId}/exec`;
    let line = `  ${(d === sorted[0] ? '▶ ' : '  ')}@${d.deploymentConfig?.versionNumber ?? 'head'} ${d.deploymentId?.slice(0, 26)}…`;
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ping', device_id: 'probe' }), redirect: 'follow' });
      const text = await r.text();
      let json = null; try { json = JSON.parse(text); } catch {}
      line += ` → HTTP ${r.status} ${json ? JSON.stringify(json).slice(0, 90) : text.slice(0, 40).replace(/\s+/g, ' ')}`;
      if (r.status === 403) line += '  ✗ 匿名被拒：webApp.access 沒生效';
    } catch (e) { line += ' → 請求失敗 ' + e.message; }
    console.log(line);
  }
  console.log('  （▶ = 最新一版，App 應該用它）');
}
main().catch((e) => { console.error('✗ ' + e.message); process.exit(1); });
