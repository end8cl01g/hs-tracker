// tests/sw.test.mjs — 在 node 裡用假 Cache/Fetch 執行「真實的 sw.js」
// 驗 4 件事：PRECACHE 完整性（原規格列了 cdnjs 檔 → 離線首載必掛）、data/ network-first、
// GAS 請求不進快取、快取 key 隨 build 變（否則改版無效）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function makeCacheStore() {
  const store = new Map();                      // cache name -> { __map, addAll, put, match }
  const SW_BASE = 'https://me.github.io/hs-tracker/sw.js';
  const keyOf = (req) => {
    const u = typeof req === 'string' ? req : req && req.url;
    if (!u) return u;
    try { return new URL(u, SW_BASE).href; }    // 瀏覽器行為：相對 SW scope 解析
    catch { return u; }
  };
  function mkCache(name) {
    if (!store.has(name)) {
      const map = new Map();
      store.set(name, {
        name,
        __map: map,
        addAll: async (urls) => { for (const u of urls) { const k = keyOf(u); if (!map.has(k)) map.set(k, { body: 'pre-' + k, ok: true, headers: { get: () => 'text/plain' } }); } },
        put: async (req, res) => { map.set(keyOf(req), res); },
        match: async (req) => map.get(keyOf(req)) || undefined,
        keys: async () => [...map.keys()].map((k) => ({ url: k })),
      });
    }
    return store.get(name);
  }
  return {
    caches: {
      open: async (n) => mkCache(n),
      keys: async () => [...store.keys()],
      delete: async (n) => store.delete(n),
      match: async (req) => { for (const c of store.values()) { const hit = c.__map.get(keyOf(req)); if (hit) return hit; } return undefined; },
      __store: store,
    },
    mkCache,
  };
}

/** 把 sw.js 跑起來，回傳觸發器 */
function loadSW({ build = 'test-build', fetchImpl } = {}) {
  const src = readFileSync(join(ROOT, 'sw.js'), 'utf8').replace("'__BUILD__'", `'${build}'`);
  const { caches } = makeCacheStore();
  const events = {};
  const calls = { fetch: 0, respondWith: [] };
  const ctx = {
    console, JSON, Math, Date, Promise, String, Number, Object, Array, Set, Map, Response: globalThis.Response, Request: globalThis.Request,
    URL, TextEncoder, Error, Blob: globalThis.Blob, AbortController,
    caches,
    location: { origin: 'https://me.github.io', href: 'https://me.github.io/hs-tracker/sw.js' },
    self: null,
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: async () => [] },
    fetch: async (req) => { calls.fetch++; return fetchImpl ? fetchImpl(req) : { ok: true, status: 200, cloned: false, clone() { return this; }, headers: { get: () => 'application/json' } }; },
    addEventListener: (type, fn) => { (events[type] = events[type] || []).push(fn); },
  };
  ctx.self = ctx; ctx.globalThis = ctx; ctx.serviceWorker = ctx;
  ctx.location = ctx.location || { origin: 'https://me.github.io', href: 'https://me.github.io/hs-tracker/sw.js' };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'sw.js' });

  const ev = (init) => ({ ...init, respondWith: (p) => calls.respondWith.push(p), waitUntil: (p) => (calls.waitUntil = p) });
  return {
    ctx, caches, calls,
    install: async () => { for (const fn of events.install || []) fn(ev({})); await calls.waitUntil; },
    activate: async () => { for (const fn of events.activate || []) fn(ev({})); await calls.waitUntil; },
    fetchEvent: async (req) => {
      calls.respondWith = [];
      for (const fn of events.fetch || []) fn(ev({ request: req }));
      if (!calls.respondWith.length) return null;
      return await calls.respondWith[0];
    },
  };
}

const req = (url, method = 'GET') => ({ url, method, headers: { get: () => null }, clone() { return this; } });

test('PRECACHE 不含任何外部 CDN，且每一項在 repo 裡都存在', async () => {
  const src = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const list = [...src.matchAll(/'\.\/([^']+)'/g)].map((m) => m[1]);
  assert.ok(list.length >= 20, `PRECACHE 太少（${list.length}）：shell 必須完整預熱`);
  assert.ok(!/cdnjs|jsdelivr|unpkg|https:/.test(src.split('const PRECACHE')[1].split('];')[0]), 'PRECACHE 混入外部 URL');
  for (const f of list) assert.ok(existsSync(join(ROOT, f)), `PRECACHE 列了不存在的 ${f} → cache.addAll 會整批失敗，SW 卡在同一版本`);
  assert.ok(list.includes('vendor/sql-wasm.wasm') && list.includes('vendor/sql-wasm.js'), 'WASM 沒進 PRECACHE → 離線開不起來（todo 1.2/1.1）');
});

