# Shared Presence

Shared Presence is the consent-based ambient-audio recorder in 3DVR Companion.

## User flow

1. Open the private one-time pairing URL on the Android phone.
2. The page hands the HTTPS server plus upload/listener credentials to Companion through the `threedvr://presence/pair` deep link.
3. Companion stores those credentials with its Android Keystore-backed secret store.
4. Grant microphone + notification permission and explicitly enable the existing 3DVR Companion Accessibility service.
5. Tap **Start sharing**. Companion posts a persistent high-importance notification saying that shared audio recording is on.
6. The partner uses the private listener link for live audio and completed recordings.
7. Tap **Stop sharing** to stop microphone capture. The uploader finishes syncing the local file, finalizes the server copy, then removes the synced local master.

## Reliability model

The microphone writes Ogg/Opus to an app-private local file first. A separate uploader tails that growing file over HTTPS.

The server exposes an authoritative byte offset. After a network failure the phone asks for that offset and resumes from the matching byte, so loss of live connectivity does not itself stop or erase the local recording.

## Calls

The recorder is owned by the explicitly enabled Android `AccessibilityService`. Android documents an audio-input sharing exception that permits an accessibility service to capture input while a voice call has priority.

This is still **ambient microphone capture**. Shared Presence does not request privileged `CAPTURE_AUDIO_OUTPUT`, does not extract cellular/VoIP downlink audio, and does not claim to record the remote caller directly.

Actual behavior must be device-tested because OEM audio policy can differ. The acceptance test is: start Shared Presence, start a normal call, speak near the phone, end the call, and verify an uninterrupted local/server recording.

## Privacy and distribution

Shared Presence is deliberately not stealth software:

- start is explicit;
- notification permission is required;
- the recording notification remains ongoing while capture is active;
- the partner link is private;
- pairing is one-time;
- upload and listener credentials are different;
- all people in a confidential conversation should know about and consent to recording where required.

Using Accessibility for this purpose also needs a platform-policy review before any Play Store distribution. The initial target is user-controlled/sideloaded 3DVR Companion.

## Server routes

- `POST /api/presence-audio/stream`
- `GET /api/presence-audio/offset/:session`
- `POST /api/presence-audio/finalize/:session`
- `GET /api/presence-audio/status`
- `GET /api/presence-audio/live/:session`
- `GET /api/presence-audio/sessions`
- `GET /api/presence-audio/recordings/:session`
- `GET /presence-audio/`

Runtime secrets are generated on the self-hosted portal and are never committed.
