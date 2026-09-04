# LicheePi Debian migration rollback

Last reviewed: 2026-09-04

## Goal

Move the LicheePi 4A toward upstream Debian/mainline without ever making a new kernel the only remotely bootable system before it has proved healthy.

## Current known-good state

- Root: `/dev/mmcblk0p3`, ext4, Debian forky/sid.
- Boot: `/dev/mmcblk0p2`, ext4.
- Known-good: `l0`, vendor/RevyOS `5.10.113-lpi4a`.
- Rescue: `l0r`.
- Candidate: `mainline71`, Debian `7.1.12+deb14-riscv64`.
- extlinux default remains `l0`.
- OVH recovery: `lpi4a` / 2223.
- Hetzner recovery: `lpi4a-hetzner` / 2223.
- SSH, both reverse tunnels, and network self-heal are boot-enabled.

## Hard rules

1. Never remove/overwrite `l0`, `l0r`, or their vendor kernel/DTBs while mainline is experimental.
2. Never make `mainline71` durable default until a deliberate failed-boot rollback drill succeeds.
3. Do not use kexec as the normal test path; a previous mainline kexec hung before SSH returned.
4. Do not depend on physical console access for an ordinary candidate-kernel failure.
5. Do not mutate the U-Boot environment until exact-source validation and two independent cloud backups are green.

## Verified U-Boot environment

Live build: `U-Boot 2020.01-gd6c9182f-dirty`.
Exact matching RevyOS source: `d6c9182f6238f2fc4b386b9e4c5d2cfebbef4746`.

Verified layout:

- `/dev/mmcblk0`
- offset `0xe0000`
- size `0x20000`
- CRC matches the live stored environment.

Any bootloader build change invalidates these constants until re-verified.

## Vendor rollback nuance

Upstream-style `CONFIG_BOOTCOUNT_LIMIT` is not enabled. Do not use the generic bootcount framework assumption.

The exact vendor source **does** implement a custom U-Boot `rollback` command. When explicitly invoked with `bootlimit` configured it persists `bootcount` with `env_save()` and can restore `boot_partition`/`root_partition` from their `_alt` values after failed attempts.

But the live environment currently has no `bootcount`, `bootlimit`, `boot_partition(_alt)`, or `root_partition(_alt)` values, and the live boot flow is:

`run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;`

So the custom vendor rollback command is present but **not currently wired into this board's live extlinux boot path**. Treat it as a candidate mechanism, not an active safeguard.

## Mainline preflight status

The no-reboot 7.1 preflight currently verifies:

- candidate kernel, initramfs, and test DTB exist;
- candidate root UUID matches `/dev/mmcblk0p3`;
- ext4/MMC root drivers are present in the initramfs;
- AIC8800 bridge modules and firmware exist;
- upstream PowerVR module exists;
- TH1520 HDMI and Verisilicon display modules exist;
- GPU/HDMI/display DTB evidence exists;
- `l0` remains default and both vendor recovery entries remain intact.

Known cautions:

- candidate has `CONFIG_DW_WATCHDOG=n`; do not depend on the current DW hardware watchdog for first-boot recovery;
- candidate uses 96 MiB default CMA and has no explicit `cma=` override; validate graphics/display before promotion.

## Required sequence before a mainline reboot

1. Exact-source environment CRC validation: green.
2. Independent OVH + Hetzner recovery backups with matching hashes: green.
3. `fw_printenv` configured read-only and matched against the raw parser.
4. Bounded environment write/read/restore test with backup already in place.
5. Implement a one-shot candidate boot whose durable fallback remains `l0`.
6. Deliberately test the fallback without booting mainline if possible.
7. Only then perform one `mainline71` reboot trial.
8. Promote only after repeated successful boots plus network, both tunnels, storage, package manager, GPU/display, and workload checks.

Until those gates are satisfied, `l0` is the canonical boot and rescue path.
