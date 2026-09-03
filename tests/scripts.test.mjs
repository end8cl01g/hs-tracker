// tests/scripts.test.mjs — 部署腳本本身也要有測試：未授權時必須「只預覽、不動作」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, basename } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (cmd, args, env = {}) => {
  try {
    return { code: 0, out: execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }) };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
};

test('deploy-gas.mjs 沒加 --yes 時不得動帳號（只印預覽）', () => {
  const r = run(process.execPath, ['scripts/deploy-gas.mjs'], { clasp_config_auth: '/nonexistent/.clasprc.json' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /預覽模式，未做任何變更/);
  assert.match(r.out, /--yes/);
  assert.ok(!/已建立 Apps Script 專案/.test(r.out), '預覽模式不能真的建專案');
});

test('ship.sh 沒 token 時要退出 2 並給出建 token 的連結', () => {
  const r = run('bash', ['scripts/ship.sh'], { GITHUB_TOKEN: '', GH_TOKEN_FILE: '', GH_TOKEN: '', GH_TOKEN_NONE: '1' });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /personal-access-tokens\/new/);
  assert.match(r.out, /Contents/);
});

test('ship.sh 會讀落盤憑證 .deploy/github-token，並留一個「暫時別讀」的開關', () => {
  const sh = readFileSync(join(ROOT, 'scripts', 'ship.sh'), 'utf8');
  assert.match(sh, /-f \.deploy\/github-token/, '要有「焊死」的落盤位置（重啟容器後還能推）');
  assert.match(sh, /GH_TOKEN_NONE/, '但必須能一鍵無視它（否則測試與共用機器上都危險）');
  assert.match(sh, /傳統 ghp_ token 是帳號級全權限|ghp_ .*全權限/, '用了全權限 token 就要在檔頭寫明風險與撤銷');
  const tok = join(ROOT, '.deploy', 'github-token');
  if (existsSync(tok)) assert.equal(statSync(tok).mode & 0o777, 0o600, '.deploy/github-token 必須 0600');
});

test('ship.sh 有 DRY=1 時跑完檢查但不 push', { skip: !process.env.GITHUB_TOKEN && !process.env.GH_TOKEN_FILE }, () => {
  const r = run('bash', ['scripts/ship.sh'], { DRY: '1' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /到此為止/);
});

test('CI workflow 必須先驗證再佈署，且部署只在 main', () => {
  const p = join(ROOT, '.github', 'workflows', 'deploy.yml');
  assert.ok(existsSync(p), '缺 deploy.yml');
  const y = readFileSync(p, 'utf8');
  assert.match(y, /needs: verify/);
  assert.match(y, /npm run check/);
  assert.match(y, /npm test/);
  assert.match(y, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(y, /permissions:/);
  assert.match(y, /pages: write/);
  assert.match(y, /actions\/deploy-pages@/);
  // 關鍵：驗證 dist 的 sw.js 有本次 sha，避免「上了舊殼」
  assert.match(y, /grep -q "\$\{GITHUB_SHA\}" dist\/sw\.js/);
});

test('.gitignore 把憑證與一次性 token 檔全部擋掉', () => {
  const g = readFileSync(join(ROOT, '.gitignore'), 'utf8');
  for (const need of ['.clasprc.json', '.clasp.json', 'Bootstrap.gs', '.deploy/', '*.token']) {
    assert.ok(g.includes(need), `.gitignore 缺 ${need}`);
  }
  // Bootstrap.gs 只在部署進行中存在（合法），但決不可被 git 追蹤
  const files = ['gas/dist/Bootstrap.gs', '.deploy/gas.json'];   // Bootstrap.gs 改放 dist（clasp 只推 dist）
  const tracked = execFileSync('git', ['ls-files', '--', ...files], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(tracked, '', '一次性 token / 密鑰檔被 git 追蹤了：' + tracked);
  for (const f of [...files, 'gas/dist/Code.gs', 'build/app.js']) {
    execFileSync('git', ['check-ignore', '-q', f], { cwd: ROOT, encoding: 'utf8' });
  }
});

test('clasp 只推 gas/dist 的產物，且 .claspignore 不會把 Code.gs 擋掉', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'gas', '.clasp.json'), 'utf8'));
  assert.equal(cfg.rootDir, 'dist', 'rootDir 必須是 dist：源碼是 .ts，推上去雲端會看不懂');
  const p = join(ROOT, 'gas', '.claspignore');
  assert.ok(existsSync(p), '缺 gas/.claspignore');
  const lines = readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  for (const f of ['Code.gs', 'appsscript.json']) {
    assert.ok(!lines.includes(f) && !lines.includes('*.gs') && !lines.includes('**/*'), `${f} 被 .claspignore 擋掉了 → push 出空專案`);
  }
  assert.ok(lines.includes('*.ts'), '.claspignore 要擋 *.ts（雙重保險：rootDir 已指 dist）');
});

