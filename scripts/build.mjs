// scripts/build.mjs — 組 dist/：拷貝靜態檔、把 git sha 戳進 sw.js、輸出體積報告
// 目的（todo 1.8）：sw.js 對殼是 cache-first，不換 CACHE_NAME 就永遠抓舊版。
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const DIST = join(ROOT, 'dist');
const sizeOnly = process.argv.includes('--size-only');
const COPY = ['index.html', 'manifest.json', 'css', 'js', 'data', 'icons', 'vendor', 'sw.js', '.nojekyll'];

function sha() {
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim(); } catch { return 'local'; }
}
const BUILD = process.env.BUILD_ID || `${sha()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

/** vendor/ 缺檔時從 node_modules 補（CI 可重現，不靠人手抄 CDN） */
function ensureVendor() {
  const src = join(ROOT, 'node_modules', 'sql.js', 'dist');
  for (const f of ['sql-wasm.js', 'sql-wasm.wasm']) {
    const dst = join(ROOT, 'vendor', f);
    if (existsSync(dst)) continue;
    if (!existsSync(join(src, f))) { console.error(`✗ 缺 vendor/${f}，且 node_modules/sql.js 不存在 → 先 npm ci`); process.exit(1); }
    mkdirSync(join(ROOT, 'vendor'), { recursive: true });
    cpSync(join(src, f), dst);
    console.log(`  · 由 node_modules 補上 vendor/${f}`);
  }
  const want = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).devDependencies['sql.js'];
  if (existsSync(join(ROOT, 'node_modules', 'sql.js', 'package.json'))) {
    const got = JSON.parse(readFileSync(join(ROOT, 'node_modules', 'sql.js', 'package.json'), 'utf8')).version;
    if (got !== want.replace(/^[~^]/, '')) { console.error(`✗ sql.js 版本不符：spec ${want}、實裝 ${got}（vendor/ 需可重現，請用固定版）`); process.exit(1); }
    console.log(`  · sql.js ${got}（與 package.json 一致）`);
  }
}

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]);
const kb = (n) => `${(n / 1024).toFixed(1)}KB`;

function main() {
  ensureVendor();
  if (sizeOnly) {
    let total = 0; const big = [];
    for (const f of walk(ROOT)) {
      const rel = relative(ROOT, f);
      if (!COPY.some((c) => rel === c || rel.startsWith(c + '/'))) continue;
      const sz = statSync(f).size; total += sz;
      if (sz > 20000) big.push([rel, sz]);
    }
    big.sort((a, b) => b[1] - a[1]).forEach(([rel, sz]) => console.log(`  ${kb(sz).padStart(9)}  ${rel}`));
    console.log(`  ${kb(total).padStart(9)}  前端整站（Pages 上限 1GB 的 ${(total / 1e9 * 100).toFixed(3)}%）`);
    return;
  }

  writeFileSync(join(ROOT, 'js', 'build-info.js'),
    `// 由 scripts/build.mjs 產生，勿手改（index.html 載入，UI 用它顯示 build）\nwindow.BUILD = ${JSON.stringify(BUILD)};\nwindow.APP_VERSION = '2.0.0';\n`);

  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  for (const item of COPY) {
    const from = join(ROOT, item);
    if (!existsSync(from)) { console.error(`✗ 缺少 ${item}（build 中斷）`); process.exit(1); }
    cpSync(from, join(DIST, item), { recursive: true });
  }

  const swPath = join(DIST, 'sw.js');
  const sw = readFileSync(swPath, 'utf8').replace("'__BUILD__'", `'${BUILD}'`);
  if (sw.includes('__BUILD__')) { console.error('✗ sw.js 的 __BUILD__ 沒被替換（VERSION 常數被改壞了？）'); process.exit(1); }
  writeFileSync(swPath, sw);

  let total = 0; const files = {};
  for (const f of walk(DIST)) {
    const rel = relative(DIST, f).replace(/\\/g, '/');
    const s = statSync(f).size; total += s;
    files[rel] = s;
  }
  writeFileSync(join(DIST, 'build-info.json'), JSON.stringify({ build: BUILD, generated_at: new Date().toISOString(), total_bytes: total, files }, null, 2) + '\n');
  console.log(`✓ dist/ 就緒：${Object.keys(files).length} 檔、${kb(total)}`);
  console.log(`  cache key = hs-tracker-${BUILD}（每次部署必換，見 todo 1.8）`);
}

main();
