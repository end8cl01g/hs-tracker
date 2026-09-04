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

test.skip('（待遷移）index.html 提示文字與「複製診斷」按鈕 —— 設定頁尚未搬進 Skyrim 前端（舊前端已捨棄），搬回來時解開這條', () => {});
