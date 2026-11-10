# OPERATION: STRIKE — 3D Asset Pipeline

## Current state

The game still uses procedural operator meshes as a fallback. No downloaded character GLB or map pack is included yet. Do not describe the 15 operator slots as finished 3D characters until the models are installed and tested.

## Character direction

The target is 15 distinct, fully clothed, non-explicit tactical operators with readable silhouettes and a consistent stylized-realistic art direction. Avoid underwear, swimwear, revealing outfits, joke costumes, and unrelated fantasy gear.

### Character sources to combine: Quaternius modular packs

- Official pack page: https://quaternius.com/packs/ultimatemodularcharacters.html
- The official page identifies **11 different characters**, **24 animations**, modular character parts, glTF/FBX/OBJ/Blend formats, and a **CC0** licence.
- The page states the assets are free for personal and commercial projects.
- This is an older February 2022 pack, so its pack-specific CC0 grant is distinct from newer Quaternius packs and the newer QAL terms. Keep the exact page and the included licence file with the source record.

Men pack: 11 distinct characters and 24 animations. Women pack: 10 distinct characters and 24 animations, including a humanoid rig version. Together they provide 21 distinct starting models, enough to choose 15 operators. The pack includes casual/fantasy-adjacent silhouettes as well as SWAT, so select the tactical-looking models and use modular parts to make the rest consistent. Inspect the actual files before final selection.

### Other Quaternius candidates

- Ultimate Modular Women Pack: https://quaternius.com/packs/ultimatemodularwomen.html
- Universal Base Characters: https://quaternius.itch.io/universal-base-characters
- Modular Character Outfits (Fantasy): https://quaternius.com/
- Universal Animation Library: https://quaternius.itch.io/universal-animation-library

The Universal Base pack page advertises six humanoid rigged bases and 20 hairstyles; it is a foundation, not 15 finished operators. The fantasy outfit pack is fully clothed but may not fit a modern tactical shooter.

**Licence warning:** Quaternius published QAL v1.0 on 2026-08-28. Newer assets may have restrictions on redistributing source files as standalone assets. Do not assume that an older pack's CC0 grant applies to newer packs. Check the exact pack page and the licence included in each download before committing any source models.

Current licence information: https://quaternius.com/license.html

## CC0 alternative for freely redistributable assets

- Kenney Blocky Characters: https://kenney.nl/assets/blocky-characters
- Kenney Mini Characters: https://kenney.nl/assets/mini-characters
- Kenney Nature Kit: https://kenney.nl/assets/nature-kit

Kenney identifies these asset pages as CC0. The style is more toy-like than tactical, so these are fallback/prototype sources rather than the preferred final operator art direction. Preserve each downloaded pack's included License.txt.

## Runtime GLB loader

The browser now has a manifest-driven GLTFLoader pipeline. It clones skinned meshes safely, normalizes model height to 1.8 units, adds a blue/red team armband, and plays available idle/walk/run clips. If a file is absent, malformed, or fails to load, the procedural operator remains visible. The manifest is `public/assets/characters/manifest.json`; only local `/assets/characters/*.glb` paths are accepted.

No third-party GLB binaries have been copied into this repository yet. The loader is ready, but the model slots stay `null` until the exact pack files have been downloaded, inspected, and checked against their licence. This avoids shipping invented or unverified binary assets.

## Required model layout

When a model has been acquired and its licence checked, convert/prepare it as a GLB and place it here:

```
public/
  assets/
    characters/
      operator-01.glb
      operator-02.glb
      ...
      operator-15.glb
    environment/
```

Use the same operator IDs as the server's character catalogue. Each model must be checked for:
- full-body coverage and suitable clothing;
- consistent scale, forward direction and origin at the feet;
- humanoid rig and animation compatibility;
- texture paths embedded or correctly relative;
- reasonable polygon/texture size for browser multiplayer;
- permission to redistribute the resulting file in this public repository.

## Integration and acceptance checklist

- Load models asynchronously and retain the procedural mesh if a model is missing or fails.
- Cache each GLB once; clone safely for each player (including skinned meshes).
- Apply team identification as a small armband/shoulder marker, not by recolouring the whole uniform.
- Play idle, walk/run, fire, reload, hit and death animations where available.
- Verify all 15 previews, selection exclusivity, remote player appearance, respawn, and browser performance.
- Record source URL, creator, exact licence/version, acquisition date and any required attribution for every asset.

## Environment

The training-yard map currently uses procedural geometry. The arena was improved with painted firing lanes, container ribs, concrete cover, sandbags, watchtower frames and perimeter lights. A polished downloadable map pack is a later step; keep its licence and performance budget documented before adding it.
