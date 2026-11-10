# Static browser build verification

This repository is a static single-player browser game. Do not run npm, Node.js, Socket.IO, SQLite or server-side multiplayer tests.

## Local preview

1. Serve the contents of `public/` through a local HTTP server (XAMPP/Apache, VS Code Live Server, or `py -m http.server 8080`).
2. Open the local URL in a modern desktop browser.
3. Start a mission and verify:
   - the arena renders and the pointer can be captured/released;
   - WASD movement, sprint and mouse look work;
   - each weapon changes correctly, fires and reloads;
   - enemies pursue, strafe, attack and can be eliminated;
   - health reaches zero and the mission report appears;
   - the next wave spawns after all enemies are eliminated;
   - pause/resume and window resize work.

## cPanel deployment

Upload the contents of `public/` to the website document root. Confirm HTTPS is enabled before expecting service-worker installation. Verify that the site serves `index.html`, `client.js`, `styles.css`, `sw.js` and `manifest.webmanifest`.

## Known limitation

Three.js is currently loaded from jsDelivr. The game logic is local, but the first load still needs internet access to obtain that engine. Vendor Three.js locally before declaring full offline-after-install support.
