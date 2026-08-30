/* Pac-Man PWA service worker: offline app shell + runtime caching. */
const CACHE = 'pacman-v16-galaga';
const ASSETS = [
  './',
  './index.html',
  './pacman.html',
  './donkeykong.html',
  './poleposition8bit.html',
  './galaga.html',
  './manifest.json',
  './icons/joystick-192.png',
  './icons/joystick-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/fflate@0.3.10/umd/index.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FBXLoader.js',
  './f1.fbx',
  './formula1_DefaultMaterial_Diffuse.png',
  './formula1_DefaultMaterial_Specular.png',
  './formula1_DefaultMaterial_Normal.png',
  './formula1_DefaultMaterial_Height.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      // add individually so a single failure (e.g. CDN offline) doesn't break the install
      Promise.all(ASSETS.map((a) => c.add(a).catch(() => {})))
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const req = e.request;

  // HTML page navigations: network-first so code updates are always picked up
  // while online, with a cached copy as the offline fallback. Must ALWAYS
  // resolve to a real Response (an undefined resolution = blank page).
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        if (!res || !res.ok) throw new Error('network fetch failed');
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      }).catch(async () => {
        const c = await caches.open(CACHE);
        const hit = (await c.match(req)) || (await c.match('./index.html')) || (await c.match('./'));
        if (hit) return hit;
        return new Response('Offline, and no cached copy is available yet.', {
          status: 504, headers: { 'Content-Type': 'text/plain' }
        });
      })
    );
    return;
  }

  // Everything else: cache-first, falling back to network (cached for offline).
  e.respondWith(
    caches.open(CACHE).then((c) =>
      c.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            c.put(req, res.clone());
          }
          return res;
        });
      })
    )
  );
});