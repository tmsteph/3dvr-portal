# Pocket Window · Moonbun Garden

Spatial-first, never headset-required. This standalone portal route uses a local Canvas renderer, a fixed display plane and an off-axis pinhole projection. Objects have independent world-space Z positions. It does not rotate or scale one giant scene layer.

The default is deliberately strong: deep repeating portals, a rounded low-poly bunny, close mushrooms, opaque near pillars, hidden star friends and motes that cross the screen plane. A brief permission-free opening lean demonstrates occlusion. Touch, mouse and keyboard work immediately.

## Run and verify

From the portal root, run `npm ci` and `npm run dev`, then open `/pocket-window/`. No separate Vite app or build is needed.

```sh
node --test tests/pocket-window.test.js tests/pocket-window.e2e.test.js
```

The browser tests need the repository's installed Playwright Chromium runtime. Optional environment variables:

- `POCKET_URL`: use the public origin instead of the temporary test server.
- `POCKET_ARTIFACTS`: screenshot directory; defaults to `/tmp/pocket-window-playtest`.

## Controls

Drag or move the mouse to lean. Two-finger pinch, scroll or +/- moves closer/back. Arrow keys look around. Center / Escape resets the head reference, pointer depth and actual device orientation reference. Magic opens the optional controls. Center remains visible.

Reduced-motion preferences disable the automatic opening lean and animated world. Manual input remains available; the intensity slider offers a gentler experience. Fullscreen is progressively enhanced.

## Input and privacy

`rig.js` fuses head pose, device pose and pointer/touch into one smoothed, bounded eye position. `garden.js` projects each object onto the fixed glass plane and draws depth-ordered geometry. The canvas renderer uses procedural geometry, so there is no CDN dependency.

Camera is opt-in and local. Native FaceDetector is used when available; local 40×30 frame differencing is the fallback. Frame differencing estimates movement, **not calibrated head pose or head distance**. It never pretends to provide forward/back head tracking; pinch/scroll supplies that path. Camera start, detection errors and denied permissions preserve touch. Disable Camera and leaving/hiding the page stop all tracks. No camera upload, network vision API, model download or analytics is used on this route.

Device orientation requires opt-in. The first actual sample establishes a comfortable holding angle. Recenter uses the latest sample; landscape rotation adjusts the axes. Browsers without readings keep the pointer path.

The projection is physically meaningful but not display-calibrated: world units, eye distance and input gains are artistic defaults. This is a single-view browser window, not stereoscopic XR. Spheres are low-poly meshes; planar decorations are sprites. Optional XR is a future input adapter.

## Play-test record — 2026-10-06

Live baseline was release `ef2e0ca90ea90b6e7f1f650eb8ea1029ad752c2d` (PR #3017). No deployment-baseline regression was found.

- Chromium: 1440×900 desktop, 390×844 portrait, 360×640 small portrait, 844×390 landscape.
- Visually reviewed center, lean and close-up screenshots. Foreground moves oppositely to the distant scene and exposes hidden stars.
- Real CDP touch gestures exercise one-finger drag and two-finger pinch.
- Verified no overflow, panel placement, keyboard, exact settled recenter, reduced-motion behavior, denial fallback, camera track shutdown, gyro recenter and no external/upload requests.
- Tests use a synthetic camera and orientation samples. Actual iOS/Android sensors, camera face quality, Safari and physical-device performance still need hardware validation; Thomas's devices were not used.

## Production and rollback

Update `ops/self-host-production-trigger.txt` in the PR. On merge, the repository's self-host production workflow deploys its exact `github.sha`, validates a candidate before switching, and retains prior release directories. Check `/__3dvr-health` against the workflow SHA, then browser-test the public route and module responses. A merge alone is not release verification.

Previous production release for rollback: `ef2e0ca90ea90b6e7f1f650eb8ea1029ad752c2d`. Use the existing exact-SHA deployment script with that commit from the dedicated production checkout if a rollback is required.
