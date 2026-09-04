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

The read-only live probe confirms the stored environment CRC exactly matches the calculated CRC for that region.

Treat this layout as invalid immediately if the live U-Boot build identity changes. Never carry the offsets forward to another bootloader build without re-verification.

## Bootcount is not enabled

Do not rely on the generic `bootcount` strings found in the U-Boot binary. The exact installed `light_lpi4a_defconfig` does not enable `CONFIG_BOOTCOUNT_LIMIT`, and the live environment has no `bootcount`, `bootlimit`, or `altbootcmd` variables.

Therefore the current installed bootloader does **not yet have a proven automatic boot-count rollback path**.

Preferred development order:

1. preserve the raw environment independently on OVH and Hetzner;
2. verify Linux-side read access with `fw_printenv`;
3. prove one bounded environment write/read/restore cycle;
4. design a one-shot boot command that restores the normal vendor boot state before launching `mainline71`;
5. validate the board's real hardware watchdog reset path as another safety layer;
6. avoid rebuilding/flashing U-Boot unless the safer one-shot design cannot meet the recovery requirement.

## Required sequence before the first persistent mainline trial

1. Exact-source read-only environment CRC validator passes.
2. Raw environment backup exists on at least two independent cloud hosts with matching SHA-256.
3. `fw_printenv` output is proven to match the raw parser without writing anything.
4. A harmless reversible environment write/read/restore cycle passes and the CRC remains valid.
5. A one-shot rollback design is implemented that leaves `default l0` as the normal durable state.
6. Deliberately force the rollback logic through a safe drill and verify the board returns to `l0` plus both cloud tunnels.
7. Only then allow a one-shot `mainline71` boot trial.

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
