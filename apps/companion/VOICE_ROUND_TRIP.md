# Android Assistant voice round trip

This is the first end-to-end daily-driver voice proof for 3DVR Companion.

## User path

1. Open 3DVR Companion.
2. Make 3DVR Companion the Android Assistant.
3. Allow microphone access.
4. Invoke the Android Assistant gesture or button.
5. Say **“Open Maps.”**
6. Companion recognizes the phrase, routes it to the bounded `app.open_known` capability, launches Maps, and stores a receipt.
7. Reopen Companion to inspect the latest voice receipt.

## Admitted commands

The first voice proof only accepts `open`, `launch`, or `start` requests for these known targets:

- Maps
- Gmail
- Camera
- Messages
- Calendar
- Chrome
- ChatGPT
- Settings

Anything else is rejected as `unsupported_voice_command`.

## Safety boundary

This path does not accept arbitrary package names, URLs, Accessibility selectors, shell commands, Shizuku operations, financial actions, account changes, or outbound messages. It stores no raw audio. Only the latest short transcript and bounded action result are retained as a user-visible receipt.

## Realtime next

OpenAI Realtime remains the conversational intelligence upgrade. The device-action contract does not need to change when Realtime is added: model tool calls should still resolve into the same bounded Companion capabilities and receipts rather than gaining direct device authority.
