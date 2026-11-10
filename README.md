# OPERATION: STRIKE — Offline Single-Player

A browser-based first-person shooter prototype for ordinary Apache/cPanel shared hosting. The game simulation runs in the visitor's browser. It does not require a multiplayer server, accounts, Socket.IO, Node.js, npm, PHP endpoints or a game database.

## Current prototype

- Single-player first-person arena.
- Expanded military outpost arena with command buildings, barracks, service road, container stacks, concrete cover, sandbag/HESCO positions, watchtowers, perimeter lighting and wind-swaying foliage.
- Local enemy operators with prototype pursuit, strafing and attack behavior.
- Eight local rigged GLB operator models, loaded through Three.js GLTFLoader.
- Per-enemy skeleton-safe clones and independent AnimationMixers.
- Idle, Walk, Hit and Death animation states when matching clips are present.
- Three difficulty settings and selectable enemy counts.
- Four weapons: rifle, sniper, shotgun and pistol.
- Health, ammunition, eliminations, waves and mission-result HUD.
- Keyboard/mouse controls, pointer lock, pause and fullscreen.
- Static HTML, CSS, JavaScript and same-origin assets.

This is an evolving prototype, not yet a finished AAA-quality game. Browser validation of every model, animation, hitbox and offline scenario is still required.

## Hosting on cPanel

Upload the **contents of the `public/` directory** into `public_html/` (or the selected domain's document root), preserving all subdirectories. Do not upload `docs/` or `tools/` into the public web root.

No Node.js application, npm install, database, PHP endpoint or persistent game server is required. HTTPS is required for service-worker support on a deployed domain.

The supplied `.htaccess` disables directory listings and enables basic compression/cache headers where supported.

## Higher-quality combat asset import

The optional combat asset pack is downloaded locally with PowerShell:

```powershell
Set-Location "C:\Games\shoter_game_ofline"
powershell -ExecutionPolicy Bypass -File ".\tools\import_combat_assets.ps1"
```

The script downloads selected rigged soldier, first-person weapon, environment prop and recorded sound assets into `public/assets/combat/`, validates GLB/Ogg file signatures, and stores the upstream attribution/licence notes at `public/assets/credits/IRONLINE_ASSET_CREDITS.md`. The browser uses the imported soldier and first-person weapon models when present; otherwise it keeps the current fallback models. Recorded gunfire/reload sounds are used when present, with synthesized fallback audio if they are absent.

After the script completes, commit and push the downloaded binary assets so GitHub Pages/cPanel deployments can serve them. The service worker treats these imported assets as optional during installation, so a missing asset cannot prevent the base game from starting.

## Run locally

Because the game uses JavaScript modules and a service worker, serve `public/` through HTTP rather than opening the file directly with `file://`.

For example, from the repository root in PowerShell:

```powershell
cd .\public
py -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

| Action | Control |
|---|---|
| Move | W, A, S, D |
| Sprint | Left Shift |
| Aim | Right mouse button or C |
| Fire | Left mouse button |
| Reload | R |
| Change weapon | 1–4 |
| Jump | Space |
| Pause | Pause button |
| Release mouse | Escape |

## Local runtime and character assets

Three.js r170, GLTFLoader, SkeletonUtils, BufferGeometryUtils and the eight character GLBs are stored under `public/`. The browser imports the engine and models from the same origin; it does not need jsDelivr at runtime.

The service worker precaches the app shell, Three.js modules, character manifest and all eight GLBs during installation. Allow installation and cache completion to finish while online, then reload once under the service worker before testing with the network disabled. Offline behavior must still be confirmed in the target browser and hosting environment.

## Current limitations and next work

Enemy behavior is an initial prototype, not advanced tactical AI. Weapon meshes are procedural placeholders; sound is synthesized rather than using a finished audio library. Character models are low-poly CC0 assets, not photorealistic AAA art. Mobile touch controls, save/persistence, advanced maps, polished effects and comprehensive cross-browser testing remain future work.
