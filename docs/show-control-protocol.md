# 3DVR Open Show Control Protocol 0.1

Status: experimental working protocol.

The core design law is **device ≠ role**. Physical devices advertise capabilities. A show declares roles. The runtime assigns roles to capable online nodes and resolves cues through those role assignments.

## Core objects

### Node

A node is any participating device or process.

```json
{
  "id": "stage-pi",
  "label": "Stage Pi",
  "status": "online",
  "priority": 8,
  "capabilities": ["usb-dmx", "audio-output", "gpio"]
}
```

### Role

A role describes a show responsibility through required capabilities.

```json
{
  "id": "lighting-output",
  "requires": ["usb-dmx"]
}
```

Roles may optionally name a preferred node, but preference never substitutes for capability matching.

### Assignment

Assignments map role IDs to node IDs.

```json
{
  "presentation-output": "foh-mac",
  "lighting-output": "stage-pi",
  "audio-playback": "foh-mac"
}
```

A valid existing assignment is kept stable while the node remains online and capable. If that node goes offline, the runtime selects the next capable node.

### Cue

A cue contains actions addressed to roles, not hardware.

```json
{
  "id": "keynote-start",
  "actions": [
    { "role": "presentation-output", "command": "presentation.next" },
    { "role": "lighting-output", "command": "lighting.scene", "payload": { "scene": "Keynote" } },
    { "role": "audio-playback", "command": "audio.fade", "payload": { "bus": "walk-in", "level": 0 } }
  ]
}
```

Cue resolution produces concrete node-targeted commands only at execution time.

## Transport envelope

Network transports should carry versioned messages in this shape:

```json
{
  "type": "node.hello",
  "protocolVersion": "0.1.0",
  "messageId": "m-123",
  "showId": "keynote",
  "nodeId": "stage-pi",
  "sentAt": 1789495000000,
  "payload": {}
}
```

The protocol model is transport-neutral. Initial transports can include WebSocket on LAN, WebRTC data channels, HTTP for management, and later local IPC for single-machine deployments.

## Initial message types

- `node.hello` — announce identity and capabilities.
- `node.heartbeat` — prove liveness and optionally refresh capabilities/state.
- `node.goodbye` — gracefully leave a show.
- `show.snapshot` — current roles, assignments, cue position, and resource metadata.
- `show.command` — one resolved action targeted at a role/node.
- `show.ack` — node acknowledgement/result for a command.
- `show.event` — operator or device event that may advance state.

## Failover rules

1. Keep a valid assignment stable.
2. If a node disappears or loses a required capability, unassign its affected roles.
3. Prefer a role's explicit preferred node when that node is capable and online.
4. Otherwise prefer higher-priority nodes, then lower current assignment load.
5. Leave a role unresolved rather than silently assigning an incapable node.
6. The cue engine must report unresolved actions instead of pretending they ran.

## Adapter boundary

Hardware/protocol adapters live outside the core assignment engine. Examples:

- `lighting.scene` → USB-DMX, Art-Net, sACN, or OSC adapter.
- `audio.fade` → local audio engine, network audio, MIDI, OSC, or mixer adapter.
- `presentation.next` → native renderer, browser renderer, PDF/PPTX bridge, or external presentation adapter.
- `gpio.set` → Linux GPIO or microcontroller bridge.

The core only decides **what role should execute what command**. Adapters decide how a specific capable node performs it.

## Next protocol steps

1. Add authenticated LAN discovery and WebSocket transport.
2. Add command acknowledgements, deadlines, idempotency keys, and retries.
3. Add resource declarations for displays, audio endpoints, DMX universes, media, and cameras.
4. Add mirrored/hot-standby roles for zero-interruption playback.
5. Build the first real adapter pair: browser presentation + Art-Net/sACN lighting.
