#!/usr/bin/env node
// scripts/deps.mjs — 跑測試前確認 sql.js 在（node_modules 不是 repo 的一部分，容器重啟後會不見）
// 缺了就自己 npm ci（有 lock 檔），讓 `npm test` 在任何乾淨環境都能直接跑。
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const req = createRequire(join(ROOT, 'tests', 'x.js'));
// TS + Rollup 遷移之後，光有 sql.js 不夠：容器重啟會清掉 node_modules（快照不含它），
// 少任何一個工具鏈成员，後續 `tsc`/`rollup` 就是 "command not found"，錯誤還會報在别處。
const NEEDED = ['sql.js', 'typescript', 'rollup', '@rollup/plugin-typescript', '@rollup/plugin-terser', '@rollup/plugin-node-resolve', 'tslib'];
const missing = NEEDED.filter((m) => { try { req.resolve(m + '/package.json'); return false; } catch { try { req.resolve(m); return false; } catch { return true; } } });
if (!missing.length) { console.log('· 依賴就緒（' + NEEDED.length + ' 個套件）'); process.exit(0); }
console.log('· 缺工具鏈：' + missing.join(', ') + ' → 裝依賴（npm ci / npm install）');
const hasLock = existsSync(join(ROOT, 'package-lock.json'));
try {
  execFileSync('npm', hasLock ? ['ci', '--silent'] : ['install', '--no-audit', '--no-fund', '--silent'], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('✗ 裝依賴失敗：' + e.message + '\n  手動跑：npm ci');
  process.exit(1);
}
const still = NEEDED.filter((m) => { try { req.resolve(m + '/package.json'); return false; } catch { try { req.resolve(m); return false; } catch { return true; } } });
if (still.length) { console.error('✗ 裝完仍缺：' + still.join(', ') + '（檢查 node_modules/ 與 package-lock.json）'); process.exit(1); }
console.log('✓ 依賴就緒');
