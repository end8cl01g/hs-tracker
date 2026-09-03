#!/usr/bin/env node
// scripts/gas-verify.mjs — 不用 clasp、不用憑證，只從公網打端點，驗證後端「真的能用」而不是「push 成功」
// 讀 .deploy/gas.json 的 execUrl + secret；每項檢查獨立回報，最後給總結果。
// 用法：node scripts/gas-verify.mjs          # 唯讀檢查（ping / pull / setup / 通道是否關閉）
//       node scripts/gas-verify.mjs --write  # 另加一次「寫入→讀回」往返（會在雲端 Changes 表留一列標記）
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const WANT_WRITE = process.argv.includes('--write');
const statePath = join(ROOT, '.deploy', 'gas.json');
if (!existsSync(statePath)) { console.error('✗ 找不到 .deploy/gas.json（先跑 node scripts/deploy-gas.mjs --yes）'); process.exit(1); }
const st = JSON.parse(readFileSync(statePath, 'utf8'));
if (!st.execUrl || !st.secret) { console.error('✗ .deploy/gas.json 裡缺 execUrl 或 secret：' + JSON.stringify(Object.keys(st))); process.exit(1); }

async function call(body) {
  try {
    const res = await fetch(st.execUrl, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow' });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: res.status, json, text };
  } catch (e) { return { status: 0, json: null, text: e.message }; }
}
const short = (o) => (o.json ? JSON.stringify(o.json) : o.text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).slice(0, 160);

const results = [];
function check(name, pass, detail) { results.push({ name, pass, detail }); console.log(`${pass ? '✓' : '✗'} ${name.padEnd(26)} ${detail.slice(0, 150)}`); }

const ping = await call({ action: 'ping' });
check('端點可匿名送達', ping.status === 200 && !!ping.json, `HTTP ${ping.status} ${short(ping)}`);
check('後端已設密鑰', ping.json?.secret_configured === true, `version=${ping.json?.version} app=${ping.json?.app}`);

const bad = await call({ action: 'bootstrap', setup_token: 'wrong-' + randomBytes(4).toString('hex'), secret: 'a'.repeat(64), force: true });
const closed = bad.json?.error === 'no-setup-token';
check('bootstrap 通道已關閉', closed, `回 ${bad.json?.error || short(bad)}${closed ? '' : '（代表雲端 gas/Bootstrap.gs 還在，設定面仍暴露）'}`);

const pull = await call({ action: 'pull', device_id: 'verify', secret: st.secret, since: null });
check('密鑰可用（pull）', pull.json?.ok === true, short(pull));

const setup = await call({ action: 'setup', device_id: 'verify', secret: st.secret });
check('雲端表格就緒（setup）', setup.json?.ok === true, short(setup));

if (WANT_WRITE) {
  const id = 'verify-' + randomBytes(6).toString('hex');
  const iso = new Date().toISOString().slice(0, 10);
  const push = await call({ action: 'push', device_id: 'verify', secret: st.secret, tables: { workout_logs: [{ id, log_date: iso, phase: 0, day_type: 'verify', completed: 1, notes: 'gas-verify', xp_earned: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), deleted: 0 }] } });
  check('寫入一列（push）', push.json?.ok === true && (push.json?.acked?.workout_logs?.count || 0) >= 1, short(push));
  const back = await call({ action: 'pull', device_id: 'other-device', secret: st.secret, since: null });
  const rows = back.json?.rows?.workout_logs || [];
  check('別台裝置讀得回（往復）', rows.some((r) => r.id === id), `雲端 workout_logs ${rows.length} 列，找 ${id}`);
}

const badSecret = await call({ action: 'pull', device_id: 'verify', secret: 'deadbeef'.repeat(8) });
check('錯密鑰被拒', badSecret.json?.ok === false && badSecret.json?.error === 'unauthorized', short(badSecret));

const failed = results.filter((r) => !r.pass);
console.log(`\n${failed.length ? '✗ ' + failed.length + ' 項不合格' : '✓ 全部通過'}（端點：${st.execUrl.slice(0, 58)}…）`);
if (failed.some((f) => f.name === '雲端表格就緒（setup）')) {
  console.log('  → 多半是 Apps Script 的 scope 尚未核准：在編輯器 Run 一次 doctor_ 並 Allow；');
  console.log('    並確認雲端 appsscript.json 已不含 oauthScopes（寫死就會蓋掉自動推斷）。');
}
process.exit(failed.length ? 1 : 0);
