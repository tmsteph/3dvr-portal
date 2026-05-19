# 3DVR Gun Chunk Stream

Pure Gun audio/video chunk stream experiment.

This app records locally and uploads while recording:

- `MediaRecorder.start(timeslice)` emits short audio/video WebM chunks.
- Each chunk is converted to a data URL.
- Gun stores chunks at `3dvr-gun-chunk-stream/<room>/chunks/<participantId_sequence>`.
- Receivers append chunks into a `MediaSource` video player when supported.

This should be smoother than the pure frame/audio live room because the browser encodes synchronized audio and video locally first. It is still experimental: WebM chunk playback support varies by mobile browser, and Gun is still carrying large base64 payloads through the graph.
