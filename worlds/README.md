# 3DVR Worlds — Alpha

Experimental, local-only 3D playground for [issue #3204](https://github.com/tmsteph/3dvr-portal/issues/3204).

## Run

From repository root: `npm run dev` and open `http://127.0.0.1:3000/worlds/`. The browser must be able to fetch the pinned Three.js module from esm.sh.

## Controls

- WASD or arrows: move
- Drag on scene: look
- Tap/click ground: place a block
- Remove mode: tap/click an existing block to remove
- Mobile: directional buttons and Build (places at screen center)
- Export/import: portable JSON (`3dvr-worlds-alpha-v1`)

## Boundaries

This is **not** a multiplayer or production-ready implementation. World state lives in browser localStorage, is not synchronized across devices, and is limited to 2,000 blocks. Imported files are validated against the alpha format and bounds. No executable scripts are loaded from world files.

Before production: bundle/pin dependencies locally, test CSP/offline behavior, verify deployment path, add automated browser tests, audit mobile usability, and design authoritative server-side multiplayer with identity, moderation, and resource quotas. Keep independent hosting and open-format portability mandatory.

No Desktop Commander required for development or review.
