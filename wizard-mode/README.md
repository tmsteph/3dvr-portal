# Wizard Mode interaction prototype

Open `index.html` in a desktop browser, or serve this folder using an existing static development server. No installation or dependencies. This is a standalone local experiment inspired by Helm, not another deployed app or a connected agent channel.

- CSS 3D project spaces, pointer joystick, arrow/WASD navigation, recenter.
- Accessible HTML decision buttons and a locally saved intention restored after reload.
- Browser speech recognition when available; explicit start/stop, error handling and text fallback. Browser speech services may process audio remotely. Voice requires supported browser permissions/origin and is unverified.
- No private goals embedded, no backend, no task execution, no authentication or cross-device sync. Local storage is not encrypted and is not the shared goal board.

Verification: headless Chrome at 390×844 passed room selection, decision selection, local save/reload, keyboard movement and recenter, with no page errors. `preview.png` captures that mobile viewport. Physical touch, microphone, visual motion quality and phone file-opening remain unverified.

Next: connect selected intentions to the existing authenticated Helm flow after its live send/reply/reload gate passes. The shared private goal board is a separate unfinished requirement; this prototype does not replace it.
