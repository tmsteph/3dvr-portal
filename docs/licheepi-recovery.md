# LicheePi 4A Remote Recovery

Last verified: 2026-09-04

The LicheePi 4A (`lpi4a`, user `sipeed`) must remain remotely recoverable after reboot, Wi-Fi changes, and failure of a single cloud rendezvous host.

## Recovery paths

### Primary — OVH

- Rendezvous: `40.160.137.41`
- OVH alias: `lpi4a`
- Reverse SSH listener: loopback port `2223`
- Pi service: `lichee-tunnel.service`
- Verified boot-enabled.

### Independent fallback — Hetzner

- Rendezvous: `167.233.174.20`
- Hetzner alias: `lpi4a-hetzner`
- Reverse SSH listener: loopback port `2223`
- Pi service: `3dvr-lpi-hetzner.service`
- Verified active and boot-enabled.

The two tunnels terminate on different cloud providers. Loss of OVH should not remove the Hetzner path, and loss of Hetzner should not remove the OVH path.

## Pi-side safety layers

- SSH server is enabled and active.
- `lichee-tunnel.service` keeps the OVH reverse tunnel alive and restarts it after failure/reboot.
- `3dvr-lpi-hetzner.service` independently keeps the Hetzner reverse tunnel alive and restarts it after failure/reboot.
- `3dvr-lpi-network-heal.timer` checks outbound connectivity conservatively and attempts a network-service restart only after three consecutive failures to reach the OVH SSH endpoint.
- The recovery installers never replace or stop the known-good primary tunnel while adding or repairing a fallback.

## Cloud-side monitoring

The ChatGPT automation `LicheePi Access Watch` checks both cloud paths hourly. If one path fails while the other survives, safe repair should be attempted through the surviving path before asking for physical access.

Machine-readable receipts:

- `ops/licheepi-recovery-result.json`
- `ops/licheepi-hardening-result.json`
- `ops/licheepi-dual-rendezvous-result.json`

Install/recovery tooling:

- `scripts/ops/licheepi-hardening.sh`
- `scripts/ops/licheepi-dual-rendezvous.sh`
- `.github/workflows/licheepi-hardening.yml`
- `.github/workflows/licheepi-dual-rendezvous.yml`

## Recovery order

1. Try OVH `lpi4a`.
2. If OVH fails, try Hetzner `lpi4a-hetzner`.
3. From the surviving path, inspect/restart the failed tunnel service and network-heal timer.
4. Re-run the repository recovery workflow if cloud-side configuration needs reconstruction.
5. Physical console access is the final fallback only after both independent cloud paths and remote repair have failed.

## Verified state on 2026-09-04

- OVH primary reachable: yes
- Hetzner fallback reachable: yes
- `lichee-tunnel.service`: enabled
- `3dvr-lpi-hetzner.service`: active + enabled
- SSH: active
- network-heal timer: enabled
- Pi addresses at verification: `10.21.77.109`, `172.25.6.107`

Do not store private keys, passwords, or other secrets in this document or repository.
