# 3DVR Gun Clip Lab

Proof of concept for recording short WebM clips and storing the latest clip in Gun.

This intentionally stays separate from the frame-streaming `/gun-video-lab/` app. It is based on the Gun repo examples at `examples/basic/video.html` and `examples/vanilla/video.html`:

- Capture camera or screen media with `MediaRecorder`.
- Convert the recorded Blob to a `data:video/webm` URL with `FileReader`.
- Optionally encrypt that data URL with SEA and a passphrase.
- Write the latest clip to `3dvr-gun-clip-lab/<room>/latestClip`.
- Subscribe to that clip and replay it in a normal `<video>` element.

This is not live conferencing. It is useful for testing Gun as a small clip handoff, async video note, or fallback recording transport.
