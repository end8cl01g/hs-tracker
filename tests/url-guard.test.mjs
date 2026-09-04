// tests/url-guard.test.mjs — 把「貼錯 GAS URL」這個真實事故變成可跑的測試。
// 起因：使用者把 script.googleusercontent.com/macros/echo?…（一次性回覆快照）貼進 App，
// 結果就是「輸入了不能同步」，而端點本身完全健康。光靠 grep 源碼抓不到這種行為，
// 所以這裡用 vm 把 build/ts/gas-proxy.js 載進迷你 window，塞假 fetch，真的跑一次。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXEC = 'https://script.google.com/macros/s/AKfycbXYZ/exec';

function load(stub = {}) {
  const w = {
    fetch: async () => ({ ok: true, status: 200, url: EXEC, text: async () => '{"ok":true}' }),
    AbortController, setTimeout, clearTimeout,
    DataLayer: {
      s: { gas_url: EXEC, gas_secret: 'a'.repeat(64), device_id: 'uuid-1' },
      getSetting(k) { return Promise.resolve(this.s[k] ?? null); },
      setSetting(k, v) { this.s[k] = v; return Promise.resolve(); },
    },
    crypto: { randomUUID: () => 'uuid-1' },
  };
  Object.assign(w, stub);
  w.window = w; w.globalThis = w;
  runInContext(readFileSync(join(ROOT, 'build', 'ts', 'gas-proxy.js'), 'utf8'), createContext(w), { filename: 'gas-proxy.js' });
  return { G: w.GASProxy, w };
}

test('cleanUrl：從聊天室/markdown 複製進來的垃圾要被剝掉，但不能動正常 URL', () => {
  const { G } = load();
  assert.equal(G.cleanUrl(`  \`${EXEC}\` ） `), EXEC, '反引號／全形括號／換行都要清掉');
  assert.equal(G.cleanUrl(`<${EXEC},`), EXEC, '尖括號與逗號結尾');
  assert.equal(G.cleanUrl(EXEC), EXEC, '正常的不能被他動到');
  assert.equal(G.cleanUrl(''), '', '空＝離線模式，不是錯誤');
  assert.equal(G.cleanUrl(null), '', 'null 不能炸');
});

test('urlProblem：三種常見誤貼都要攔下並講人話', () => {
  const { G } = load();
  assert.equal(G.urlProblem(EXEC), null);
  assert.match(G.urlProblem('https://script.googleusercontent.com/macros/echo?user_content_key=x&lib=1'), /echo 連結/);
  assert.match(G.urlProblem('https://script.google.com/macros/s/AKfycbXYZ/dev'), /\/dev/);
  assert.match(G.urlProblem('https://example.com/webhook'), /\/exec/);
});

test('貼了 echo 快照時：不准把請求發出去，錯誤要標成 bad-url', async () => {
  let sent = 0;
  const { G, w } = load({ fetch: async () => { sent++; return { ok: false, status: 405, url: 'x', text: async () => '<html>' }; } });
  w.DataLayer.s.gas_url = 'https://script.googleusercontent.com/macros/echo?user_content_key=x';
  await assert.rejects(() => G.call('pull', {}), (e) => {
    assert.equal(e.kind, 'bad-url');
    assert.match(e.message, /一次性快照/);
    return true;
  });
  assert.equal(sent, 0, '已知是壞 URL 還發請求，使用者只會多等一個 timeout');
});

test('GAS 回 HTML 時，錯誤訊息要自帶證據（不然回報時我們要重猜）', async () => {
  const mk = (status, body) => load({ fetch: async () => ({ ok: status < 400, status, url: EXEC, text: async () => body }) });
  const a = mk(405, '<!DOCTYPE html><html><body>x');
  await assert.rejects(() => a.G.call('pull', {}), (e) => { assert.equal(e.kind, 'http'); assert.match(e.message, /405/); assert.match(e.message, /HTML/); return true; });
  const b = mk(200, '<html>login</html>');
  await assert.rejects(() => b.G.call('pull', {}), (e) => { assert.equal(e.kind, 'parse'); assert.match(e.message, /不是 JSON/); return true; });
});

