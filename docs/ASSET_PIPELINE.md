# OPERATION: STRIKE — GLB Operator Pipeline

## Implemented on main

The browser code now contains a real glTF loading path:

- Three.js `GLTFLoader` and `SkeletonUtils.clone` imports are configured through a same-origin import map.
- Eight distinct operator IDs are mapped to local GLB paths.
- Each source GLB is loaded once and cached as a template; each spawned enemy receives a skeleton-safe clone.
- Model height is normalized to 1.8 metres and the model is grounded/centered from its bounds.
- Each instance gets its own `AnimationMixer`.
- Idle, Walk, Hit and Death clips are selected by clip name; other clips (Run, Attack, Special) remain available for later state transitions.
- A procedural operator remains visible if a model is absent or fails to load.

The runtime code and import map are committed. **The binary GLB files and vendored Three.js modules are not in Git yet**, because the GitHub text-file connector cannot upload/download repository binary assets. Run the PowerShell acquisition script below on the Windows development PC to create them locally, then commit and push the generated folders.

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
Pack licence in the live manifest: CC0 1.0 Universal, public domain dedication, commercial use and redistribution permitted without attribution.
Licence text: https://creativecommons.org/publicdomain/zero/1.0/

The live manifest lists all eight models as rigged and supplies seven named clips at 30 FPS: Idle, Walk, Run, Death, Hit, Attack and Special. The runtime selects clips by their actual names. The source models are low-poly; they are a real rigged starting pack, not photorealistic AAA character art.

## Acquire local runtime and model files

From the repository root in Windows PowerShell:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\tools\prepare_offline_assets.ps1
```

The script downloads:
- Three.js r170 core module and the exact matching GLTFLoader, SkeletonUtils and BufferGeometryUtils modules;
- the eight GLB character files above;
- the Three.js licence file;
- a local character manifest recording source, licence and clip names.

Expected output folders:

```
public/
  vendor/three/
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

After the script completes, verify file sizes and run the game locally. Then commit and push the generated `public/vendor/` and `public/assets/` folders to `main`. Do not upload only the HTML/JS changes to hosting: the local Three.js modules are now required for the browser to start.

## Validation checklist

- Confirm all eight GLBs load without 404 or parse errors.
- Confirm every model has a skeleton and all seven expected animation clips.
- Confirm each enemy has an independent mixer (one character's animation must not drive another).
- Check the ground contact, facing direction, hitbox height and scale in the actual browser.
- Test idle/walk transitions, hit reaction, death playback, respawn/waves and 8+ simultaneous enemies.
- After the first successful online load, disable network and reload to verify that the service worker cached the local modules and GLBs.

## Hosting and offline boundary

The browser only reads files from `public/`; upload the contents of `public/` into `public_html/`. Keep `docs/` and `tools/` out of the public web root. No Node.js, npm, Socket.IO or server runtime is needed. The app shell and Three.js imports now point to same-origin paths; full offline operation still depends on downloading and committing the binary assets, then completing the browser cache test.
