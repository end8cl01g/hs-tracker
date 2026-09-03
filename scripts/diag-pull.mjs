// 一次性診斷：直接用瀏覽器同一條路（POST + text/plain + 跟隨 302）打 GAS，看真雲端回了什麼。
// 用法：GAS_SECRET=$(node -pe 'JSON.parse(require("fs").readFileSync(".deploy/gas.json","utf8")).secret') node scripts/diag-pull.mjs
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../.deploy/gas.json', import.meta.url), 'utf8'));
const S = process.env.GAS_SECRET || cfg.secret;

async function call(o) {
  const r = await fetch(cfg.execUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(o),
  });
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch (_) { /* HTML = 被攔截 */ }
  return { code: r.status, redirected: r.url !== cfg.execUrl, json: j, head: t.slice(0, 160) };
}

const pull = await call({ action: 'pull', secret: S, device_id: 'diag-host', since: null });
console.log('pull  HTTP', pull.code, '| 有跟隨 302:', pull.redirected, '| 是 JSON:', !!pull.json);
if (!pull.json) console.log('  前 160 字：', pull.head);
else console.log('  ', JSON.stringify(pull.json).slice(0, 700));

const setup = await call({ action: 'stats', secret: S });
console.log('stats', setup.code, JSON.stringify(setup.json || setup.head).slice(0, 300));
