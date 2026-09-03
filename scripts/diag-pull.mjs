// 覆核用：把真雲端 Changes 表拉下來，分「我們的測試列 / 你的真資料列 / 墓碑」三類計數。
// 前端說「同步了」不算數，雲端看得到非 verify 的真列才算數。
// 用法：node scripts/diag-pull.mjs [--expect-push]
//   --expect-push：把「非測試裝置 0 列」當成失敗（exit 1），方便寫進驗證流程
// 註：pullRows_ 只回 payload（不含 device 欄），所以用 row_id 前綴辨認我們自己的探針列。
import { readFileSync } from 'node:fs';

const EXPECT = process.argv.includes('--expect-push');
const cfg = JSON.parse(readFileSync(new URL('../.deploy/gas.json', import.meta.url), 'utf8'));
const r = await fetch(cfg.execUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify({ action: 'pull', secret: process.env.GAS_SECRET || cfg.secret, device_id: 'diag-host', since: null }),
});
const j = await r.json().catch(() => null);
if (!j?.ok) { console.log('✗ pull 失敗：', r.status, JSON.stringify(j || (await r.text())).slice(0, 200)); process.exit(1); }

const rows = j.rows || {};
let probe = 0, tomb = 0, real = 0;
const realRows = [];
let newest = null;
for (const [tbl, list] of Object.entries(rows)) {
  for (const row of list || []) {
    const id = String(row.id || row.row_id || '');
    const isProbe = id.startsWith('verify-');                       // 我們 CLI 留的探針列
    const isTomb = !!(row._deleted || row.deleted || row.deleted_at);
    if (isTomb) tomb++;
    if (isProbe) { probe++; continue; }
    real++;
    realRows.push(`${tbl}#${id}`);
    const at = String(row.updated_at || '');
    if (at && (!newest || at > newest)) newest = at;
  }
}
console.log(`雲端 Changes：server count=${j.count}（原始列，含同 key 的多次覆寫）`);
console.log(`  非測試的有效列：${real}｜我們的探針列：${probe}｜其中墓碑：${tomb}`);
console.log(`  最新 updated_at：${newest || '—'}｜server_ts：${j.server_ts}`);
if (realRows.length) console.log('  真資料：' + realRows.slice(0, 8).join(', ') + (realRows.length > 8 ? ` …（共 ${realRows.length}）` : ''));

if (real > 0) { console.log('\n✓ 雲端有你裝置的真資料列 → 前端 push 確實落地'); process.exit(0); }
console.log('\n· 雲端沒有你的資料列。兩種可能：(1) 本機真的沒有待同步的變更（正常，同步 0 列也是成功）；(2) push 沒打到。');
console.log('  分辨方法：在 App 按一次「完成今天的訓練」→ 待同步變 1 → 按 🔄 立即同步 → 再跑這支腳本。');
process.exit(EXPECT ? 1 : 0);
