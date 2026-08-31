# 3DVR Show-Tech Node v0.1

A small proof that an ordinary computer can become a discoverable, remotely controlled audio/video output node on a local network.

This is deliberately dependency-free. It needs Node.js 22+ and a browser.

## Architecture

```text
Desk / Core
    |
    | control + state (small messages)
    v
Show Node --------------------> local browser / display / speakers
    |
    +-- UDP discovery
    +-- capability manifest
    +-- authenticated actions
    +-- local timestamp scheduling
    +-- SSE state/events
```

The control plane is intentionally separate from the future media data plane. Large audio/video streams should not be routed through the Core just to be controlled.

## Run a node

```bash
SHOW_NODE_TOKEN=demo-secret node show-tech/node.mjs
```

Open this on the output machine and make it fullscreen:

```text
http://localhost:47771/output
```

The node listens on:

- UDP `47770` for discovery
- HTTP `47771` for capability/state/control/output

## Discover nodes

From another computer on the same LAN:

```bash
node show-tech/discover.mjs
```

A discovered node reports its ID, hostname, platform, architecture, protocol version, address, and control port.

## Inspect capabilities

```bash
curl http://NODE_IP:47771/v1/capabilities
```

## Send an action

```bash
curl -X POST http://NODE_IP:47771/v1/actions \
  -H 'Authorization: Bearer demo-secret' \
  -H 'Content-Type: application/json' \
  -d '{"type":"display.text","payload":{"text":"Welcome to 3DVR Show"}}'
```

Change the output background:

```bash
curl -X POST http://NODE_IP:47771/v1/actions \
  -H 'Authorization: Bearer demo-secret' \
  -H 'Content-Type: application/json' \
  -d '{"type":"display.color","payload":{"color":"#101827"}}'
```

Load media into the browser output:

```bash
curl -X POST http://NODE_IP:47771/v1/actions \
  -H 'Authorization: Bearer demo-secret' \
  -H 'Content-Type: application/json' \
  -d '{"type":"media.load","payload":{"src":"https://example.com/video.mp4","autoplay":false}}'
```

Then send `media.play`, `media.pause`, `media.volume`, or `media.mute`.

Browsers may require a local user gesture before unmuted media can autoplay. Native media/audio adapters will remove that browser limitation later.

## Schedule locally

`executeAt` is Unix epoch time in milliseconds. The Core can preload an action and let the node execute it locally:

```json
{
  "id": "cue-42-screen-1",
  "type": "display.text",
  "executeAt": 1788216000000,
  "payload": { "text": "GO" }
}
```

This prototype allows scheduling up to 24 hours ahead.

## v0.1 actions

- `display.color`
- `display.text`
- `media.load`
- `media.play`
- `media.pause`
- `media.volume`
- `media.mute`

## Next adapters

Keep the protocol stable and replace/extend the browser output with capability adapters:

1. PipeWire audio device enumeration, routing, gain and mute on Linux.
2. GStreamer video playback/output with explicit display selection.
3. OSC and MIDI input/output.
4. Art-Net/sACN lighting output through OLA or a native adapter.
5. PJLink projector control.
6. RTP/SRT/WebRTC media transport where live media is required.
7. Windows and macOS native capability adapters behind the same node contract.

The goal is not for every computer to expose every capability. Each node advertises what hardware and software it actually has, and the Show Core patches logical show resources to those capabilities.
