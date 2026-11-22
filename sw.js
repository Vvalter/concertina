// Service worker: makes the app installable and usable offline.
// Shell (same-origin pages, scripts, styles, manifest, icons): network first, cache as offline fallback,
// so a new version is never stuck behind the cache. Cache keys drop the query (?v=V17).
// Recordings (samples/*.m4a) and Google Fonts: cache first, cached when first used.
// Bump CACHE together with the version label (#version in index.html).
const CACHE = 'concertina-V23';
const SHELL = ['index.html', 'song.html', 'duet.html', 'backing.html', 'concertina.js', 'concertina.css',
  'pwa.js', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('concertina-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

const stripSearch = url => { const u = new URL(url); u.search = ''; u.hash = ''; return u.href; };

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // A request that already asks for 'reload' (the update check) keeps its mode; others revalidate
    const res = await fetch(req.cache === 'default' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req);
    if (res.ok && res.type === 'basic') cache.put(stripSearch(req.url), res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' && await cache.match('index.html'));
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') return e.respondWith(cacheFirst(req));
  if (url.origin !== location.origin) return;
  if (/\/samples\/[^/]+\.m4a$/.test(url.pathname)) return e.respondWith(cacheFirst(req));
  e.respondWith(networkFirst(req));
});
