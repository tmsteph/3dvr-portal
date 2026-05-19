# 3DVR Gun Video Lab

Proof of concept for streaming very small camera frames directly through Gun.

This app intentionally does not use WebRTC media tracks. It:

- Captures the webcam into a small canvas.
- Compresses each frame as a JPEG data URL.
- Writes the latest frame to `3dvr-gun-video-lab/<room>/frames/<participantId>`.
- Lets viewers subscribe to the latest frame with Gun.

This is not a normal conferencing architecture. It is useful for experiments, thumbnails, emergency still-frame fallback ideas, and harsh-network testing. For normal meetings, use WebRTC or an SFU.
