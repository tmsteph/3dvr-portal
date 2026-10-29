# OVH 4over artwork egress recovery

The 2026-10-29 incident affected artworktool-modern.4over.com (136.179.51.100).
DNS and local OUTPUT rules were healthy, but TCP SYNs left OVH without replies.
The store remained reachable; the artwork host returned HTTP 200 from Hetzner.
The exact upstream cause remains unconfirmed.

This recovery keeps the persistent authenticated browser on OVH. An SSH tunnel
uses the existing 3dvr-hetzner identity and binds only 127.0.0.1:18444. TLS remains
end-to-end with 4over and certificate verification stays enabled. One OUTPUT
DNAT rule matches only browser UID 1000 and the resolved artwork IPv4 address
on TCP 443. Other destinations and users retain their normal routing.
No credentials, browser profiles, or cookies move to Hetzner.

The helper and unit are already installed on canonical OVH; this directory
records the deployed configuration. Do not install on other nodes or browsers
without reviewing their UID, SSH mesh identity, and the vendor destination.
The unit retries its startup probe while the SSH listener becomes ready,
restarts failed tunnels, and removes only its own NAT rule on stop.

Validation: Python compile, systemd unit verification, HTTP 200 through the
normal HTTPS URL, loopback-only listener, exact UID/destination rule, stop
cleanup and restart. Portal health remained healthy with native Operator API.

Rollback:
    sudo systemctl disable --now 3dvr-4over-artwork-egress.service

Stopping the service removes its marked rule. This restores direct routing;
the original upstream path may still fail. Refresh the service if vendor DNS
changes. Successful curl alone is not proof that the complete uploader works;
verify file selection, upload, and preview in the canonical browser.
