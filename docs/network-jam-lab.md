# 3DVR Network Jam Lab

Status: concept / research brief (2026-10-11). No working audio service is claimed.

## Vision
Browser-first open-source remote music lessons and real-time network jamming. Treat musical time separately from network arrival time. Build around a common tempo, transport and shared musical timeline.

## Primary scenarios
1. **Remote lessons:** teacher sets backing track, tempo, count-in, loop regions; student hears their own instrument locally; capture and compare timestamped takes, phrase by phrase.
2. **Clock Jam:** participants hear their own low-latency instrument plus the same synchronized click/backing track. No remote audio in headphones; server aligns each recorded stream for an audience or later playback.
3. **Buffered Ensemble:** timestamp audio against shared clock, use jitter buffers to produce a delayed aligned ensemble mix; optionally delay each player's own instrument in the ensemble bus.
4. **Hybrid:** direct local monitoring plus separately adjustable delayed ensemble bus; experiment with musical delays of a beat/bar, avoiding confusing echo.
5. **Call-and-response / loop jam:** deliberately time-shifted musical interactions.

## Critical constraints
- Buffering fixes arrival variation and aligns past events; it **cannot** remove causal delay for live reactions.
- Hearing one's own instrument delayed by hundreds of milliseconds or beats may impair performance. Test rather than assume viability.
- Backing tracks must start at a common *scheduled clock time*, with offset/drift correction, not merely on receipt of a play command.
- Account for audio input/output device latency, clock drift, jitter, loss, and Bluetooth headphone delays.
- Distinguish recording synchronization from perceptually interactive jamming.

## Proposed architecture
- Browser UI: Web Audio AudioWorklet for click/transport and capture; microphone permissions, audio device setup and monitoring.
- Signaling/control: WebSocket session coordinator for tempo, transport, scheduled start, bar markers, member state.
- Clock: estimate offset, drift, round-trip time, jitter; use periodic sync and local high-resolution scheduling.
- Transport: WebRTC for live streams; timestamped audio chunks or packets for aligned replay/mix.
- Mixer: local direct monitor, delayed ensemble bus, backing track, per-user level/mute and buffer controls.
- Server: start with existing authorized 3DVR infrastructure, deploy only after tests and approval as appropriate; keep audio processing privacy-first, opt-in recording and short retention.
- Fallback: audio-only, low bitrate, adaptive buffering and graceful packet loss behavior.

## MVP experiment
Two musicians in a room; shared 4/4 click and selectable BPM; scheduled count-in; each records to common timeline. Show measured RTT, jitter, estimated device latency, drift, and effective buffer. Offer modes: (A) click + self only; (B) live remote audio; (C) delayed full mix; (D) direct self + delayed mix. Produce aligned playback after a 30-second take.

## Test protocol
Test same LAN, nearby WAN, and cross-country WAN. Use wired headphones/interfaces first. Record onset errors relative to metronome, buffer underruns, dropout rate, clock drift, and participant-rated playability. Test 0/1 beat/1 bar/2 bar delay. Do not describe delayed monitoring as real-time interactive success unless actual players report it useful.

## Next increments
Teacher dashboard with synchronized loop regions and take comparisons; MIDI note events for timing/pitch feedback; public delayed performance broadcast; native low-latency client exploration if browser limits dominate.

## Product principles
Open source, accessible from phones and desktops, inexpensive to host, and compatible with standard audio interfaces. Keep lessons and jamming as two interfaces built on the same clock/audio engine.
