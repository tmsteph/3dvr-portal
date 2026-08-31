# 3DVR Show-Tech Node v0.1

A small proof that an ordinary computer can become a discoverable, remotely controlled audio/video output node on a network.

The core needs Node.js 22+. Browser output works with no extra dependencies. When GStreamer or PipeWire/WirePlumber are available, the same node advertises those native capabilities automatically.

## Architecture

```text
Desk / Core
    |
    | control + state (small messages)
    v
Show Node --------------------> browser output
    |                         > GStreamer display / speakers
    |                         > PipeWire sinks / sources
    |
    +-- UDP discovery
    +-- explicit URL targets for routed/cloud nodes
    +-- capability manifest
    +-- authenticated actions
    +-- local timestamp scheduling
    +-- SSE state/events
```

The control plane stays separate from media transport. Large audio/video streams do not need to pass through the Core just to be controlled.

## Run a node

```bash
SHOW_NODE_TOKEN=demo-secret node show-tech/node.mjs
```

Open the browser output locally and make it fullscreen:

```text
http://localhost:47771/output
```

The node listens on UDP `47770` for LAN discovery and HTTP `47771` for capabilities, state, control, events, and browser output.

## Native GStreamer output

On Debian/Ubuntu:

```bash
sudo apt install gstreamer1.0-tools gstreamer1.0-plugins-base
SHOW_NODE_TOKEN=demo-secret node show-tech/node.mjs
```

The node will then advertise `av.gstreamer` with these actions:

- `native.av.test` — SMPTE video bars plus a 1 kHz audio test tone
- `native.media.play` — native media playback through GStreamer `playbin`
- `native.media.stop`

Test physical outputs:

```bash
curl -X POST http://NODE_IP:47771/v1/actions \
  -H 'Authorization: Bearer demo-secret' \
  -H 'Content-Type: application/json' \
  -d '{"type":"native.av.test","payload":{"durationMs":1000,"outputMode":"output"}}'
```

On a machine with a graphical/audio session, `output` uses GStreamer's automatic video and audio sinks. In cloud/headless environments use `"outputMode":"headless"`; the same audio/video pipelines run into `fakesink`, allowing CI to verify that buffers flow and the pipeline reaches clean end-of-stream without pretending a cloud VM has a monitor or speakers.

Play a file or URL natively:

```bash
curl -X POST http://NODE_IP:47771/v1/actions \
  -H 'Authorization: Bearer demo-secret' \
  -H 'Content-Type: application/json' \
  -d '{"type":"native.media.play","payload":{"src":"/absolute/path/to/media.mp4"}}'
```

## PipeWire audio control

When `wpctl` can reach a running PipeWire/WirePlumber session, the node advertises `audio.pipewire`. If the tool exists but the session is unavailable, the health/state endpoints expose the diagnostic without falsely advertising audio control.

Supported actions:

- `audio.refresh` — refresh sinks, sources, and session state
- `audio.volume` — set a sink/source volume from `0` to `1`
- `audio.mute` — mute, unmute, or toggle a sink/source
- `audio.default` — select a numeric sink/source node as the default

Set the default playback device to 65%:

```bash
curl -X POST http://NODE_IP:47771/v1/actions \
  -H 'Authorization: Bearer demo-secret' \
  -H 'Content-Type: application/json' \
  -d '{"type":"audio.volume","payload":{"value":0.65}}'
```

Mute a specific PipeWire node:

```bash
curl -X POST http://NODE_IP:47771/v1/actions \
  -H 'Authorization: Bearer demo-secret' \
  -H 'Content-Type: application/json' \
  -d '{"type":"audio.mute","payload":{"target":42,"value":true}}'
```

The adapter prefers modern machine-readable `wpctl list` output and falls back to parsing `wpctl status -n` for older WirePlumber installations.

## Discover nodes

From another computer on the same LAN:

```bash
node show-tech/discover.mjs
```

For routed networks and cloud nodes, use `show-tech/control.mjs` with explicit node URLs rather than relying on broadcast discovery.

## Inspect capabilities

```bash
curl http://NODE_IP:47771/v1/capabilities
```

## Browser output actions

```bash
curl -X POST http://NODE_IP:47771/v1/actions \
  -H 'Authorization: Bearer demo-secret' \
  -H 'Content-Type: application/json' \
  -d '{"type":"display.text","payload":{"text":"Welcome to 3DVR Show"}}'
```

Browser actions currently include:

- `display.color`
- `display.text`
- `media.load`
- `media.play`
- `media.pause`
- `media.volume`
- `media.mute`

## Schedule locally

`executeAt` is Unix epoch time in milliseconds. The Core can deliver an action early and let each node execute it locally:

```json
{
  "id": "cue-42-screen-1",
  "type": "native.av.test",
  "executeAt": 1788216000000,
  "payload": { "durationMs": 1000 }
}
```

The current prototype accepts scheduling up to 24 hours ahead. Cloud-stage CI exercises shared timestamped cues across multiple nodes.

## Next adapters

1. PipeWire graph patching between arbitrary ports/streams, not just defaults/volume/mute.
2. Explicit GStreamer display/audio-device selection and media preloading.
3. OSC and MIDI input/output.
4. Art-Net/sACN lighting output through OLA or a native adapter.
5. PJLink projector control.
6. RTP/SRT/WebRTC media transport for live feeds.
7. Windows and macOS native adapters behind the same node contract.

The goal is not for every computer to expose every capability. Each node advertises the hardware/software it actually has, and the Show Core patches logical show resources to those capabilities.
