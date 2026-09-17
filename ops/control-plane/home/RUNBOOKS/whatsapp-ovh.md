# WhatsApp on OVH communications lane

Last verified: 2026-09-17

## Purpose

Run Thomas's WhatsApp Web session persistently on the OVH digital-twin host so ChatGPT/3DVR agents can inspect chats without depending on Thomas's laptop.

This is part of the broader communications lane alongside Google Messages and other browser-based messaging tools.

## Canonical host and browser lane

- Host: OVH VPS (`vps-2b6a0420` in Remote Desktop Commander).
- Browser lane: `communications` / legacy service name `messaging`.
- CDP port: `9444` bound to localhost.
- Persistent profile: `/home/debian/.config/3dvr/browser-profiles/messaging`.
- Systemd service: `3dvr-browser-lane@messaging.service`.
- Launcher: `/usr/local/bin/3dvr-browser-lane-start`.
- Browser: Google Chrome Stable, not Chrome for Testing.
- Display: Xvfb virtual display; do not use Chrome's headless mode for WhatsApp.

The service is enabled at boot and the WhatsApp profile is persistent across browser/server restarts.

## Why this configuration exists

WhatsApp Web rejected Chrome for Testing/headless sessions with the false compatibility message `WhatsApp works with Google Chrome 100+` even on Chrome 152.

The working configuration uses normal Google Chrome Stable under Xvfb. The browser must report a normal Chrome user agent and `navigator.webdriver=false`.
## Linking procedure

1. Open `https://web.whatsapp.com/` in the OVH communications lane.
2. Choose **Link with phone number instead** from the QR login screen. Do not use the separate `Log in with phone number` registration flow; that can trigger SMS account-registration instructions instead of device linking.
3. Enter the account's phone number only into WhatsApp's linking form.
4. On the phone: WhatsApp → Linked devices → Link a device → Link with phone number instead.
5. Enter the one-time code shown by WhatsApp Web.
6. Verify the web session reaches the chat list and can read recent chat metadata/messages.

Never commit the phone number, one-time link code, QR material, cookies, session databases, or other authentication material. The persistent browser profile stays only on the authorized host.

## Verification

Useful checks on OVH:

```sh
systemctl is-enabled 3dvr-browser-lane@messaging.service
systemctl is-active 3dvr-browser-lane@messaging.service
curl -s http://127.0.0.1:9444/json/version
3dvr-browser-health
```

A successful runtime check should show Google Chrome Stable on port `9444`, a persistent messaging profile, and WhatsApp Web at `https://web.whatsapp.com/` with the account already linked.
## Agent operating boundary

Agents may autonomously read, search, organize, summarize, classify, and draft from WhatsApp when that supports Thomas's work and personal organization.

Do not automatically send messages to people Thomas already knows personally or professionally. Prepare the reply and request approval before sending. Existing broader outreach rules for fresh leads remain separate.

For booking-agent workflows, prefer: read new messages → identify work/scheduling opportunities → reconcile against calendar/availability → draft response → request approval if the recipient is a known contact → send only after approval.

## Recovery and troubleshooting

- If WhatsApp shows the Chrome 100+ compatibility page, confirm the communications service is using `/usr/bin/google-chrome-stable` under Xvfb rather than Chrome for Testing/headless mode.
- Do not create a second writer against the same persistent profile. Use the communications lane lease/wrapper when possible.
- If OVH becomes sluggish during package/browser work, check `/tmp`: it is a tmpfs and stale `3dvr-*` scratch workspaces can consume RAM. Remove only confirmed stale scratch directories, never persistent repos or profiles.
- If the WhatsApp device becomes unlinked, repeat the phone-number linking procedure; do not destroy the profile first.
- Never restart Desktop Commander merely to repair WhatsApp. Repair/restart only the messaging browser service or lane.

## Security note

WhatsApp messages remain end-to-end encrypted between linked WhatsApp clients. Linking OVH makes the authorized OVH browser one of those clients, so protect the host and browser profile as account-sensitive data.