// ── 設定卷軸（舊前端捨棄後，這些能力必須在新前端還原；下面四條就是「還原了沒」的證據）──
const settingsSrc = readFileSync(join(ROOT, 'src', 'skyrim', 'components', 'SkyrimSettings.tsx'), 'utf8');
const appSrc = readFileSync(join(ROOT, 'src', 'App.tsx'), 'utf8');
const storeSrc = readFileSync(join(ROOT, 'src', 'skyrim', 'store.ts'), 'utf8');

test('設定卷軸要有「複製診斷」，且剪貼簿不可用時得把文字摊在畫面上', () => {
  assert.match(settingsSrc, /doDiag/, '沒有複製診斷的處理函式');
  assert.match(settingsSrc, /copyText\(/, '要真的寫剪貼簿');
  assert.match(settingsSrc, /<pre[^>]*>\s*\{diag\}\s*<\/pre>/, '剪貼簿失敗（iOS Safari 非安全上下文會拒絕）時要能看到並手動複製這段文字');
  assert.match(storeSrc, /navigator\.clipboard\.writeText/, 'copyText 要走 navigator.clipboard，且回傳成不成功（不能假稱已複製）');
});

test('提示文字不准叫使用者去跑底線開頭的 private 函式（Apps Script Run 選單裡根本沒有）', () => {
  const idx = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const [name, src] of [['SkyrimSettings.tsx', settingsSrc], ['index.html', idx], ['App.tsx', appSrc]]) {
    const visible = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const bad = [...visible.matchAll(/[「『]([^」』\n]{0,40}_\w+[^」』\n]{0,40})[」』]/g)].map((m) => m[1]);
    assert.deepEqual(bad, [], `${name} 的介面文案叫使用者跑底線開頭的函式：${bad.join(' / ')}`);
  }
});

test('同步三態 ok/partial/error 必須看得見（未設定雲端不能顯示成已同步）', () => {
  for (const k of ['ok', 'partial', 'error', 'disabled', 'syncing']) {
    assert.match(storeSrc, new RegExp(`${k}:\\s*['\`"][^'\`"]+['\`"]`), `SYNC_LABEL 少了 ${k} 的文案`);
  }
  assert.match(appSrc, /subscribeSync\(setSync\)/, 'App 要訂閱 SyncManager 的狀態');
  assert.match(appSrc, /SYNC_LABEL\[sync\.status\]/, '狀態要進頂欄（Compass 副標）');
  // 關鍵：sync-manager 自己必須把 truncated 折成 partial（前端只是顯示，規則不在前端重寫）
  const sm = readFileSync(join(ROOT, 'src', 'sync-manager.ts'), 'utf8');
  assert.match(sm, /report\.truncated \? 'partial' : 'ok'/, '佇列沒清空卻顯示已同步，就是騙人');
});

test('引擎依賴 global.UI（toast/confirm/refresh）——新前端必須裝 shim，否則匯出成功後才崩', () => {
  assert.match(storeSrc, /export function installUiShim\(\)/, 'store.ts 要提供 UI shim');
  assert.match(appSrc, /installUiShim\(\)/, 'App 要在掛載時裝上（先裝才有人 call UI.toast）');
  const bk = readFileSync(join(ROOT, 'src', 'backup.ts'), 'utf8');
  assert.match(bk, /global\.UI\?\.confirm \? await global\.UI\.confirm\(/, '匯入的整庫取代確認要優先走 UI shim（Skyrim 框），沒 shim 才退回原生 confirm');
  assert.match(bk, /if \(!global\.UI\.softReload\) setTimeout\(\(\) => location\.reload\(\), 600\)/, 'SPA 能自己重抓就別整頁 reload');
  assert.ok(settingsSrc.includes("from '../store'"), '設定頁只經 store.ts 使喚引擎，不另寫一套存檔邏輯');
});