test('deploy-gas.mjs 解析不到 deploymentId 時會明確失敗而不是亂猜 URL', async () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /無法從 clasp 輸出解析 deploymentId/);
  assert.match(src, /DEPLOYMENT_ID=/, '解析失敗要留一条手動指定的活路');
  assert.match(src, /parseDeploymentId\(dep\) \|\| parseDeploymentId\(listed\)/, '兩個輸出都要試，別只認一種格式');
  assert.match(src, /throw new Error\('無法從 clasp 輸出解析|請手動指定：DEPLOYMENT_ID=/);
  assert.match(src, /Content-Type': 'text\/plain;charset=utf-8'/, 'bootstrap 呼叫本身也要避 preflight');
  assert.match(src, /redirect: 'follow'/);
});

test('parseDeploymentId 認得 clasp 三種輸出格式（解析錯就是部署到別專案）', async () => {
  const { parseDeploymentId } = await import('../scripts/deploy-gas.mjs');
  const ID = 'AKfy3fQp3zKpQnGvHN3dTVNfJmLXQYnZqOg';
  assert.equal(parseDeploymentId(`Cloud manifest for this deployment created.\nDeployment ID: ${ID}\nError Execution ID: 74f2a`), ID, 'clasp create-deployment 的人類可讀輸出');
  assert.equal(parseDeploymentId(JSON.stringify([{ deploymentId: ID, version: 2 }], null, 2)), ID, 'clasp list-deployments 的 JSON 輸出');
  assert.equal(parseDeploymentId('{"deploymentId":"' + ID + '"}'), ID, '單行 JSON');
  assert.equal(parseDeploymentId('nothing useful here'), null, '解析不到時必須回 null（腳本才會明確報錯）');
  assert.equal(parseDeploymentId(''), null);
});

test('clasp push 必須 --force 並驗證輸出（非 TTY 下 clasp 會「Skipping push.」一個檔都不推）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /clasp\(\['push', '--force'\]\)/);
  assert.match(src, /Skipping push/, '要偵測「Skipping push.」並當失敗');
  assert.ok((src.match(/push\(\)/g) || []).length >= 2, '两次 push（含 token / 刪 token）都要走同一個守門');
});

test('匿名被 403 時要停在人工那一步、寫 pending 狀態、給 resume 指令', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /waitUntilReachable\(execUrl/);
  assert.match(src, /pending: 'web-app-access'/);
  assert.match(src, /process\.exitCode = 3/);
  assert.match(src, /--resume/);
  assert.match(src, /Who has access/);
  assert.match(src, /MANIFEST|沒有 access 欄位/, '要解釋為什麼 clasp/REST 設不了訪問權限');
});

test('bootstrap 設計：密鑰本端產生、可重試、以 pull 覆核（回應被 Google 吃掉也不丟密鑰）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /const token = readLocalToken\(\) \|\| randomBytes/, '已有 Bootstrap.gs 時要沿用同一個 SETUP_TOKEN');
  assert.match(src, /const secret = randomBytes\(32\)\.toString\('hex'\)/, '密鑰必須由本腳本產生，才不依賴回應內容');
  assert.match(src, /action: 'bootstrap', setup_token: token, secret, force: true/, '要帶 force，才能從「已送出但沒收到回應」的狀態復原');
  assert.match(src, /action: 'pull', device_id: 'deploy-probe', secret/, '覆核要用 pull（密鑰可用＝真的設好了）');
  assert.match(src, /通道沒關住/, 'push 掉 Bootstrap.gs 後要驗證通道真的關了');
  assert.match(src, /waitUntilReachable\(execUrl, RESUME \? 60 : 12\)/, 'resume 要給較長的等待');
});

