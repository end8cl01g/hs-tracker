#!/usr/bin/env node
// scripts/deps.mjs — 跑測試前確認 sql.js 在（node_modules 不是 repo 的一部分，容器重啟後會不見）
// 缺了就自己 npm ci（有 lock 檔），讓 `npm test` 在任何乾淨環境都能直接跑。
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const req = createRequire(join(ROOT, 'tests', 'x.js'));
try { req.resolve('sql.js'); console.log('· 依賴就緒（sql.js）'); process.exit(0); } catch { /* 往下裝 */ }
console.log('· 找不到 sql.js → 裝依賴（npm ci / npm install）');
const hasLock = existsSync(join(ROOT, 'package-lock.json'));
try {
  execFileSync('npm', hasLock ? ['ci', '--silent'] : ['install', '--no-audit', '--no-fund', '--silent'], { cwd: ROOT, stdio: 'inherit' });
} catch (e) {
  console.error('✗ 裝依賴失敗：' + e.message + '\n  手動跑：npm ci');
  process.exit(1);
}
try { req.resolve('sql.js'); console.log('✓ 依賴就緒'); }
catch { console.error('✗ 裝完仍找不到 sql.js（檢查 node_modules/）'); process.exit(1); }
