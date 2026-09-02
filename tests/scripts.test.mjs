// tests/scripts.test.mjs — 部署腳本本身也要有測試：未授權時必須「只預覽、不動作」
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

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
  const r = run('bash', ['scripts/ship.sh'], { GITHUB_TOKEN: '', GH_TOKEN_FILE: '', GH_TOKEN: '' });
  assert.equal(r.code, 2, r.out);
  assert.match(r.out, /personal-access-tokens\/new/);
  assert.match(r.out, /Contents/);
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
  assert.ok(!existsSync(join(ROOT, 'gas', 'Bootstrap.gs')), 'Bootstrap.gs 不該留在 repo（部署腳本會臨時產生）');
});

test('gas/.claspignore 不會把四個 .gs 擋掉（擋了就是 push 出空專案）', () => {
  const p = join(ROOT, 'gas', '.claspignore');
  assert.ok(existsSync(p), '缺 gas/.claspignore');
  const lines = readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  for (const f of ['Code.gs', 'Sheets.gs', 'Config.gs', 'Utils.gs', 'appsscript.json']) {
    assert.ok(!lines.includes(f) && !lines.includes('*.gs') && !lines.includes('**/*'), `${f} 被 .claspignore 擋掉了`);
  }
});

test('deploy-gas.mjs 解析不到 deploymentId 時會明確失敗而不是亂猜 URL', async () => {
  const src = readFileSync(join(ROOT, 'scripts', 'deploy-gas.mjs'), 'utf8');
  assert.match(src, /無法從 clasp 輸出解析 deploymentId/);
  assert.match(src, /DEPLOYMENT_ID=/, '解析失敗要留一条手動指定的活路');
  assert.match(src, /parseDeploymentId\(dep\) \|\| parseDeploymentId\(listed\)/, '兩個輸出都要試，別只認一種格式');
  assert.match(src, /bootstrap 失敗/);
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
