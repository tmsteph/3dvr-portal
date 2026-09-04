# LicheePi Debian migration rollback

Last reviewed: 2026-09-04

## Goal

Move the LicheePi 4A toward upstream Debian/mainline without ever making a new kernel or userland the only remotely bootable system before it has proved healthy.

## Current known-good state

- Root filesystem: `/dev/mmcblk0p3`, ext4.
- Boot filesystem: `/dev/mmcblk0p2`, ext4.
- Current userland reports Debian forky/sid.
- Known-good boot entry: `l0`, Sipeed/RevyOS `5.10.113-lpi4a`.
- Mainline candidate: `mainline71`, Debian `7.1.12+deb14-riscv64`.
- `/boot/extlinux/extlinux.conf` currently defaults to `l0`.
- OVH reverse SSH recovery: `lpi4a` / port 2223.
- Hetzner reverse SSH recovery: `lpi4a-hetzner` / port 2223.
- SSH and both tunnel services are enabled at boot.
- Network self-heal timer is enabled.

## Non-negotiable migration rules

1. Keep `l0` and its vendor kernel/device trees until the mainline system has passed repeated reboot, network, SSH, storage, display, USB, and package-management checks.
2. Do not replace `/boot/Image` in place without first preserving a versioned rescue copy or equivalent known-good boot entry.
3. Do not remove the old kernel package/modules or run destructive autoremove until the new boot has been promoted.
4. Do not make `mainline71` the permanent default until automatic rollback is armed and tested.
5. A candidate boot is not "good" merely because the kernel starts. It must restore remote SSH through at least one cloud path and then both paths.
6. Any migration script must fail closed if the known-good recovery entry, boot files, or both cloud recovery anchors are unavailable before staging.
7. Do not repeat the prior kexec experiment as the normal test method. The previous mainline kexec attempt hung before SSH returned; use kexec only as a targeted diagnostic after watchdog reset is proven.

## Verified U-Boot environment layout

The live bootloader reports `U-Boot 2020.01-gd6c9182f-dirty`. The exact matching RevyOS source commit is `d6c9182f6238f2fc4b386b9e4c5d2cfebbef4746`.

That source defines:

- `CONFIG_ENV_IS_IN_MMC=y`
- `CONFIG_SYS_MMC_ENV_DEV=0`
- `CONFIG_ENV_OFFSET=0xe0000`
- `CONFIG_ENV_SIZE=0x20000`

The matching board header also defines `CONFIG_SYS_MMC_ENV_DEV 0`.

Treat this layout as invalid immediately if the live U-Boot build identity changes. Never carry the offsets forward to another bootloader build without re-verification.

## Automatic rollback design

The installed U-Boot contains boot-count support (`bootcount` / `bootlimit`). The intended final guard is:

- preserve `l0` as the canonical known-good boot;
- stage the candidate separately;
- set `bootcount=0` when a candidate is armed;
- set `bootlimit` to a small number (normally 2);
- candidate boot attempts the new Debian/mainline path;
- `altbootcmd` restores/boots the known-good `l0` path after the boot limit is exceeded;
- a late userspace health service marks the candidate good only after network, OpenSSH, OVH recovery, Hetzner recovery, and core services are healthy.

## Required sequence before the first persistent mainline trial

1. Run the exact-source read-only environment CRC validator.
2. Confirm stored CRC matches the exact `0x20000` environment region at MMC0 offset `0xe0000`.
3. Capture a raw environment backup and checksum it on at least two independent cloud hosts.
4. Configure `fw_printenv` and prove its output matches the raw parser without writing anything.
5. Test a harmless reversible environment write/read/restore cycle only after the backup exists.
6. Install the rollback variables while leaving `default l0` unchanged.
7. Deliberately force the rollback logic through a safe drill and verify the board returns to `l0` plus both cloud tunnels.
8. Only then allow a one-shot `mainline71` boot trial.

## Extra fallback layers

- Hardware watchdog devices exist on the board and both current and candidate kernels have watchdog support. Validate the real watchdog driver/reset behavior before using it to guard a risky test.
- Keep the dual-cloud SSH recovery paths independent; loss of one cloud host must not imply loss of board access.
- Keep a known-good boot recovery bundle off the Pi itself.

## Promotion gate

A candidate can become the default only after all are true:

- deliberate failed-boot test proves automatic fallback to `l0`;
- clean mainline kernel boot;
- root filesystem mounts read/write;
- network comes up without manual action;
- OpenSSH is active;
- OVH reverse tunnel is healthy;
- Hetzner reverse tunnel is healthy;
- package manager works;
- expected storage and device tree are present;
- GPU/display is usable for the intended workload;
- a normal reboot after the fallback test again restores both recovery paths.

Until that deliberate rollback drill passes, `l0` remains the canonical rescue default.
