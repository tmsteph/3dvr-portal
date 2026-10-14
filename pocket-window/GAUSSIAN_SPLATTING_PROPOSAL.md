# Gaussian Pocket Window — technical concept

Status: proposal, not implemented  
Date: 2026-10-14  
Related: [Pocket Window README](./README.md) · [live experiment](https://portal.3dvr.tech/pocket-window/?v=extreme)

## Inspiration and goal

An Instagram demonstration by **@_fojciko** combines head tracking and Gaussian splatting to make a webpage feel like a physical window into a photographed environment. This is inspiration, not an endorsement of or dependency on the creator's implementation.

**3DVR goal:** experiment with a photorealistic Gaussian-splat environment behind Pocket Window's existing fixed-glass/off-axis perspective and multi-input camera rig. The first implementation should be an **opt-in, separate experiment**, without replacing Moonbun Garden.

## Existing foundation

Pocket Window already has a local Canvas scene, spatial Z positions, off-axis projection, relative touch/mouse controls, recentering, optional device orientation, experimental local camera movement tracking, reduced-motion handling, and regression tests. See README for exact present behavior and limitations. In particular, frame differencing is not true calibrated head-position tracking.

## Proposed first slice

1. Create an isolated route, e.g. `/gaussian-window/`, reusing the spatial input/pose conventions where practical. Avoid changing `/pocket-window/` behavior.
2. Load one small, legally reusable sample splat scene using a browser WebGL renderer; measure memory, transfer size, load time and frame pacing on midrange Android and desktop.
3. Map smoothed eye X/Y and user-controlled Z to an **off-axis view of a fixed display plane**. Validate direction and occlusion by leaning, dragging and recentering; avoid rotating a flat image as a substitute for parallax.
4. Support drag/touch first, then opt-in gyro, then optional opt-in local head tracking. Always provide recenter and camera-off controls; never require camera permission.
5. Add a visible before/after toggle: static view versus spatial tracking. Allow intensity adjustment and an accessible reduced-motion mode.
6. Keep the original Moonbun Garden route as fallback and baseline.

## Renderer questions to answer with a spike

- Compare maintained web Gaussian-splat renderers for license, WebGL/browser support, sorting method, off-axis view compatibility, mobile GPU behavior, and bundled download footprint. Do not pick a dependency solely from a viral demo.
- Test whether the chosen renderer exposes/customizes the projection matrix needed for a fixed-glass window; document any depth/sort artifacts during lateral motion.
- Determine scene format and compression/conversion pipeline; store or host only assets with clear redistribution rights.
- Decide whether we need a lightweight non-splat fallback for low-power devices and slow connections.
- Treat physically calibrated head tracking as a later enhancement, not as an existing capability.

## Acceptance criteria for prototype

- Existing `/pocket-window/` interactions and tests still pass.
- A sample splat scene loads on desktop and at least one real Android phone, with observed load size, approximate FPS/frame pacing, thermal behavior and crashes documented rather than assumed.
- Pointer and touch lean yield correctly directed, visibly depth-dependent parallax; reset restores baseline.
- Gyro/camera failures and permission denial leave a usable touch-only demo; camera frames remain on-device and all tracks stop on exit.
- Motion-reduction and intensity controls work; no surprise camera activation.
- Scene asset licensing and runtime dependencies are recorded.
- Review results before deciding to promote or integrate with the portal homepage.

## Future direction

Publish the working window as a reusable, open-source website component with a drop-in embed/API and optional asset pipeline. Possible use cases: real-estate spaces, museum exhibits, product experiences, immersive portfolios and spatial portals.

## Scope boundaries

This document is a design proposal only. No splat assets were downloaded, no renderer was selected, no feature was deployed, and no claim of real-device performance is made.
