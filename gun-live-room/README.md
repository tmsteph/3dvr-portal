# 3DVR Gun Live Room

Pure Gun audio/video room experiment.

This stays separate from both existing Gun demos:

- `/gun-video-lab/` sends tiny camera frames through Gun.
- `/gun-clip-lab/` records a short audio/video WebM and stores the latest clip through Gun.
- `/gun-live-room/` tries a rough Zoom-style room without WebRTC media tracks.

The live room publishes:

- Low-rate JPEG camera frames to `3dvr-gun-live-room/<room>/frames/<participantId>`.
- Short microphone chunks to `3dvr-gun-live-room/<room>/audio/<participantId>`.
- Presence to `3dvr-gun-live-room/<room>/participants/<participantId>`.

This is intentionally experimental. Audio can be choppy, autoplay can require a page tap, and Gun relays are not a media SFU. It is useful for testing whether the pure Gun transport can carry a rough live audio/video room at all.
