# OPERATION: STRIKE — 3D Asset Pipeline

## Verified repository state (2026-11-10)

The current playable prototype still builds its operator bodies from primitive Three.js geometry. There is no GLB character manifest, no GLB binary in `public/assets/`, and no GLTFLoader/SkeletonUtils integration in the current `public/client.js`. Do not describe model loading or skeletal animation as implemented.

The map is also procedural geometry. The recent rendering pass adds ACES tone mapping, PCF soft shadows, shadow-camera bounds, animated tree crowns, cover-aware hitscan, line-of-sight checks for enemy firing, and headshot multipliers. These improve the prototype but do not replace a production environment or physics/collision engine.

## Target character requirements

- Fully clothed modern tactical operators with distinct silhouettes and readable team identifiers.
- glTF 2.0 / GLB assets with humanoid skeletons, sensible scale and origin, embedded or correctly referenced textures.
- Separate animation clips where available: idle, walk, run, jump, aim, fire, reload, hit reaction and death.
- Use `SkeletonUtils.clone()` for every skinned character instance; ordinary `Object3D.clone()` is not safe for independent skeleton animation.
- Use `THREE.AnimationMixer` per character and cross-fade actions rather than abruptly switching clips.
- Verify every asset using the Khronos glTF Validator before adding it to the public build.

## Candidate sources — verify the exact pack licence

### Gobkit free library
- Manifest: https://gobkit.com/api/free
- Guide: https://gobkit.com/freebies
- The published manifest reports a CC0 1.0 library. It includes modern tactical-themed candidates such as ArmySniper, ArmyOfficer, CombatMedic, CombatEngineer, ReconScout, MachineGunner and Rifleman.
- The free-pack manifest distinguishes separately named clips from legacy frame-range metadata. Read the current manifest instructions and use the clip names actually present in each downloaded GLB.
- Skinned copies require skeleton-aware cloning.
- Download and bundle the files into this repository; do not hotlink them at runtime if offline operation is required.

### Quaternius
- Ultimate Modular Characters: https://quaternius.com/packs/ultimatemodularcharacters.html
- Licence: https://quaternius.com/license.html
- Verify the licence included with the exact downloaded pack. Do not assume the licence of an older pack applies to newer releases.

### Khronos validator
- Browser validator: https://github.khronos.org/glTF-Validator/
- Source and CLI usage: https://github.com/KhronosGroup/glTF-Validator

## Integration sequence

1. Acquire a small representative character set and preserve the original licence/readme.
2. Inspect model previews, skeletons, scale, facing, textures and animation clip names.
3. Validate the GLB files; reject broken or oversized files.
4. Add the binary files under `public/assets/characters/`.
5. Vendor the matching Three.js release and its GLTFLoader and SkeletonUtils modules under `public/vendor/`.
6. Implement a manifest-driven loader with a procedural fallback; use skeleton-aware clones and per-instance mixers.
7. Add animation state transitions for locomotion, aim, fire, reload, hit and death.
8. Test collision, hitboxes and performance with several simultaneous enemies.
9. Update the service-worker cache only after all local paths are verified.
10. Verify first-load network access, then disable the network and reload in a clean browser profile to prove offline operation.

## Hosting boundary

Everything needed by the browser belongs inside `public/` and is copied into `public_html/` while preserving relative paths. Development notes and licence records remain in `docs/` and are not uploaded. No Node.js runtime or private PHP files are required by the current static prototype.