test('憑證可「焊」在 .deploy/（gitignore 內）但必須 0600，且 clasp 走 devDependencies', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /join\(OUT, '\.clasprc\.json'\)/, 'AUTH 要優先認得 .deploy/.clasprc.json（重啟後不用重貼）');
  assert.match(src, /\/home\/user\/\.cache\/clasp\/\.clasprc\.json/, '仍保留 .cache 當備援（有人不想把它留在工作區）');
  assert.match(src, /node_modules', '\.bin', 'clasp'/, 'clasp 要能在 node_modules/.bin 找到（已是 devDependency）');
  assert.match(src, /clasp 未授權（憑證檔：' \+ AUTH/, '未授權時要說出用的是哪個憑證檔');
  assert.match(src, /安全註記：該檔=你的 Google 長期授權/, '把憑證留在工作區就必須同時寫明風險與撤回方式');

  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.devDependencies['@google/clasp'], 'clasp 沒入 devDependencies → 容器重啟後又得手動 npm i');
  assert.ok(readFileSync(join(ROOT, 'scripts', 'deps.mjs'), 'utf8').includes("'@google/clasp'"), 'deps.mjs 要會自癒 clasp');
  assert.ok(readFileSync(join(ROOT, '.gitignore'), 'utf8').includes('.deploy/'), '.deploy/ 必須整體 gitignore');

  const tracked = execFileSync('git', ['ls-files', '--', '.deploy', '*.clasprc.json'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(tracked, '', '憑證／密鑰檔被 git 追蹤了：' + tracked);
  const auth = join(ROOT, '.deploy', '.clasprc.json');
  if (existsSync(auth)) {
    const mode = statSync(auth).mode & 0o777;
    assert.equal(mode, 0o600, `.deploy/.clasprc.json 權限必須 0600（實得 ${mode.toString(8)}）`);
  }
});

test('gas/.claspignore 擋掉 clasp pull 產生同名的 .js（否則下次 push 就是重複定義）', () => {
  const ig = readFileSync(join(ROOT, 'gas', '.claspignore'), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  assert.ok(ig.includes('*.js'), 'gas/.claspignore 缺 *.js');
  for (const f of readdirSync(join(ROOT, 'gas'))) {
    if (f.endsWith('.js')) assert.fail(`gas/ 裡還留者 pull 回來的殘渣 ${f}（該刪掉）`);
  }
});

test('scope 未核准時要認出來並給出編輯器核准路徑（而不是空轉 60 次）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /do not have permission\|Authorization is required\|Required permissions/);
  assert.match(src, /Required permissions[\s\S]{0,120}break;/, '偵測到授權問題要立刻跳出重試迴圈，不要空轉 30 次');
  assert.match(src, /Review Permissions/);
  assert.match(src, /bootstrap 帶 force，重複執行是安全的/);
  assert.match(src, /不宣告 oauthScopes（交給 Google 自動推）/, '訊息要講清楚：不是叫人在 manifest 加 scope');
  assert.ok(!/JSON\.stringify\(\(r\.json \|\| r\.text \|\| ''\)\.toString\(\)/.test(src), '别再產生 [object Object] 這種錯誤訊息');
});

test('.githooks 內容齊備且有自愈路徑（mode 位會被容器還原洗掉，硬閘門是 CI）', () => {
  for (const f of ['pre-commit', 'post-checkout']) {
    const p2 = join(ROOT, '.githooks', f);
    assert.ok(existsSync(p2), `缺 .githooks/${f}`);
    const body = readFileSync(p2, 'utf8');
    assert.match(body, /^#!\/usr\/bin\/env bash/, `.githooks/${f} 沒 shebang`);
    assert.match(body, /set -euo pipefail/, `.githooks/${f} 少了 set -e（失敗不會擋）`);
  }
  assert.match(readFileSync(join(ROOT, '.gitignore'), 'utf8'), /dist\//, 'dist/ 不該入庫');
  // 可執行位不可靠（實測：容器重啟把 755 洗成 644，git 就靜默跳過鉤子）→ 必須有一條自我修復命令
  assert.match(readFileSync(join(ROOT, 'package.json'), 'utf8'), /"hooks":\s*"chmod \+x \.githooks/);
  // 真正的硬閘門在 CI：兩邊都要跑 check + test
  const y = readFileSync(join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');
  assert.match(y, /npm run check/);
  assert.match(y, /npm test/);
});

test('clasp 或憑證不在時要給可照抄的重建指令（沙箱重啟必現這狀態）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /function preflight\(\)/);
  assert.match(src, /if \(YES\) preflight\(\)/, '預覽模式不該被 preflight 擋（沒帳號也能看要做什麼）');
  assert.match(src, /憑證檔不存在/);
  assert.match(src, /CLASP_BIN=.*CLASP_AUTH=/s);
});

test('gas-verify.mjs 是「無憑證」的黑-box 健診，且包含通道是否關掉', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'gas-verify.mjs'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');  // 註解裡提到 clasp 不算
  assert.ok(!/clasp|refresh_token|oauth2\.googleapis\.com/.test(code), '健診不該需要 clasp 或憑證（否則沙箱重啟就驗不了）');
  for (const need of ['端點可匿名送達', '後端已設密鑰', 'bootstrap 通道已關閉', '密鑰可用（pull）', '雲端表格就緒（setup）', '錯密鑰被拒']) {
    assert.ok(src.includes(need), '少了檢查：' + need);
  }
  assert.match(src, /--write/, '真實往返寫入要用旗標明確開啟');
  assert.match(src, /process\.exit\(failed\.length \? 1 : 0\)/, '有不合格就要非零退出（CI 才能擋）');
});

test('密鑰要在 bootstrap 之前就落盤（否則中途失敗會造成雲端／本機對不上）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  const save = src.indexOf("saveState({ secret, sheets_ready: false, pending: 'bootstrap' })");
  const boot = src.indexOf('await bootstrapAndVerify(');
  assert.ok(save > 0, '少了「bootstrap 前先 saveState(secret)」');
  assert.ok(boot > 0 && save < boot, '落盤必須在送出密鑰之前');
  assert.match(src, /main\(\)\.catch[\s\S]{0,420}pending: prev\.pending \|\| 'incomplete'/, '中止時要把 pending 寫進去（但別蓋掉更精確的那個）');
});

test('關通道不能只靠 clasp push（它不會刪除雲端舊檔）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /async function deleteCloudFiles\(/, '少了 content API 補刀');
  assert.match(src, /script\.googleapis\.com\/v1\/projects\//, '要用 Apps Script REST 覆寫檔案清單');
  const del = src.indexOf('await deleteCloudFiles(');
  const probe = src.indexOf("action: 'bootstrap', setup_token: token, secret }");
  const redeploy = src.indexOf("create-deployment', '-i', deploymentId, '-d', 'close-bootstrap-channel'");
  assert.ok(del > 0 && probe > del && redeploy > 0 && redeploy < probe, '順序必須：移除檔案 → 發新版本 → 才驗通道');
  assert.match(src, /oauth2\.googleapis\.com\/token/, 'access token 要自己換（不依賴 clasp 內部）');
});

test('覆核失敗也要關掉一次性通道（否則設定面留在雲端）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  const caught = src.indexOf('catch (e) { bootError = e; }');
  const del = src.indexOf('await deleteCloudFiles(');
  const rethrow = src.indexOf('if (bootError) {');
  assert.ok(caught > 0 && del > caught, '關通道的步驟必須在 bootstrapAndVerify 的 catch 之後（失敗也照跑）');
  assert.ok(rethrow > del, '先關通道，再把原本的錯誤丟出去（順序颠倒就等于沒關）');
  assert.match(src, /pending: bootError\.message\.includes\('核准'\) \? 'scopes-consent'/, '卡在核准時要把 pending 寫成 scopes-consent');
});

test('clasp push 的冪等狀態（already up to date）不算失敗', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /already up to date/i, '沒認得「內容未變」這個合法輸出');
  assert.match(src, /Skipping push[\s\S]{0,160}互動確認擋下/, '「Skipping push.」仍要當成錯誤（那是 --force 沒生效）');
});

