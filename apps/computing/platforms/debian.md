# 3DVR Desktop — Debian track

Start from Debian rather than replacing the Linux ecosystem. The 3DVR-specific layer belongs above the kernel, drivers, systemd, desktop stack, and package manager.

The first adapter should expose a tiny allowlist through the shared capability contract:

- `os.notify`
- `browser.open`
- `app.launch`
- `file.reveal`

Arbitrary shell execution is intentionally not part of v0. Higher-risk capabilities can be added later with explicit policy, previews, and receipts.

Longer term, this track can become a reproducible Debian image plus 3DVR session/launcher packages rather than a hard fork of Debian itself.
