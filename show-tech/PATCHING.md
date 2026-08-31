# 3DVR Show-Tech patching

The node exposes a small logical-to-physical patchbay.

## Logical outputs

- `program.video` — the show program video destination
- `program.audio` — the show program audio destination

## Inspect ports

```bash
curl http://NODE_IP:47771/v1/ports
```

The response contains `logicalOutputs`, currently available `ports`, and the current `patches` map.

## Browser patchbay

Open:

```text
http://NODE_IP:47771/patch
```

Enter the node control token, choose a target for Program Video or Program Audio, and press **Patch**.

The token is stored only in that browser tab's session storage.

## Patch through the API

```bash
curl -X POST http://NODE_IP:47771/v1/actions \
  -H 'Authorization: Bearer demo-secret' \
  -H 'Content-Type: application/json' \
  -d '{"type":"patch.set","payload":{"logical":"program.video","target":"video:gstreamer:auto"}}'
```

On a PipeWire node, a discovered sink can be selected similarly:

```json
{
  "type": "patch.set",
  "payload": {
    "logical": "program.audio",
    "target": "audio:pipewire:52"
  }
}
```

In v0.1, selecting a concrete PipeWire audio sink makes that sink the node's default output through WirePlumber. Native GStreamer playback then follows that default. This is intentionally conservative and interoperable; per-stream sink routing can be layered on later without changing the logical patch schema.

## Current video ports

- `video:browser`
- `video:gstreamer:auto` when GStreamer is installed
- `video:gstreamer:headless` for cloud/CI simulation

Explicit DRM/KMS and Wayland connector targeting is the next video-routing layer. The patch IDs are designed so connector-specific ports can be added without changing cue or Core semantics.
