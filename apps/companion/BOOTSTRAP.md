# Canonical Companion bootstrap

This file marks the first consolidated 3DVR Companion bootstrap after the duplicate prototype was retired.

The canonical Android build now includes:

- the always-on native localhost recovery bridge;
- the authenticated direct Fly relay with Android Keystore-backed ephemeral credentials;
- Vercel workload-identity command routing;
- bounded direct actions for device status, known app launch, and HTTPS URL launch;
- persistent signed Android releases with self-update verification;
- the Android Assistant role and VoiceInteractionService/session foundation.

Termux remains a recovery/debug path, not the intended daily control path.

Next activation milestones are live device registration, direct command round-trip, Android Assistant selection, microphone consent, and OpenAI Realtime speech wiring.