test('install 用同一個 build 代號當 cache key，activate 清掉舊 key（todo 1.8）', async () => {
  const sw = loadSW({ build: 'b1' });
  await sw.install();
  const keys = await sw.caches.keys();
  assert.deepEqual(keys, ['hs-tracker-b1'], `實際：${keys}`);
  // 佈署新版本：舊 cache 必須被清掉，否則永遠抓舊殼
  const sw2 = loadSW({ build: 'b2' });
  await sw2.caches.open('hs-tracker-b1');                  // 上一版留下的舊 cache
  assert.ok((await sw2.caches.keys()).includes('hs-tracker-b1'), '前置條件：舊 key 存在');
  await sw2.install();                                     // 新版裝進來了
  assert.ok((await sw2.caches.keys()).includes('hs-tracker-b2'), 'install 後要有新 key');
  await sw2.activate();
  assert.ok(!(await sw2.caches.keys()).includes('hs-tracker-b1'), 'activate 必須清掉舊 cache，否則改版無效');
  assert.ok((await sw2.caches.keys()).includes('hs-tracker-b2'), '新 cache 要留著');
});

test('data/*.json 走 network-first：成功時回填快取（改 JSON 一個 visit 內生效）', async () => {
  let mode = 'online';
  const sw = loadSW({ fetchImpl: async () => mode === 'online'
    ? { ok: true, status: 200, clone() { return this; }, json: async () => ({ v: 2 }), text: async () => '{"v":2}' }
    : (() => { throw new Error('offline'); })() });
  await sw.install();
  const url = 'https://me.github.io/hs-tracker/data/workout.json';
  let res = await sw.fetchEvent(req(url));
  assert.equal(sw.calls.fetch, 1, '首次應打網路');
  const cacheName = (await sw.caches.keys())[0];
  assert.ok((await sw.caches.open(cacheName)).__map.has(url), '網路成功後必須回填快取');

  mode = 'offline';
  res = await sw.fetchEvent(req(url));
  assert.ok(res, '離線時要能從快取拿到');
});

test('離線且沒快取時回 Response.error()，不能回 200 假資料', async () => {
  const sw = loadSW({ fetchImpl: async () => { throw new Error('offline'); } });
  const res = await sw.fetchEvent(req('https://me.github.io/hs-tracker/data/skills.json'));
  assert.ok(res, '應有回應物件');
  assert.equal(res.ok === undefined ? false : res.ok, false, '不能偽造 ok:true');
});

test('shell 走 cache-first：命中快取就不打網路', async () => {
  const sw = loadSW();
  await sw.install();
  const res = await sw.fetchEvent(req('https://me.github.io/hs-tracker/js/db.js'));
  assert.equal(sw.calls.fetch, 0, 'cache-first 命中時不該發 fetch');
  assert.ok(res, '要拿到殼檔');
  assert.match(res.body, /^pre-.*\/js\/db\.js$/, `快取命中的应是解析後的絕對 URL，實得：${res.body}`);
});

test('GAS 請求完全不攔截：POST 必須放行（否則同步錯誤會被快取吞掉，todo 1.9）', async () => {
  const sw = loadSW();
  const gasPost = 'https://script.google.com/macros/s/abc/exec';
  const res1 = await sw.fetchEvent(req(gasPost, 'POST'));
  assert.equal(res1, null, 'POST 不得被 respondWith 改寫');
  const res2 = await sw.fetchEvent(req(gasPost, 'GET'));
  assert.equal(res2, null, 'GAS GET 也不准被快取改寫（拿到的是 302 後的內容）');
  // 跨源非 GAS 的 GET（例如別人貼的圖）也不攔截
  const res3 = await sw.fetchEvent(req('https://other.example/x.png', 'GET'));
  assert.equal(res3, null);
});

test('sw.js 不準把 index.html 快取成強佔（navigation 仍走原樣）', async () => {
  const sw = loadSW();
  await sw.install();
  const res = await sw.fetchEvent(req('https://me.github.io/hs-tracker/index.html'));
  assert.ok(res, 'index.html 要能被殼快取提供（離線首頁）');
});
