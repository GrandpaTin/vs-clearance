// Network first for everything (deals and shell); the cache is the offline fallback.
const VERSION = 'vs-web-5';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'core.js', 'manifest.webmanifest', 'get/', 'get/landing.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/api/snapshot')) {
    e.respondWith(fetch(e.request).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('api/snapshot', copy)); }
      return res;
    }).catch(() => caches.match('api/snapshot').then((r) => {
      if (!r) return Response.error();
      // Tell the page this is the saved copy so it says "offline" rather than "updated".
      const headers = new Headers(r.headers);
      headers.set('X-From-Cache', '1');
      return r.blob().then((b) => new Response(b, { status: 200, headers }));
    })));
    return;
  }
  // Shell: network first so a fix reaches everyone on their next visit; the cache is only the
  // offline fallback.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) =>
    // Only a page visit may fall back to the app page; a stylesheet or script must never get HTML.
    r || (e.request.mode === 'navigate' ? caches.match(url.pathname.includes('/get') ? 'get/' : 'index.html') : Response.error()))));
});
