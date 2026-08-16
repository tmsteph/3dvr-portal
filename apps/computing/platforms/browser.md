# 3DVR Browser — Chromium/Brave track

Compatibility comes first, so the initial browser should build on Chromium/Brave rather than a new rendering engine.

The 3DVR layer should expose browser actions as explicit capabilities, for example:

- `browser.open`
- `browser.tab.create`
- `browser.tab.close`
- `browser.page.read`
- `browser.page.act`
- `browser.download`

Page-level actions should inherit the same permission model and receipt format as OS actions. The browser is therefore a peer adapter to Debian and Android, not a separate automation universe.

Start with a development shell or extension/protocol adapter. Fork browser chrome only after the capability contract and user experience prove useful.
