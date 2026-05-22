# 3DVR WebRTC Lab

Native WebRTC proof of concept for small 3DVR video rooms.

This app uses:

- WebRTC peer connections for media.
- Browser `getUserMedia()` for camera and microphone access.
- Gun at `3dvr-webrtc-lab-v2/<room>` for lightweight signaling and room presence.
- Public STUN servers for NAT discovery.

The v2 room root uses tab-scoped peer IDs, starts media before signaling, sends explicit room
announcements, and stores offer/answer/candidate payloads as JSON strings so Gun does not have to
serialize browser-native WebRTC objects.

It is intentionally not a production replacement for a Selective Forwarding Unit. Mesh WebRTC is useful for two or three people while testing connection behavior, but larger meetings need an SFU or other managed media layer.
