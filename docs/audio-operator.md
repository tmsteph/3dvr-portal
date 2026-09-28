# 3DVR Audio Operator 0.1

Status: experimental, simulation-first.

Audio Operator extends Open Show Control with a normalized mixer-control layer. The goal is to let Operator reason about audio using one stable command vocabulary while hardware-specific adapters translate those commands for a real console.

## Architecture

```text
ChatGPT / 3DVR Operator
        |
normalized audio commands
        |
safety policy + approval gate
        |
Open Show Control audio role
        |
hardware adapter
        |
network mixer
```

The model never needs to know whether the final transport is OSC, MIDI, HTTP, WebSocket, TCP/UDP, a vendor SDK, or another protocol. The adapter owns those details.

## Initial normalized commands

- `audio.channel.fader`
- `audio.channel.mute`
- `audio.scene.recall`
- `audio.preamp.gain`

The first browser lab only applies fader and mute changes. Scene recall and preamp gain exist so the policy can explicitly block them rather than silently ignoring them.

## Safety defaults

- Simulation mode is the default.
- Scene recall is disabled.
- Preamp gain is disabled.
- Fader moves larger than 6 dB require confirmation.
- Protected-channel changes require confirmation.
- Unsupported commands are blocked.
- Human override remains authoritative.

A real adapter should add rate limits, stale-state detection, command acknowledgements, deadlines, audit logging, and an emergency stop before live use.

## Adapter contract

A mixer adapter should:

1. Discover or receive the console address.
2. Read enough state to build the normalized channel snapshot.
3. Advertise mixer capabilities to Open Show Control.
4. Accept only policy-approved normalized commands.
5. Translate them to the mixer protocol.
6. Return acknowledgements and refreshed state.
7. Stop writing immediately when its lease, session, or emergency-stop state is invalid.

## First hardware targets

Start with mixers that expose reliable network control and are easy to test safely. Build one adapter at a time behind the same normalized interface, then add manufacturer-specific capabilities only where the shared model is insufficient.

## Browser lab

Open `/show-control/audio-operator.html`.

It is intentionally simulation-only and demonstrates the approval boundary without touching real equipment.
