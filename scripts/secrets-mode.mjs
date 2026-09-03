#!/usr/bin/env node
/**
 * scripts/secrets-mode.mjs —— 把 .deploy/ 裡的機密檔收回 0600
 *
 * 為什麼要獨立一支：本容器的快照/重啟會把權限掉回 644（實測過兩次，害 tests 紅），
 * 所以「收緊」這件事不能只掛在 build 的副作用上 —— build 不一定跑。
 * 現在 build(check.mjs) 與 test.mjs 的前置都會呼叫這裡，同一份實作、同一個語意。
 *
 * 不做的事：不刪除、不改內容、不動非機密檔；`.deploy/` 不存在就靜默回傳（乾淨 checkout）。
 */
import { readdirSync, statSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SECRET_RE = /(^\.|token|secret|credential|\.clasprc\.json$|gas\.json$)/i;

/**
 * @param {string} root  repo 根目錄
 * @param {{log?: (m:string)=>void, files?: string[]}} [o]  files 可覆寫要收緊的檔名（check.mjs 有自己的名單）
 * @returns {{fixed:string[], failed:string[], kept:number}}
 */
export function tightenSecretModes(root, o = {}) {
  const dir = join(root, '.deploy');
  const out = { fixed: [], failed: [], kept: 0 };
  if (!existsSync(dir)) return out;
  const names = o.files || readdirSync(dir).filter((f) => !f.endsWith('.md'));
  const secrets = names.filter((f) => {
    try { return statSync(join(dir, f)).isFile() && (o.files || SECRET_RE.test(f)); } catch { return false; }
  });
  for (const f of secrets) {
    const p = join(dir, f);
    const mode = statSync(p).mode & 0o777;
    if (mode === 0o600) { out.kept++; continue; }
    try { chmodSync(p, 0o600); out.fixed.push(f); } catch { out.failed.push(f); }
  }
  if (out.fixed.length && o.log) o.log(`🔒 .deploy/ 權限已自動收緊回 0600：${out.fixed.join(', ')}`);
  if (out.failed.length && o.log) o.log(`⚠️ 收緊失敗（同容器其他程序讀得到）：${out.failed.join(', ')}`);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = tightenSecretModes(process.cwd(), { log: (m) => process.stderr.write(m + '\n') });
  process.stdout.write(JSON.stringify(r) + '\n');
  if (r.failed.length) process.exitCode = 1;
}
