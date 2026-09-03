// tests/harness.mjs — 把瀏覽器版 JS 直接跑在 node（同一份檔，不是另寫「測試版」）
// vm context + 最小 fake IndexedDB，讓 db.js / data-layer.js / sync-manager.js 的真實碼被執行。
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// tsc 逐檔輸出的 JS（不是 rollup bundle）：測試要「只載入这几個模組」，用 bundle 會把 app.ts 的啟動副作用也拖進來
const FILES = ['dates.js', 'game-core.js', 'db.js', 'data-layer.js', 'gas-proxy.js', 'sync-manager.js', 'game-engine.js'];

const microtask = (fn) => Promise.resolve().then(fn);

/** 本地檔一律從磁碟讀；其他（GAS）交給測試注入的 fetchImpl */
const fileFetch = async (u) => {
  const body = readFileSync(join(ROOT, String(u).replace(/^\.?\//, '')), 'utf8');
  return { ok: true, status: 200, json: async () => JSON.parse(body), text: async () => body };
};
function wrapFetch(fetchImpl) {
  if (!fetchImpl) return fileFetch;
  return async (u, init = {}) => {
    const s = String(u);
    if (!/^(https?:)?\/\//.test(s)) return fileFetch(s, init);   // data/*.json 等相對路徑
    if (/^https?:\/\/example\.test\//.test(s)) return fileFetch(s, init);
    return fetchImpl(s, init);
  };
}

/** 只做 db.js 用到的那三個操作；資料放記憶體，跨 reload 用 __dump/__restore 模擬 */
function fakeIndexedDB() {
  const stores = new Map();                    // dbName -> Map(store -> Map(key -> value))
  const storeFor = (db, name) => {
    if (!stores.has(db)) stores.set(db, new Map());
    const m = stores.get(db);
    if (!m.has(name)) m.set(name, new Map());
    return m.get(name);
  };
  return {
    __stores: stores,
    __dump(db, name, key) { const v = storeFor(db, name).get(key); return v; },
    open(dbName) {
      const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: null };
      const db = {
        objectStoreNames: { contains: (s) => (stores.get(dbName) || new Map()).has(s) },
        createObjectStore(s) { storeFor(dbName, s); return {}; },
        transaction(storeName) {
          const data = storeFor(dbName, storeName);
          return {
            objectStore: () => ({
              get(k) { const r = { onsuccess: null, onerror: null, result: data.has(k) ? data.get(k) : undefined }; microtask(() => r.onsuccess && r.onsuccess({ target: r })); return r; },
              put(v, k) { const r = { onsuccess: null, onerror: null }; data.set(k, v); microtask(() => r.onsuccess && r.onsuccess({ target: r })); return r; },
              delete(k) { const r = { onsuccess: null, onerror: null }; data.delete(k); microtask(() => r.onsuccess && r.onsuccess({ target: r })); return r; },
            }),
          };
        },
      };
      req.result = db;
      storeFor(dbName, 'kv');
      microtask(() => req.onsuccess && req.onsuccess({ target: req }));
      return req;
    },
  };
}

export async function makeApp({ fetchImpl, seedDeviceId } = {}) {
  const initSqlJs = require('sql.js');
  const ctx = {
    console, JSON, Math, Date, Promise, Uint8Array, ArrayBuffer, SharedArrayBuffer: undefined,
    TextEncoder, TextDecoder, Error, String, Number, Object, Array, Set, Map, RegExp, Boolean, Symbol,
    parseInt, parseFloat, isNaN, isFinite, Infinity, NaN, encodeURIComponent, decodeURIComponent,
    setTimeout: global.setTimeout, clearTimeout: global.clearTimeout, setInterval: () => () => {}, clearInterval: () => {},
    crypto: globalThis.crypto, AbortController, AbortSignal, Blob: globalThis.Blob, URL: globalThis.URL, Response: globalThis.Response, Request: globalThis.Request, Headers: globalThis.Headers, structuredClone: globalThis.structuredClone,
    indexedDB: fakeIndexedDB(),
    navigator: { onLine: true, storage: { persist: async () => true, persisted: async () => true } },
    fetch: wrapFetch(fetchImpl),
    location: { reload() {}, href: 'https://example.test/', origin: 'https://example.test' },
    sessionStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: false }),
    addEventListener() {},
    document: {
      addEventListener() {}, visibilityState: 'visible',
      querySelectorAll: () => [], getElementById: () => null,
      createElement: () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {} }),
    },
  };
  ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(readFileSync(join(ROOT, 'build', 'ts', f), 'utf8'), ctx, { filename: 'build/ts/' + f });

  const SQL = await initSqlJs({ locateFile: (file) => join(ROOT, 'node_modules', 'sql.js', 'dist', file) });
  await ctx.DBManager.init({ SQL });
  await ctx.GameEngine.loadConfig(ctx.fetch);
  if (seedDeviceId) await ctx.DataLayer.setSetting('device_id', seedDeviceId);
  return {
    ctx, SQL,
    cleanup: () => ctx.DBManager.close(),
    /** 模擬「重開 App」：把整庫從 IDB 讀回來（走真實的 reloadFromIdb 路徑） */
    reopen: async () => {
      await ctx.DBManager.flushNow();
      const ok = await ctx.DBManager.reloadFromIdb();
      return ok;
    },
  };
}
