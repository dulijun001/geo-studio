/* Staff PWA service worker.
 *
 * Strategy: stale-while-revalidate for HTML pages under /staff/*. Show whatever
 * we have in cache instantly (so offline = last-known tasks), kick off a
 * network refresh in the background, and update the cache when it lands. If
 * the network is down and there's no cache, fall back to a tiny offline
 * notice page.
 *
 * We deliberately don't cache POST (server actions, login). Auth + cookie
 * mutations need a real network round-trip.
 */
const CACHE = 'geo-staff-v1';
const OFFLINE_FALLBACK = '/staff';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(['/manifest.webmanifest', '/icon-192.svg', '/icon-512.svg']),
    ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Only intercept /staff/* navigation + assets.
  const isStaffPath = url.pathname === '/staff' || url.pathname.startsWith('/staff/');
  const isAsset = url.pathname.endsWith('.svg') || url.pathname.endsWith('.webmanifest');
  if (!isStaffPath && !isAsset) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const networkPromise = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            cache.put(req, res.clone()).catch(() => undefined);
          }
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Don't await — let the cache update happen in the background.
        event.waitUntil(networkPromise.catch(() => undefined));
        return cached;
      }

      const networkRes = await networkPromise;
      if (networkRes) return networkRes;

      // Last resort: cached fallback page.
      const fallback = await cache.match(OFFLINE_FALLBACK);
      if (fallback) return fallback;
      return new Response(
        '<!DOCTYPE html><meta charset="utf-8"><title>离线</title><div style="font-family:system-ui;padding:32px;text-align:center"><h1>暂时离线</h1><p>没有缓存的任务列表。等网络恢复再刷新。</p></div>',
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
      );
    })(),
  );
});
