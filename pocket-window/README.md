# 3DVR Pocket Window

3DVR Pocket Window is an experimental portal app: a mobile-first spatial web prototype that makes the browser feel like a handheld view into a warm 3D digital room.

The demo opens into a 3DVR Launch Room with a glowing portal, floating builder-lab panels, a grid floor, and subtle parallax. It is not VR and it does not use head tracking. The experience is controlled with touch or mouse movement, with optional phone motion for extra depth.

## Run

```bash
npm install
npm run dev
```

Open the Vite URL on your phone or desktop. Localhost works for development. Device motion permissions may require HTTPS when testing from another device.

## Interaction Modes

- Touch mode: enabled by default. Drag on mobile or move the mouse on desktop to shift the portal perspective.
- Device motion mode: tap `Enable Motion`. iOS Safari requires this to happen from a user gesture.
- Reset: tap `Reset View` to return the portal camera to center.

Touch mode is the guaranteed fallback path on every browser.

## Privacy

This version does not request camera access. No webcam video, analytics, or external tracking are used.

## Browser Support

- iPhone Safari: supports touch controls. Motion requires a user gesture and browser permission.
- Android Chrome: supports touch controls and should support motion with permission.
- Desktop Chrome/Firefox: supports mouse fallback.

## Tuning

- Touch and motion blending: `src/App.jsx`
- Camera sensitivity and FOV response: `src/components/LaunchRoom.jsx`
- Motion sensitivity: `src/hooks/useDeviceMotion.js`
- Smoothing: `src/hooks/useSmoothedVector.js`

To disable motion mode, remove the `Enable Motion` control in `src/components/Overlay.jsx` and the `useDeviceMotion` blend path in `src/App.jsx`.
