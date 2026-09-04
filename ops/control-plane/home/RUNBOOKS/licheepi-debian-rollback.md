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

## Automatic rollback design

The installed U-Boot contains boot-count support (`bootcount` / `bootlimit`). The intended final guard is:

- `bootcount=0` when a candidate is staged.
- `bootlimit` set to a small number (normally 2).
- normal candidate boot command attempts the new Debian/mainline entry.
- `altbootcmd` restores/boots the known-good `l0` vendor entry after the boot limit is exceeded.
- a late userspace health service clears `bootcount` / marks the candidate good only after network, SSH, and recovery tunnels are healthy.

The U-Boot environment must not be written until its exact eMMC offset, size, and CRC layout are verified from the live board. Never guess `fw_env.config`.

## Extra fallback layers

- Hardware watchdog devices exist on the board and both current and candidate kernels have watchdog support. Use this as a second reset path once verified with the real driver.
- Both kernels have `CONFIG_KEXEC=y`. A one-shot kexec test may be used to exercise a candidate kernel while keeping extlinux defaulted to `l0`, after `kexec-tools` and watchdog behavior are validated.
- Keep the dual-cloud SSH recovery paths independent; loss of one cloud host must not imply loss of board access.

## Promotion gate

A candidate can become the default only after all are true:

- clean kernel boot;
- root filesystem mounts read/write;
- network comes up without manual action;
- OpenSSH is active;
- OVH reverse tunnel is healthy;
- Hetzner reverse tunnel is healthy;
- package manager works;
- expected storage and device tree are present;
- a deliberate failed-boot test proves automatic fallback to `l0`;
- a normal reboot after the fallback test again restores both recovery paths.

Until that deliberate rollback drill passes, `l0` remains the canonical rescue default.
