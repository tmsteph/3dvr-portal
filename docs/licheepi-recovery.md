# LicheePi 4A Remote Recovery

Last verified: 2026-09-17

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

### Independent fallback — DigitalOcean

- Rendezvous: `167.172.193.194`
- DigitalOcean alias: `lpi4a-digitalocean` (from the DigitalOcean host)
- Reverse SSH listener: loopback port `2223`
- Pi service: `3dvr-lpi-digitalocean.service`
- Verified active and boot-enabled on 2026-09-17.

The three Pi tunnels terminate on separate cloud rendezvous paths. The unrelated OVH rescue tunnels now use remote port `22923` on Hetzner and DigitalOcean so they no longer collide with the Pi's reserved `2223` listeners.

## Pi-side safety layers

- SSH server is enabled and active.
- `lichee-tunnel.service` keeps the OVH reverse tunnel alive and restarts it after failure/reboot.
- `3dvr-lpi-hetzner.service` independently keeps the Hetzner reverse tunnel alive and restarts it after failure/reboot.
- `3dvr-lpi-digitalocean.service` independently keeps the DigitalOcean reverse tunnel alive and restarts it after failure/reboot.
- `3dvr-lpi-network-heal.timer` checks outbound connectivity conservatively and attempts a network-service restart only after three consecutive failures to reach the OVH SSH endpoint.
- The recovery installers never replace or stop the known-good primary tunnel while adding or repairing a fallback.

## Cloud-side monitoring

The ChatGPT automation `LicheePi Access Watch` checks the recovery paths hourly. If one path fails while the other survives, safe repair should be attempted through the surviving path before asking for physical access.

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
3. If both fail, try DigitalOcean `lpi4a-digitalocean` from the DigitalOcean host.
4. From a surviving path, inspect/restart the failed tunnel service and network-heal timer.
5. Re-run the repository recovery workflow if cloud-side configuration needs reconstruction.
6. Physical console access is the final fallback only after all remote paths and remote repair have failed.

## Verified state on 2026-09-04

- OVH primary reachable: yes
- Hetzner fallback reachable: yes
- `lichee-tunnel.service`: enabled
- `3dvr-lpi-hetzner.service`: active + enabled
- SSH: active
- network-heal timer: enabled
- Pi addresses at verification: `10.21.77.109`, `172.25.6.107`

Do not store private keys, passwords, or other secrets in this document or repository.
## Physical recovery incident — 2026-09-17

A failed early-boot firmware experiment required BOOT-button USB recovery. The board was recovered without replacing the root filesystem.

- ROM recovery enumerated as `2345:7654 T-HEAD USB download gadget`.
- Rebuilt the known-good vendor U-Boot/SPL from commit `d6c9182f6238f2fc4b386b9e4c5d2cfebbef4746` and verified RAM boot before persistent repair.
- Restored the verified 2026-09-12 500 MiB `/boot` image; known-good firmware hashes were confirmed after boot.
- Important vendor behavior: `light_usb_boot_check()` resets the environment and runs `gpt_partition` automatically. The stock LPi4A defaults use a 6000 MiB root entry, which truncated the GPT view of the existing ~116 GiB root filesystem. Filesystem data remained intact.
- Repaired GPT metadata to `table=2031KB; boot=500MiB; root=rest-of-disk`, preserving root PARTUUID `80a5a8e9-c744-491a-93c1-4f4194fd690a`.
- Final root filesystem UUID `55bb2748-0da0-4a58-a147-f53bc6835769` is clean; `/` is ~115 GiB and `/boot` mounts normally.
- OVH reverse SSH recovered and the board boots the vendor `5.10.113+` kernel with graphical HDMI output.
- Upstream report: https://github.com/revyos/th1520-vendor-uboot/issues/54

Recovery rule: do not assume USB recovery is read-only. Before RAM-booting vendor U-Boot on an installed system, inspect its compiled `partitions` environment and `light_usb_boot_check()` behavior.
## Rack/server baseline — 2026-09-17

After physical recovery, the LPi4A was returned to the rack and rebooted with Ethernet connected.

- Ethernet `end0`: `10.21.77.169/24`, preferred default route (metric 100).
- Wi-Fi `wlan0`: `172.25.6.107/22`, retained as backup route (metric 600).
- OVH, Hetzner, and DigitalOcean reverse-SSH paths were all verified end-to-end.
- Fresh rollback bundle copied to OVH at `/home/debian/.3dvr/backups/licheepi/20260917T045807Z` and hash-verified. It contains both GPT ends, the raw U-Boot environment, complete `/boot` tree, and system baseline.
- `fw_printenv` without an explicit config currently fails; use `/dev/mmcblk0 0xe0000 0x20000` as the environment config when reading or writing the environment.
- RevyOS `linux-image-6.6-th1520` (`6.6.140-2026.05.18.10.38+81b3bd3ad`) is installed side-by-side. The normal 5.10 extlinux config remains byte-for-byte unchanged and is still the durable boot default.
- Matching RevyOS 6.6 OpenSBI/AON/audio firmware is staged under `/boot/3dvr/revyos66/` using alternate filenames; it does not replace the known-good boot firmware.
- `/boot/extlinux/revyos66-once.conf` is an isolated 6.6 trial config. Do not make it persistent until a guarded one-shot boot has been observed and rollback verified.

Server policy: keep the recovered 5.10 path as the known-good default until the 6.6 lane passes a guarded boot test. Do not install experimental 6.18/7.x TH1520 kernels as the default server kernel.

