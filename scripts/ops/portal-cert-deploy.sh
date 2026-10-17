#!/bin/sh
set -eu
[ "${RENEWED_LINEAGE:-}" = /etc/letsencrypt/live/portal-ovh-bootstrap ] || exit 0
install -m 644 -o root -g caddy "$RENEWED_LINEAGE/fullchain.pem" /etc/caddy/portal-tls/fullchain.pem
install -m 640 -o root -g caddy "$RENEWED_LINEAGE/privkey.pem" /etc/caddy/portal-tls/privkey.pem
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy
