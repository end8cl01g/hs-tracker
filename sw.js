/* sw.js — Service Worker（離線殼 + 設定檔 network-first）
 * 原規格致命缺陷 todo 1.1：Prompt.md 內 `grep -c serviceWorker` = 0，從頭到尾沒有 register() →
 * 本 SW 永遠不會被安裝，「離線可用 / WASM 快取」全部不成立。修在 js/app.js 的 registerServiceWorker()。
 * todo 1.8：VERSION 由 CI 在部署前注入（build 號 = git sha），避免 cache-first 殼永遠卡舊版。
 * todo 1.9：GAS 呼叫一律 bypass 快取且不改寫失敗 → 同步錯誤必須能被前端看見。
 */
const VERSION = '__BUILD__';
const CACHE = `hs-tracker-${VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './manifest.json',
  './vendor/sql-wasm.js',
  './vendor/sql-wasm.wasm',
  './js/dates.js',
  './js/game-core.js',
  './js/build-info.js',
  './js/db.js',
  './js/data-layer.js',
  './js/gas-proxy.js',
  './js/sync-manager.js',
  './js/game-engine.js',
  './js/animations.js',
  './js/ui.js',
  './js/backup.js',
  './js/app.js',
  './data/workout.json',
  './data/skills.json',
  './data/badges.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch((e) => { console.error('[sw] install 失敗（會保留舊快取）：', e); throw e; })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isConfigJson = (url) => url.origin === self.location.origin && /\/data\/[^/]+\.json$/.test(url.pathname);
const isGasCall = (req, url) => req.method !== 'GET' || /\/macros\/s\//.test(url.href);

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;               // POST（GAS 同步）不攔截、不改寫
  const url = new URL(req.url);
  if (isGasCall(req, url)) return;                // 雲端：永不吞錯

  // 設定檔：網路優先，失敗退回快取（todo：更新只靠這一路徑生效）
  if (isConfigJson(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error()))
    );
    return;
  }

  // App 殼：快取優先，miss 時回 network 並回填
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
        }
        return res;
      }))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
