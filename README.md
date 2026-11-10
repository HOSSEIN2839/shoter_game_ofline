# OPERATION: STRIKE — Offline Single-Player

A browser-based first-person shooter prototype designed for ordinary shared hosting (Apache/cPanel). The game logic runs in the visitor's browser; there is no multiplayer server, account system, Socket.IO service, Node.js runtime, or game database.

## Current build

- Single-player first-person arena.
- Local enemy operators with basic pursuit, strafing and attack behavior.
- Three difficulty settings and selectable enemy counts.
- Four weapons: rifle, sniper, shotgun and pistol.
- Health, ammunition, eliminations and wave HUD.
- Keyboard/mouse controls and pause button.
- Static HTML, CSS and JavaScript files suitable for cPanel hosting.

## Hosting on cPanel

Upload the **contents of the `public/` directory** into `public_html/` (or the document root of the chosen domain). Keep the directory structure intact. No Node.js application, npm install, database, or PHP endpoint is required for this build.

The supplied `.htaccess` disables directory listings and enables basic compression/cache headers where supported.

## Run locally

Because this uses JavaScript modules, open it through a local HTTP server rather than the `file://` protocol. For example, use VS Code Live Server, XAMPP/Apache, or Python's static server:

```powershell
cd path\to\shoter_game_ofline\public
py -m http.server 8080
```

Then open `http://localhost:8080`.

## Controls

| Action | Control |
|---|---|
| Move | W, A, S, D |
| Sprint | Left Shift |
| Aim | Mouse |
| Fire | Left mouse button |
| Reload | R |
| Change weapon | 1–4 |
| Pause | Pause button |
| Release mouse | Escape |

## Offline status and next work

The game simulation is local and does not contact a game server. The current prototype still imports the Three.js engine from jsDelivr, so a first load requires internet access. The next packaging task is to vendor the exact Three.js module into `public/vendor/` and cache the local game shell with the service worker; only after that step should this repository be described as fully playable without internet after installation/cache.

Character models, polished animations, sound effects, mobile touch controls, persistence and comprehensive browser testing remain future work. Current enemy AI is an initial prototype, not advanced tactical AI.
