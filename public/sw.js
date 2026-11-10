// Precache the complete local game runtime so the first controlled load can work offline.
const CACHE = 'operation-strike-shell-v11';
const OPTIONAL_FILES = [
  '/assets/combat/characters/soldier.glb','/assets/combat/characters/soldier_tac.glb',
  '/assets/combat/weapons/m4a1.glb','/assets/combat/weapons/awm.glb','/assets/combat/weapons/m1911.glb','/assets/combat/weapons/shotgun.glb','/assets/combat/weapons/mp5a5.glb',
  '/assets/combat/props/old_military_crate.glb','/assets/combat/props/concrete_road_barrier.glb','/assets/combat/props/portable_generator.glb','/assets/combat/props/covered_car.glb','/assets/combat/props/old_tyre.glb',
  '/assets/combat/audio/m4a1_player_near.ogg','/assets/combat/audio/m4a1_world.ogg','/assets/combat/audio/m4a1_enemy_distant.ogg',
  '/assets/combat/audio/awm_player_near.ogg','/assets/combat/audio/awm_world.ogg','/assets/combat/audio/m1911_player_near.ogg','/assets/combat/audio/m1911_world.ogg',
  '/assets/combat/audio/shotgun_player_near.ogg','/assets/combat/audio/shotgun_world.ogg',
  '/assets/combat/audio/rifle_magout.ogg','/assets/combat/audio/rifle_magin.ogg','/assets/combat/audio/rifle_rack.ogg',
  '/assets/combat/audio/shotgun_pump.ogg','/assets/combat/audio/shotgun_shell.ogg','/assets/combat/audio/pistol_magout.ogg','/assets/combat/audio/pistol_magin.ogg','/assets/combat/audio/pistol_slide.ogg',
  '/assets/combat/audio/impact_generic_light.ogg','/assets/combat/audio/impact_metal_light.ogg','/assets/combat/audio/impact_wood_light.ogg',
  '/assets/combat/audio/footstep_concrete.ogg','/assets/combat/audio/footstep_grass.ogg'
];

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
      .then(() => Promise.allSettled(OPTIONAL_FILES.map(file => cache.add(file))))
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
