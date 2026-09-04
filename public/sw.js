/*
 * Service-Worker kill-switch (legacy hs-tracker PWA migration).
 *
 * The previous app (Press to Handstand Tracker) installed a precaching
 * service worker that kept serving its cached shell from Cache Storage
 * even after the codebase was replaced. This file takes over the old
 * sw.js URL so the browser's update check installs it, then:
 *   1. deletes EVERY Cache Storage bucket (old `hs-tracker-*` precaches),
 *   2. unregisters itself, and
 *   3. reloads open tabs so they fall back to the network.
 *
 * Nothing registers this worker on purpose: it only exists to clean up
 * installs of the legacy worker. New visitors never touch it.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        // ignore: best-effort cleanup
      }
      try {
        await self.registration.unregister();
      } catch (e) {
        // ignore
      }
      try {
        const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of cs) {
          if (typeof c.navigate === 'function') c.navigate(c.url).catch(() => {});
        }
      } catch (e) {
        // ignore
      }
    })()
  );
});
