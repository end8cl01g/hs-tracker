// tests/gas-boot.test.mjs — 真的把 Code.gs + Utils.gs 放進 vm 裡跑 handle_，
// 專門驗「部署时序」：bootstrap 通道必須在「還沒有密鑰」時可用、之後立刻關閉。
// （這是上一輪靜態檢查抓不到的那類 bug：路由写在密鑰閘門後面，永遠進不去。）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, 'gas', f), 'utf8');

function makeEnv({ setupToken } = {}) {
  const store = new Map();
  const calls = { ensureSheets: 0, push: 0 };
  const ctx = createContext({
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (store.has(k) ? store.get(k) : null),
        setProperty: (k, v) => store.set(k, String(v)),
        deleteProperty: (k) => store.delete(k),
      }),
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (s) => ({ _s: s, setMimeType() { return this; }, getContent() { return this._s; } }),
    },
    Utilities: {
      getUuid: () => 'aaaaaaaa-bbbb-cccc-dddd-' + String(store.size).padStart(12, '0'),
      base64EncodeWebSafe: (b) => Buffer.from(b).toString('base64url'),
      computeDigest: (_alg, raw) => Array.from(raw).map((c) => c & 0x7f),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
    },
    Logger: { log: () => {} },
    console: { log: () => {} },
    HEADERS: { Changes: [], Backups: [], Meta: [] },
    CONFIG_BASE_URL: 'https://example.github.io/hs-tracker/data',
  });
  const stubs = `
    function ensureSheets_() { globalThis.__calls.ensureSheets++; return { ok: true, sheets: ['Changes','Backups','Meta'] }; }
    function pushRows_(d, tables) { globalThis.__calls.push++; return { ok: true, accepted: Object.keys(tables || {}).length }; }
    function pullRows_(since) { return { ok: true, rows: {} }; }
    function getConfigs_() { return { ok: true, configs: {} }; }
    function saveBackup_() { return { ok: true }; }
    function latestBackup_() { return { ok: false, error: 'no-backup' }; }
    function allowRateOverride_(v) { globalThis.__rate = v; }
  `;

  ctx.__calls = calls;
  runInContext(
    [read('Utils.gs'), setupToken ? `const SETUP_TOKEN = ${JSON.stringify(setupToken)};` : '', read('Code.gs'), stubs].join('\n'),
    ctx,
    { filename: 'gas-combined.gs' },
  );
  const post = (body) => {
    const out = ctx.handle_({ postData: { contents: JSON.stringify(body) } });
    return JSON.parse(out.getContent());
  };
  return { ctx, post, store, calls };
}

test('未初始化時：除了 bootstrap 以外全部拒絕，但 ping 要回可判讀的狀態', () => {
  const { post } = makeEnv();
  const push = post({ action: 'push', device_id: 'dev-a', tables: { workout_logs: [] } });
  assert.equal(push.ok, false);
  assert.equal(push.error, 'secret-not-configured');
  const ping = post({ action: 'ping', device_id: 'dev-a' });
  assert.equal(ping.error, 'secret-not-configured');
  assert.equal(ping.secret_configured, false, 'ping 要讓 App 知道「後端還沒設好」而不是含糊失敗');
});

test('bootstrap：token 不對就拒絕、對就寫入密鑰並建表，且通道随即關閉', () => {
  const TOKEN = 'setup-token-abc';
  const { post, store, calls } = makeEnv({ setupToken: TOKEN });

  const bad = post({ action: 'bootstrap', setup_token: 'wrong' });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, 'bad-setup-token');
  assert.equal(store.has('SHARED_SECRET'), false, 'token 錯時不得寫入密鑰');

  const ok = post({ action: 'bootstrap', setup_token: TOKEN });
  assert.equal(ok.ok, true, JSON.stringify(ok));
  assert.match(ok.secret, /^[0-9a-f]{32,}$/);
  assert.equal(ok.sheets_ready, true);
  assert.equal(calls.ensureSheets, 1);
  assert.equal(store.get('SHARED_SECRET'), ok.secret);

  const again = post({ action: 'bootstrap', setup_token: TOKEN });
  assert.equal(again.error, 'already-initialized', '密鑰設好後 bootstrap 必須關閉');

  // 拿到密鑰之後才通得過
  assert.equal(post({ action: 'push', device_id: 'dev-a', secret: 'nope', tables: {} }).error, 'unauthorized');
  const good = post({ action: 'push', device_id: 'dev-a', secret: ok.secret, tables: { workout_logs: [] } });
  assert.equal(good.ok, true);
  assert.equal(calls.push, 1);
});

test('沒有 Bootstrap.gs（SETUP_TOKEN 未定義）時，bootstrap 回可指引的錯誤而不是炸', () => {
  const { post } = makeEnv();
  const r = post({ action: 'bootstrap', setup_token: 'x' });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'no-setup-token');
  assert.match(r.hint, /deploy-gas\.mjs/);
});

