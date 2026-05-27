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

The page shows Gun relay status, announce count, and peer count in the diagnostics bar. If peer count stays
at zero on two devices in the same room, the issue is usually room URL mismatch, stale cached assets, or
Gun signaling reachability rather than TURN. TURN only affects media connectivity after peers can see each other.

After joining, the lab re-announces presence and sweeps the room a few times so a phone and laptop can recover
from slow relay startup or a late Gun map subscription.

The default camera profile is intentionally low bandwidth: it asks for 320 x 180 video at about 10 fps
and caps the video sender near 240 kbps for weak mobile links.

When `/api/session?route=turn-credentials` is configured with `TURN_URLS` and `TURN_STATIC_AUTH_SECRET`, the lab
loads short-lived TURN credentials before joining a room. Add `?relay=1` or `?ice=relay` to the room
URL to force relay-only ICE while testing the TURN server.

It is intentionally not a production replacement for a Selective Forwarding Unit. Mesh WebRTC is useful for two or three people while testing connection behavior, but larger meetings need an SFU or other managed media layer.
