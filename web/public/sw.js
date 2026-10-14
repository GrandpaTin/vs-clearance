// Network first for everything (deals and shell); the cache is the offline fallback.
const VERSION = 'vs-web-5';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'core.js', 'boot-check.js', 'manifest.webmanifest', 'get/', 'get/landing.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

// Saves a response as the offline list only if it really is one.
function saveIfList(res) {
  return res.clone().json().then((j) => {
    if (!j || !Array.isArray(j.items)) return;
    const headers = new Headers(res.headers);
    return caches.open(VERSION).then((c) => c.put('api/snapshot', new Response(JSON.stringify(j), { status: 200, headers })));
  }).catch(() => {});
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))
    // Best effort: a missing or failed list mustn't stop the worker installing.
    .then(() => Promise.race([
      fetch('api/snapshot', { cache: 'no-cache' }).then((r) => (r.ok ? saveIfList(r) : null)).catch(() => null),
      new Promise((resolve) => setTimeout(resolve, 8000)) // a hung download mustn't hold up the offline shell
    ])))
    .then(() => self.skipWaiting()));
});

// The page asks which version took over, so it only offers a reload when it's actually behind.
self.addEventListener('message', (e) => {
  if (e.data === 'version' && e.source) e.source.postMessage({ version: VERSION });
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== IMG_CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const IMG_CACHE = 'vs-img';
const IMG_MAX = 250;
/** Keeps the photo cache to the newest IMG_MAX pictures. */
function trimImages(c) {
  return c.keys().then((keys) => Promise.all(keys.slice(0, Math.max(0, keys.length - IMG_MAX)).map((k) => c.delete(k))));
}

/** Until when the network counts as hanging (set when a request had to fall back to the saved copy). */
let slowUntil = 0;

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Product photos (another site): cache-first, so the list still has pictures with no signal.
  if (e.request.method === 'GET' && e.request.destination === 'image' && url.origin !== self.location.origin) {
    // Only readable (CORS) answers are kept: opaque ones count as megabytes each against storage
    // and could get the whole offline copy evicted. A host without CORS just isn't cached.
    e.respondWith(caches.open(IMG_CACHE).then((c) => c.match(e.request.url).then((hit) => hit ||
      fetch(e.request.url, { mode: 'cors', credentials: 'omit' }).then((res) => {
        if (res.ok) c.put(e.request.url, res.clone()).then(() => trimImages(c));
        return res;
      }).catch(() => fetch(e.request)))));
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/api/snapshot')) {
    const fromCache = (reason) => caches.match('api/snapshot').then((r) => {
      if (!r) return null;
      // Tell the page this is the saved copy, and why ('timeout' = slow, 'error' = unreachable), so it
      // says "offline" / "slow" / "couldn't check" rather than "updated".
      const headers = new Headers(r.headers);
      headers.set('X-From-Cache', reason);
      return r.blob().then((b) => new Response(b, { status: 200, headers }));
    });
    // Abandoned 30 s after the saved copy answered, so polls on a dead connection don't pile up.
    const ctrl = new AbortController();
    if (e.request.signal) e.request.signal.addEventListener('abort', () => ctrl.abort());
    const network = fetch(new Request(e.request, { signal: ctrl.signal })).then((res) => {
      if (res.ok) saveIfList(res);
      return res;
    });
    network.catch(() => {}); // if the saved copy wins, a later network failure is no one's business
    // A request that hangs (weak in-store signal) never fails, so after 8 s answer from the saved
    // copy instead; with nothing saved, keep waiting for the network.
    const slow = new Promise((resolve) => setTimeout(resolve, 8000)).then(() => fromCache('timeout'))
      .then((r) => { if (r) setTimeout(() => ctrl.abort(), 30000); return r; });
    e.respondWith(Promise.race([network, slow.then((r) => r || network)])
      .catch(() => fromCache('error').then((r) => r || Response.error())));
    return;
  }
  // Shell: network first so a fix reaches everyone on their next visit; the cache is only the
  // offline fallback. Revalidated with the server (GitHub Pages lets browsers keep files 10 minutes),
  // so a new page never runs with the previous version's scripts.
  // A request that hangs (weak in-store signal) answers from the saved copy after 3.5 s; the network
  // copy still lands in the cache for next time. A first visit (nothing saved) just waits.
  const network = fetch(e.request, { cache: 'no-cache' }).then((res) => {
    slowUntil = 0; // the network answered: back to network-first
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
    return res;
  });
  network.catch(() => {});
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((cached) => {
    // Only a page visit may fall back to the app page; a stylesheet or script must never get HTML.
    const fallback = () => cached || (e.request.mode === 'navigate'
      ? caches.match(url.pathname.includes('/get') ? 'get/' : 'index.html').then((r) => r || Response.error())
      : Response.error());
    if (!cached) return network.catch(fallback);
    // Once a request has hung, the next ones (scripts, styles) don't each wait 3.5 s more.
    if (Date.now() < slowUntil) return cached;
    return Promise.race([network.catch(fallback), new Promise((resolve) => setTimeout(() => {
      slowUntil = Date.now() + 30_000;
      resolve(cached);
    }, 3500))]);
  }));
});
