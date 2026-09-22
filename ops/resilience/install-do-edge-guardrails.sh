#!/usr/bin/env bash
set -euo pipefail

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo "root required" >&2; exit 77; }

install -d -m 0755 /var/www/3dvr-emergency
cat >/var/www/3dvr-emergency/index.html <<'HTML'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <title>3DVR Safe Mode</title>
  <style>
    :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0d1117;color:#e6edf3;font:16px/1.5 system-ui,sans-serif;padding:24px}
    main{width:min(620px,100%);border:1px solid #30363d;border-radius:18px;padding:28px;background:#161b22}
    h1{margin:.2rem 0 1rem;font-size:clamp(1.8rem,7vw,3rem)}p{color:#b8c2cc}.status{display:inline-block;padding:.35rem .7rem;border:1px solid #4b5563;border-radius:999px;font-size:.9rem;color:#d1d5db}
  </style>
</head>
<body>
  <main>
    <span class="status">3DVR safe mode</span>
    <h1>The portal is recovering.</h1>
    <p>The edge is healthy, but the primary portal backend is temporarily slow or unavailable. No action is required; retry shortly.</p>
    <p>This lightweight page is intentionally independent of the experimental workloads on the primary server.</p>
  </main>
</body>
</html>
HTML

cat >/etc/caddy/Caddyfile <<'CADDY'
:80 {
  root * /var/www/3dvr-emergency
  encode zstd gzip
  header X-3DVR-Edge digitalocean

  handle /__3dvr-edge-health {
    header Content-Type application/json
    respond `{"ok":true,"edge":"digitalocean","upstreams":["ovh-primary","hetzner-standby","digitalocean-local"],"safeMode":"static"}` 200
  }

  handle /__3dvr-primary-health {
    rewrite * /__3dvr-health
    reverse_proxy 127.0.0.1:14320 {
      transport http {
        dial_timeout 2s
        response_header_timeout 5s
      }
    }
  }

  handle /__3dvr-standby-health {
    rewrite * /__3dvr-health
    reverse_proxy 127.0.0.1:14322 {
      transport http {
        dial_timeout 2s
        response_header_timeout 5s
      }
    }
  }

  handle /__3dvr-local-health {
    rewrite * /__3dvr-health
    reverse_proxy 127.0.0.1:4320 {
      transport http {
        dial_timeout 2s
        response_header_timeout 5s
      }
    }
  }

  @ai_api path /api/openai-site*
  handle @ai_api {
    reverse_proxy 127.0.0.1:14320 127.0.0.1:14322 127.0.0.1:4320 {
      lb_policy first
      transport http {
        dial_timeout 2s
        response_header_timeout 75s
      }
      health_uri /__3dvr-health
      health_interval 15s
      health_timeout 3s
      fail_duration 20s
      max_fails 1
      unhealthy_status 5xx
      unhealthy_latency 75s

      @upstream_error status 500 502 503 504
      handle_response @upstream_error {
        header Content-Type application/json
        respond `{"error":"3DVR backend temporarily unavailable","safeMode":true}` 503
      }
    }
  }

  # Secret operations are stateful and control-node-bound. Never fail these over
  # to the Hetzner standby: request state, the broker socket, and OpenBao authority
  # all live on the OVH primary.
  @secret_api path /api/secrets-broker /api/secret-handoff
  handle @secret_api {
    reverse_proxy 127.0.0.1:14320 {
      transport http {
        dial_timeout 2s
        response_header_timeout 15s
      }

      @upstream_error status 500 502 503 504
      handle_response @upstream_error {
        header Content-Type application/json
        respond `{"error":"3DVR control node temporarily unavailable","safeMode":true}` 503
      }
    }
  }

  @api path /api/*
  handle @api {
    reverse_proxy 127.0.0.1:14320 127.0.0.1:14322 127.0.0.1:4320 {
      lb_policy first
      transport http {
        dial_timeout 2s
        response_header_timeout 15s
      }
      health_uri /__3dvr-health
      health_interval 15s
      health_timeout 3s
      fail_duration 20s
      max_fails 1
      unhealthy_status 5xx
      unhealthy_latency 15s

      @upstream_error status 500 502 503 504
      handle_response @upstream_error {
        header Content-Type application/json
        respond `{"error":"3DVR backend temporarily unavailable","safeMode":true}` 503
      }
    }
  }

  handle {
    reverse_proxy 127.0.0.1:14320 127.0.0.1:14322 127.0.0.1:4320 {
      lb_policy first
      transport http {
        dial_timeout 2s
        response_header_timeout 15s
      }
      health_uri /__3dvr-health
      health_interval 15s
      health_timeout 3s
      fail_duration 20s
      max_fails 1
      unhealthy_status 5xx
      unhealthy_latency 15s

      @upstream_error status 500 502 503 504
      handle_response @upstream_error {
        rewrite /index.html
        file_server
      }
    }
  }

  handle_errors {
    @api_error path /api/*
    handle @api_error {
      header Content-Type application/json
      header Retry-After 30
      respond `{"error":"3DVR backend temporarily unavailable","safeMode":true}` 503
    }
    handle {
      header Content-Type text/html
      header Retry-After 30
      respond `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>3DVR Safe Mode</title></head><body style="font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;margin:0;min-height:100vh;display:grid;place-items:center;padding:24px"><main style="max-width:620px"><p>3DVR safe mode</p><h1>The portal is recovering.</h1><p>The edge is healthy, but both portal backends are temporarily unavailable. Retry shortly.</p></main></body></html>` 503
    }
  }
}
CADDY

caddy validate --config /etc/caddy/Caddyfile

cat >/etc/systemd/system/3dvr-edge.slice <<'UNIT'
[Unit]
Description=3DVR lightweight edge and recovery slice

[Slice]
CPUWeight=1000
IOWeight=1000
MemoryLow=192M
TasksMax=1024
UNIT

install -d -m 0755 /etc/systemd/system/caddy.service.d
cat >/etc/systemd/system/caddy.service.d/40-3dvr-edge.conf <<'UNIT'
[Service]
Slice=3dvr-edge.slice
CPUWeight=1000
IOWeight=1000
MemoryLow=96M
OOMScoreAdjust=-800
Restart=always
RestartSec=2
UNIT

for service in 3dvr-open-runner.service 3dvr-server-bridge.service; do
  install -d -m 0755 "/etc/systemd/system/${service}.d"
  cat >"/etc/systemd/system/${service}.d/40-3dvr-edge.conf" <<'UNIT'
[Service]
Slice=3dvr-edge.slice
CPUWeight=500
IOWeight=500
MemoryLow=32M
MemoryHigh=128M
MemoryMax=192M
OOMScoreAdjust=-500
Restart=always
RestartSec=3
UNIT
done

ssh_unit=""
for candidate in ssh.service sshd.service; do
  if systemctl list-unit-files "$candidate" --no-legend 2>/dev/null | grep -q .; then
    ssh_unit="$candidate"
    break
  fi
done
if [ -n "$ssh_unit" ]; then
  install -d -m 0755 "/etc/systemd/system/${ssh_unit}.d"
  cat >"/etc/systemd/system/${ssh_unit}.d/40-3dvr-edge.conf" <<'UNIT'
[Service]
Slice=3dvr-edge.slice
CPUWeight=1000
IOWeight=1000
MemoryLow=32M
OOMScoreAdjust=-900
UNIT
fi

# Proprietary remote control is not part of the recovery contract on this node.
systemctl disable --now desktop-commander-remote.service 2>/dev/null || true

# These two sessions are worker-node responsibilities and duplicate Hetzner.
for session in 3dvr-worker 3dvr-supervisor; do
  tmux has-session -t "$session" 2>/dev/null && tmux kill-session -t "$session" || true
done

systemctl daemon-reload
systemctl restart caddy.service
for service in 3dvr-open-runner.service 3dvr-server-bridge.service; do
  systemctl is-active --quiet "$service" && systemctl restart "$service" || true
done

curl -fsS --max-time 5 http://127.0.0.1/__3dvr-edge-health >/tmp/3dvr-edge-health.json
grep -q '"ok":true' /tmp/3dvr-edge-health.json
curl -fsS --max-time 10 -H 'Host: portal.3dvr.tech' http://127.0.0.1/__3dvr-health >/tmp/3dvr-upstream-health.json
grep -q '"host":"self"' /tmp/3dvr-upstream-health.json

# Both tunnels must be independently observable before declaring the edge fully redundant.
curl -fsS --max-time 5 http://127.0.0.1:14320/__3dvr-health >/tmp/3dvr-ovh-health.json
grep -q '"host":"self"' /tmp/3dvr-ovh-health.json
curl -fsS --max-time 5 http://127.0.0.1:14322/__3dvr-health >/tmp/3dvr-hetzner-health.json
grep -q '"standby":true' /tmp/3dvr-hetzner-health.json
curl -fsS --max-time 5 http://127.0.0.1:4320/__3dvr-health >/tmp/3dvr-do-local-health.json
grep -q '"operatorApi":"native"' /tmp/3dvr-do-local-health.json
curl -fsS --max-time 5 http://127.0.0.1/__3dvr-primary-health >/tmp/3dvr-primary-public.json
grep -q '"operatorApi":"native"' /tmp/3dvr-primary-public.json
curl -fsS --max-time 5 http://127.0.0.1/__3dvr-standby-health >/tmp/3dvr-standby-public.json
grep -q '"standby":true' /tmp/3dvr-standby-public.json
curl -fsS --max-time 5 http://127.0.0.1/__3dvr-local-health >/tmp/3dvr-local-public.json
grep -q '"operatorApi":"native"' /tmp/3dvr-local-public.json
rm -f /tmp/3dvr-edge-health.json /tmp/3dvr-upstream-health.json /tmp/3dvr-ovh-health.json /tmp/3dvr-hetzner-health.json /tmp/3dvr-do-local-health.json /tmp/3dvr-primary-public.json /tmp/3dvr-standby-public.json /tmp/3dvr-local-public.json

echo "3dvr_do_edge_hardened=true"
free -h
systemctl show caddy.service -p Slice -p MemoryLow -p OOMScoreAdjust --no-pager
