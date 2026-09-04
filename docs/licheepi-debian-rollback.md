# LicheePi 4A Debian transition: fail-safe rollback

## Current verified state

The LicheePi root filesystem is already Debian forky/sid on `/dev/mmcblk0p3`. The known-good boot remains the vendor/RevyOS 5.10.113 kernel from `/boot`, while Debian mainline 7.1 is staged as a separate `mainline71` extlinux entry.

The current known-good recovery baseline is:

- extlinux default: `l0`
- known-good vendor kernel entry: `l0`
- rescue vendor entry: `l0r`
- experimental Debian/mainline entry: `mainline71`
- root filesystem: `/dev/mmcblk0p3`
- OVH reverse SSH recovery: `lpi4a`, port 2223
- Hetzner reverse SSH recovery: `lpi4a-hetzner`, port 2223
- SSH server boot-enabled
- network self-heal timer boot-enabled

## Non-negotiable safety rule

Do **not** overwrite or remove the known-good vendor boot path while Debian/mainline is still experimental.

Until the mainline path has survived repeated boot, network, SSH, graphics, and workload validation, keep:

- `default l0`
- `/boot/Image`
- `/boot/vmlinux-5.10.113-lpi4a`
- the vendor DTBs used by `l0`
- `label l0`
- `label l0r`

The `mainline71` entry must remain additive, not destructive.

## Safest test method

Prefer a non-persistent `kexec` test of the mainline kernel before changing the normal boot default. Both the vendor and mainline kernel configurations advertise `CONFIG_KEXEC=y`.

Why: if a kexec test fails and the machine is reset, ordinary U-Boot startup still chooses `l0`, the known-good vendor boot.

Before any kexec test:

1. Verify both cloud reverse-SSH recovery paths.
2. Verify `ssh`, `lichee-tunnel.service`, `3dvr-lpi-hetzner.service`, and `3dvr-lpi-network-heal.timer` are healthy.
3. Verify `default l0` and the vendor kernel/rescue files still exist.
4. Arm a hardware watchdog if reliable watchdog reset has been validated on this board.
5. Only then load the test kernel.

## Persistent switch gate

Do not make `mainline71` the normal boot until all of these pass:

- mainline kernel reaches multi-user target repeatedly
- Wi-Fi/network works after cold boot
- both cloud reverse SSH paths reconnect automatically
- SSH accepts the existing recovery keys
- storage mounts cleanly
- GPU/display reaches the required usable state
- a hardware watchdog or validated U-Boot bootcount fallback exists
- the old `l0` and `l0r` entries remain intact

## Automatic rollback target

The desired persistent design is U-Boot bootcount/bootlimit:

- try Debian/mainline
- Debian marks the boot successful only after network + SSH + core services are healthy
- if the success mark never arrives after a small number of attempts, U-Boot selects the vendor `l0` path automatically

The installed U-Boot binary contains `bootcount` and `bootlimit` support, but Linux-side U-Boot environment access is not yet configured. Do not write guessed environment offsets. Finish locating and validating the real environment storage before enabling automatic U-Boot rollback.

## Disaster boundary

A Debian/mainline experiment must never require physically attaching a display, keyboard, or mouse merely because the new kernel failed. The vendor boot path and at least one cloud recovery path must remain independently recoverable throughout the transition.
