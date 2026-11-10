// Precache the complete local game runtime so the first controlled load can work offline.
const CACHE = 'operation-strike-shell-v8';
const FILES = [
  '/',
  '/index.html',
  '/styles.css',
  '/client.js',
  '/manifest.webmanifest',
  '/vendor/three/build/three.module.js',
  '/vendor/three/examples/jsm/loaders/GLTFLoader.js',
  '/vendor/three/examples/jsm/utils/SkeletonUtils.js',
  '/vendor/three/examples/jsm/utils/BufferGeometryUtils.js',
  '/assets/characters/manifest.json',
  '/assets/characters/army-general.glb',
  '/assets/characters/army-officer.glb',
  '/assets/characters/army-sniper.glb',
  '/assets/characters/combat-engineer.glb',
  '/assets/characters/combat-medic.glb',
  '/assets/characters/machine-gunner.glb',
  '/assets/characters/recon-scout.glb',
  '/assets/characters/rifleman.glb'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key.startsWith('operation-strike-') && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok) {
      event.waitUntil(cache.put(request, response.clone()));
    }
    return response;
  })());
});