test('關通道要重試到看到 no-setup-token（版本固化是非同步的）', () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /channelClosed = closed\.json\?\.error === 'no-setup-token'/, '只認 no-setup-token；already-initialized 代表 Bootstrap 還在');
  assert.match(src, /close-bootstrap-channel-retry/, '探針失敗時要重發版本');
  assert.match(src, /for \(let i = 0; i < 5 && !channelClosed; i\+\+\)/, '要有重試迴圈（實測 @12 才删檔仍回報舊版本）');
});

test('gas/.clasp.template.json 是入庫的政策來源（CI 上沒有 .clasp.json 也要能驗 rootDir）', () => {
  const tpl = JSON.parse(readFileSync(join(ROOT, 'gas', '.clasp.template.json'), 'utf8'));
  assert.equal(tpl.rootDir, 'dist', 'template 的 rootDir 必須是 dist');
  assert.ok(!('scriptId' in tpl), 'template 不准含 scriptId（那是你專案的寫入座標）');
  const tracked = execFileSync('git', ['ls-files', '--', 'gas/.clasp.template.json'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.equal(tracked, 'gas/.clasp.template.json', 'template 必須入庫，否則 CI 讀不到就會 ENOENT（實測踩過）');
  const ignored = execFileSync('git', ['check-ignore', '-q', 'gas/.clasp.json'], { cwd: ROOT, encoding: 'utf8' });   // 逃不出非零代表沒 ignore？git 用 exit code 表達
  assert.equal(ignored.trim(), '', 'gas/.clasp.json 應被 gitignore');
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /writeClaspJson\(cfg\)/, 'create-script 之後要用 template 蓋回 rootDir（clasp 預設寫「.」）');
});
