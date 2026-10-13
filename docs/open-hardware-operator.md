# 3DVR Open Hardware Operator

Status: proposal / prototype planning (2026-10-13)

## Vision
One Operator, unlimited devices. Build an open ecosystem of inexpensive, interchangeable hardware interfaces to the 3DVR Operator, rather than a closed AI gadget.

## Architecture
- **Server-first:** authenticated Operator API, device registry, capability permissions, task execution, and synchronization live on authorized 3DVR infrastructure.
- **Device clients:** ESP32 for buttons, sensors, motors, small displays and simple audio peripherals; Raspberry Pi for richer local interfaces; phones, wearables, VR and smart-home devices as additional clients.
- **Offline-first controls where appropriate:** local physical control and safe fallback behavior should not depend on network availability. Sensitive or remote actions require explicit authorization.
- **Open interoperability:** document transport, message schemas, discovery, pairing, and capability negotiation; avoid locking devices to a specific model or vendor.

## First experiment: inexpensive ESP32 Operator accessory
Target parts budget: **$20–$50** (estimate, not a verified bill of materials).
1. ESP32 board, button, LED/status display, and optional small screen.
2. Pair with a user-owned Operator account through a short-lived enrollment flow.
3. Send button/sensor events to Operator and display bounded, actionable responses.
4. Provide an explicit disconnect/revoke control and meaningful offline state.
5. Measure latency, reliability, battery/power, setup time, and user comprehension.

## Security and privacy
- Per-device identity, least-privilege capabilities, revocable tokens and encrypted transport.
- No default access to microphones, cameras, home actuators, or privileged server operations.
- Confirm potentially consequential actions; log device actions without unnecessary sensitive data.
- Firmware update integrity, secure credential storage when supported, and recovery/reset flow.
- Local processing where practical; avoid streaming raw sensor/audio data without need.

## Milestones
1. Publish device protocol and threat model.
2. Build and document ESP32 proof of concept.
3. Add a Portal device list, pairing, status, and permission management.
4. Test Raspberry Pi and phone clients using the same protocol.
5. Release reference firmware, examples, and reproducible build instructions under a clearly selected open-source license.

## External reference
An October 2026 social-media post claims Meta released Muse hardware integration for Raspberry Pi/ESP32 and demonstrated home peripherals. **Unverified:** locate the primary repository, confirm license, actual hardware support and constraints before treating this as a dependency.

## Success criteria
A new user can assemble, pair, use, disconnect, and recover a simple device without proprietary hardware, while keeping control of data and permissions.
