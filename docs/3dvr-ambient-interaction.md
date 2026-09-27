# 3DVR Ambient Interaction Experiment

This experiment lives at `/3dvr-hud/` in the monorepo.

Its purpose is to test a simple idea: **3DVR should feel aware of the person using it.** Ordinary interaction changes the visual space immediately, while hardware sensing remains explicitly opt-in.

## Interaction model

The page treats many browser events as one ambient signal stream:

- keyboard input
- pointer / mouse / trackpad movement
- touch and click
- scrolling and wheel depth
- focus / blur / visibility
- optional device orientation
- optional device motion
- optional camera-derived optical motion

The visual system maps those signals into a few bounded values: horizontal look, vertical look, depth, short-lived interaction energy, device-motion energy, and camera-motion energy.

This is intentionally an **ambient layer**, not a command layer. Pressing a key still means whatever the interface normally says it means; the ambient system only makes the environment react.

## Permission rules

The privacy boundary is part of the design.

1. Basic DOM interaction is enabled by default because the page already receives those events.
2. Device motion/orientation is never requested automatically. The user must press **Enable motion**.
3. Camera access is never requested automatically. The user must press **Enable camera motion**.
4. Microphone access is never requested.
5. Camera frames are sampled at low resolution in the current browser tab, compared against the previous frame, and discarded.
6. No camera frame or raw sensor value is sent to a server by this experiment.
7. The camera can be stopped from the page at any time and is stopped on page unload.
8. Browsers and operating systems remain the authority for permission prompts and permission persistence.

## Camera motion

Camera permission is used as an optional fallback for devices that do not expose useful physical motion sensors.

The experiment does **not** try to identify faces, objects, rooms, or people. It performs only frame-to-frame pixel-difference sampling to estimate motion energy. The output is a single normalized value used to make the HUD respond.

If this moves beyond an experiment, keep the invariant that semantic camera analysis requires a separate capability, separate user explanation, and separate consent.

## Device motion

When supported, the experiment listens to:

- `deviceorientation` for beta/gamma tilt
- `devicemotion` for acceleration changes

Safari/iOS-style `requestPermission()` flows are handled behind the explicit enable button. Browsers without that API simply attach listeners after the user gesture.

Desktop laptops often expose no useful motion events. In that case the camera-motion option can still make physical movement of the laptop or user visible to the HUD through optical change.

## Accessibility

- The page respects `prefers-reduced-motion`.
- Hardware sensing is never required to use or understand the page.
- All permission actions are ordinary buttons with visible status.
- No critical content is hidden behind motion or hover.

## Product direction

If the experiment feels good, the next step is to extract the sensing into a small reusable module with an event contract such as:

```js
ambient.emit({
  source: 'pointer' | 'keyboard' | 'scroll' | 'motion' | 'camera',
  x,
  y,
  depth,
  energy,
  timestamp
})
```

The marketing site, Portal, games, and later XR/browser shells could subscribe to that shared signal without each implementing permissions themselves.

The core rule should remain: **the interface can be alive without being invasive.**
