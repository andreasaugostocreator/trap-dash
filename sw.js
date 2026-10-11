// Offline play: network first (so updates show up straight away), the cache when offline. Bump VERSION on each release.
const VERSION = 'trap-dash-v13';
const FILES = ['./', './index.html', './style.css', './manifest.webmanifest', './lib/peerjs.min.js',
  './src/main.js', './src/config.js', './src/sim.js', './src/levels.js', './src/render.js', './src/audio.js', './src/net.js', './src/bot.js', './src/sprites.js', './src/relay.js', './src/rating.js', './src/gen.js', './src/solver.js',
  './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES))); });
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async c => {
    try { const r = await fetch(req, { cache: 'no-cache' }); if (r.ok) c.put(req, r.clone()); return r; }
    catch (err) { const hit = await c.match(req, { ignoreSearch: true }); if (hit) return hit; throw err; }
  }));
});