test('節流用 Properties（不是 CacheService），超數回 rate-limited + retry_after_s', () => {
  const TOKEN = 'tk';
  const { post, ctx, store } = makeEnv({ setupToken: TOKEN });
  const secret = post({ action: 'bootstrap', setup_token: TOKEN }).secret;
  store.set('MAX_REQ_PER_HOUR', '2');
  for (let i = 0; i < 3; i++) {
    const r = post({ action: 'pull', device_id: 'dev-r', secret });
    if (i < 2) assert.equal(r.ok, true, `第 ${i + 1} 次不該被擋：${JSON.stringify(r)}`);
    else {
      assert.equal(r.error, 'rate-limited');
      assert.ok(r.retry_after_s > 0);
    }
  }
  assert.ok([...store.keys()].some((k) => k.startsWith('RATE_dev-r_')), '計數要存在 Properties，才不會被 CacheService FIFO 逐出');
  const utils = read('Utils.gs');
  assert.ok(!/CacheService\s*\.\s*(get|put|remove)/.test(utils), 'allowRate_ 不能用 CacheService（6h 上限 + FIFO 逐出會讓計數消失）');
  assert.match(/function allowRate_[\s\S]*?\n}/.exec(utils)[0], /PropertiesService/);
  void ctx;
});

test('body 不是 JSON 時回 bad-request（不讓 500 洩出去）', () => {
  const { ctx } = makeEnv();
  const out = ctx.handle_({ postData: { contents: '{不是JSON' } });
  const r = JSON.parse(out.getContent());
  assert.equal(r.ok, false);
  assert.equal(r.error, 'bad-request');
});

// ---- 本輪新增：密鑰由部署腳本帶來（回應被 Google 吃掉也能復原）----
test('bootstrap 可帶自製密鑰：寫入後用同一密鑰立刻可用', () => {
  const TOKEN = 'tk-A';
  const { post, store } = makeEnv({ setupToken: TOKEN });
  const mine = 'a'.repeat(64);
  const r = post({ action: 'bootstrap', setup_token: TOKEN, secret: mine });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(r.secret, mine, '要原樣回傳我們送的密鑰');
  assert.equal(store.get('SHARED_SECRET'), mine);
  assert.equal(post({ action: 'push', device_id: 'd', secret: mine, tables: {} }).ok, true);
});

test('太短的密鑰要拒，而且不得動到既有 Property', () => {
  const TOKEN = 'tk-B';
  const { post, store } = makeEnv({ setupToken: TOKEN });
  const r = post({ action: 'bootstrap', setup_token: TOKEN, secret: 'letmein' });
  assert.equal(r.error, 'weak-secret');
  assert.equal(store.has('SHARED_SECRET'), false, '拒絕時不能已經寫進去');
});

test('已設定密鑰後：只有「對的 SETUP_TOKEN ＋ force」能輪替；錯 token 帶 force 也照樣拒', () => {
  const TOKEN = 'tk-C';
  const { post, store } = makeEnv({ setupToken: TOKEN });
  const first = post({ action: 'bootstrap', setup_token: TOKEN, secret: 'b'.repeat(64) }).secret;
  assert.equal(post({ action: 'bootstrap', setup_token: TOKEN, secret: 'c'.repeat(64) }).error, 'already-initialized');
  const rot = post({ action: 'bootstrap', setup_token: TOKEN, secret: 'c'.repeat(64), force: true });
  assert.equal(rot.ok, true, JSON.stringify(rot));
  assert.equal(rot.rotated, true);
  assert.equal(store.get('SHARED_SECRET'), 'c'.repeat(64));
  assert.equal(post({ action: 'push', device_id: 'd', secret: first }).error, 'unauthorized', '舊密鑰應該立刻失效');
  const evil = post({ action: 'bootstrap', setup_token: 'wrong', secret: 'd'.repeat(64), force: true });
  assert.equal(evil.error, 'bad-setup-token', 'force 不能繞過 token 檢查');
  assert.equal(store.get('SHARED_SECRET'), 'c'.repeat(64));
});

test('ensureSheets_ 失敗時仍回 ok 但 sheets_ready:false（密鑰已生效，建表可補）', () => {
  const TOKEN = 'tk-D';
  const { post, ctx } = makeEnv({ setupToken: TOKEN });
  ctx.__boom = true;
  // 把 stub 換成會丟的版本再重跑一次 bootstrap
  runInContext('function ensureSheets_() { throw new Error("quota"); }', ctx);
  const r = post({ action: 'bootstrap', setup_token: TOKEN, secret: 'e'.repeat(64) });
  assert.equal(r.ok, true, '建表失敗不該讓密鑰設定一起失敗（否則只能回編輯器手動處理）');
  assert.equal(r.sheets_ready, false);
});
