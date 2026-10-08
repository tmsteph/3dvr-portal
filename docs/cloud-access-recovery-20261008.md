# Cloud access recovery — 2026-10-08

Use Open Runner in the private `tmsteph/3dvr-terminal-bridge` queue before treating Desktop Commander availability as server health. A live shell probe reached all three servers through the Hetzner ingress and SSH mesh.

## Causes and repairs

- OVH had 14 orphaned `agent-browser-l` processes, older than one day with parent PID 1, inside Desktop Commander's memory-limited cgroup. They were blocked in `mem_cgroup_handle_over_high`. Sending SIGTERM to those controllers cleared the blocked-process backlog and reduced one-minute load from about 22 to 1.4. Persistent Chromium lanes and profiles were preserved.
- Hetzner standby and DigitalOcean local Portal used Node 20 and repeatedly failed importing `node:sqlite`. Persistent `99-3dvr-node-runtime.conf` service overrides select the existing `/opt/node-v22/bin/node`. Both endpoints returned healthy responses; the Hetzner-to-DO standby tunnel was restarted and verified.
- DigitalOcean newsletter API had an old blocked Node process at its memory ceiling. Its service was restarted and returned to roughly 84 MiB. A temporary runtime limit adjustment allowed the old process to exit; original limits were restored after recovery.

## Prevention and verification

Standby installers must select a Node executable that can import `node:sqlite` before installing or promoting a release. A version label alone is insufficient.

`scripts/ops/reap-orphan-browser-controllers.py` defaults to inspection. `--apply` sends SIGTERM only to controllers older than one day, parented by PID 1, in Desktop Commander's service cgroup. It never selects Chromium, live child controllers, tunnels, or persistent browser lanes. OVH runs this as a bounded systemd timer every 15 minutes.

Verify primary and fallback endpoints independently: OVH port 4320, Hetzner port 4322, and DO ports 4320, 14320, 14322. Check service restart counts twice, blocked processes, memory pressure, and the actual public root. Do not clear swap on a pressured host or rebuild browser identities as recovery.
