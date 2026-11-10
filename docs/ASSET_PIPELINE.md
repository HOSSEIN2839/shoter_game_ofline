# OPERATION: STRIKE — GLB Operator Pipeline

## Assets committed to main

The following runtime assets are now committed:

- Three.js r170 core module.
- Matching GLTFLoader, SkeletonUtils and BufferGeometryUtils modules.
- Eight human004 GLB operators and a local manifest.
- Three.js licence text.

The browser uses the same-origin import map in `public/index.html`; no CDN request is required for the 3D runtime.

## Runtime integration

- Eight operator IDs map to local GLB paths.
- Each source GLB load is cached as a promise/template.
- Each spawned enemy receives a skeleton-safe clone through `SkeletonUtils.clone`.
- Model height is normalized to approximately 1.8 scene units and the model is grounded/centered from its bounds.
- Each instance receives its own `AnimationMixer`.
- The runtime selects Idle, Walk, Hit and Death by clip name when those clips exist.
- A procedural operator remains as a fallback if loading fails.
- Run, Attack and Special clips are available for later state-machine improvements if present in the source file.

## Selected character pack

Gobkit Free Character Pack Vol.4, human004:

- ArmyGeneral
- ArmyOfficer
- ArmySniper
- CombatEngineer
- CombatMedic
- MachineGunner
- ReconScout
- Rifleman

Official pack: https://gobkit.com/freebies/human004/gobkit-human004-pack.zip
Official manifest: https://gobkit.com/api/free
The source manifest identifies the pack as CC0 1.0 Universal. The models are low-poly rigged assets; they should not be described as photorealistic AAA characters.

## Local asset layout

```
public/
  vendor/three/
    LICENSE.txt
    build/three.module.js
    examples/jsm/loaders/GLTFLoader.js
    examples/jsm/utils/SkeletonUtils.js
    examples/jsm/utils/BufferGeometryUtils.js
  assets/characters/
    army-general.glb
    army-officer.glb
    army-sniper.glb
    combat-engineer.glb
    combat-medic.glb
    machine-gunner.glb
    recon-scout.glb
    rifleman.glb
    manifest.json
```

The PowerShell acquisition script is retained at `tools/prepare_offline_assets.ps1` for reproducibility. It is a development tool and should not be uploaded to the public web root.

## Validation still required

The repository contains all eight GLB files and their headers/lengths were checked on the development PC. That basic check does not prove that every file has a valid skeleton or the expected animation clips.

- Load all eight GLBs in the target browser and check for parse errors.
- Confirm every model has a skeleton and inspect the actual animation clip names.
- Confirm independent mixers: animating one enemy must not drive another.
- Check ground contact, facing direction, scale and hitbox alignment.
- Test Idle/Walk/Hit/Death transitions, wave respawn and eight simultaneous enemies.
- Test offline mode after the service worker has installed and precached all listed assets.

## Hosting

Upload the contents of `public/` into `public_html/`, preserving the folder structure. Keep `docs/` and `tools/` outside the public web root. The project is a static browser build and does not need Node.js, npm, Socket.IO or a game database.
