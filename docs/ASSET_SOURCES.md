# Asset sourcing and licensing plan

This project is a static browser FPS. Runtime assets must be shipped inside `public/` so the game can run from the shared host and after its first successful cache.

## Candidate sources reviewed

- **Gobkit free GLB library** — https://gobkit.com/freebies and https://gobkit.com/api/free
  - Its published manifest describes free assets as CC0 1.0 and includes rigged/animated character packs plus static nature props.
  - The manifest explicitly warns that skinned characters must be cloned with Three.js `SkeletonUtils.clone`, not ordinary `.clone()`.
  - The manifest describes named animation clips such as idle, attack, dead and (on some packs) walk. Use clip names; do not infer clips by slicing frames.
  - Candidate combat-themed humanoids include ArmySniper, Rifleman, CombatMedic, CombatEngineer, ReconScout and MachineGunner. These are candidates only; each model must be downloaded, inspected, scaled, and tested before integration.
- **KinemIQ free game animations** — https://kinemiq.itch.io/free-game-animations
  - The page advertises a 35-clip CC0 pack including idle, walk, run, sprint, crouch, jump, hit reaction and death. Verify the downloaded archive's included licence before shipping.
- **Poly Haven** — https://polyhaven.com
  - CC0 environment assets, PBR materials and HDRIs are suitable candidates for map dressing and lighting. Select optimized assets and texture sizes for shared-host delivery.

## Integration rules

1. Download the actual files into the repository; do not load game assets from third-party CDNs at runtime.
2. Keep each asset's original licence/readme in `docs/licenses/` and record the source URL, asset name, licence, author if supplied, and any required attribution.
3. Validate each GLB with the Khronos glTF Validator. Confirm skeleton hierarchy, skin weights, material references, texture references, scale, facing direction, and animation clip names.
4. Use skeleton-aware cloning for skinned character instances. Never assume every GLB has the same rig or clip names.
5. Use compressed, appropriately sized textures and models. Avoid loading all maps and characters at startup.
6. Add assets to the service-worker precache only after confirming paths and total download size. Large maps should be loaded on demand and cached after successful fetch.
7. Do not claim offline readiness until a clean browser profile has loaded the game once, then passed a test with network disabled.

## Current implementation status

The existing procedural operator meshes are still placeholders. The asset sources above have been researched but the binary assets have **not** yet been imported into `public/assets/`. The current Three.js import map still points to jsDelivr, so first-load offline operation is not yet achieved. A production asset pipeline and real-browser test are still required.
