'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const manifestPath = path.join(root, 'public', 'assets', 'characters', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expected = Array.from({ length: 15 }, (_, i) => 'operator-' + String(i + 1).padStart(2, '0'));
const keys = Object.keys(manifest.models || {});
if (keys.length !== expected.length || expected.some(id => !Object.prototype.hasOwnProperty.call(manifest.models, id))) {
  throw new Error('Character manifest must define exactly operator-01 through operator-15.');
}
let installed = 0;
for (const [id, url] of Object.entries(manifest.models)) {
  if (url === null) continue;
  if (typeof url !== 'string' || !url.startsWith('/assets/characters/') || !url.toLowerCase().endsWith('.glb')) {
    throw new Error('Invalid GLB path for ' + id);
  }
  const file = path.join(root, 'public', url.replace(/^\//, ''));
  if (!fs.existsSync(file)) throw new Error('Missing GLB file for ' + id + ': ' + file);
  const fd = fs.openSync(file, 'r');
  const magic = Buffer.alloc(4);
  fs.readSync(fd, magic, 0, 4, 0);
  fs.closeSync(fd);
  if (magic.toString('ascii') !== 'glTF') throw new Error('Invalid GLB header for ' + id);
  installed++;
}
console.log('Character manifest valid: ' + installed + '/15 GLB files installed; missing models use procedural fallback.');
