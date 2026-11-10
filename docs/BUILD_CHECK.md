# Static browser build verification

This repository is a static single-player browser game. Do not run npm, Node.js, Socket.IO, SQLite or server-side multiplayer tests.

## Local preview

1. Serve the contents of `public/` through XAMPP/Apache, VS Code Live Server, or `py -m http.server 8080`.
2. Open the local URL in a modern desktop browser.
3. Start a mission and verify:
   - the arena renders and pointer lock can be captured/released;
   - WASD movement, sprint, jump and mouse look work;
   - aiming changes the camera FOV;
   - each weapon switches, fires and reloads;
   - enemies pursue, strafe, attack and can be eliminated;
   - health reaches zero and the mission report appears;
   - the next wave spawns after all enemies are eliminated;
   - pause/resume, fullscreen and window resize work.
4. Watch the browser console and Network panel for failed module imports, GLB parse errors and 404 responses.

## Character validation

- Confirm all eight GLBs load without 404 or parser errors.
- Inspect each model's skeleton and actual animation clip names.
- Confirm each enemy has an independent AnimationMixer.
- Check scale, ground contact, facing direction and weapon hit registration.
- Test Idle/Walk/Hit/Death transitions and eight simultaneous enemies.

## Offline validation

1. Open the game online through HTTP or HTTPS.
2. Wait for the service worker to install and its precache operation to complete.
3. Reload the page once so the page is controlled by the service worker.
4. In the browser's site controls or developer tools, switch the site to offline/network unavailable.
5. Reload and start a mission.
6. Confirm that the app shell, Three.js modules and all eight GLBs load without network access.

Do not claim offline readiness until this browser test passes. The service worker precaches the known runtime assets, but actual offline behavior still needs testing in the deployed browser.

## cPanel deployment

Upload the contents of `public/` to the domain's document root and preserve directory structure. HTTPS is required for service-worker support on a public domain. Verify that `index.html`, `client.js`, `styles.css`, `sw.js`, `manifest.webmanifest`, `vendor/three/` and `assets/characters/` are served successfully.
