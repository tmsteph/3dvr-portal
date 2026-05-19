# 3DVR WebRTC Lab

Native WebRTC proof of concept for small 3DVR video rooms.

This app uses:

- WebRTC peer connections for media.
- Browser `getUserMedia()` for camera and microphone access.
- Gun at `3dvr-webrtc-lab/<room>` for lightweight signaling and room presence.
- Public STUN servers for NAT discovery.

It is intentionally not a production replacement for a Selective Forwarding Unit. Mesh WebRTC is useful for two or three people while testing connection behavior, but larger meetings need an SFU or other managed media layer.
