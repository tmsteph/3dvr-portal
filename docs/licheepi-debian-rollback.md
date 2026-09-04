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

Do **not** overwrite or remove the known-good vendor boot path while Debian/mainline is still experimental. Keep `default l0`, the 5.10 vendor kernel/DTBs, `l0`, and `l0r`. `mainline71` remains additive until rollback and repeated mainline boots are proven.

## Prior kexec result

A mainline kexec attempt already hung before a new SSH connection became available. The board recovered only because normal U-Boot boot state had not changed. Do not use kexec as the default test method.

## U-Boot environment source of truth

The live bootloader identifies as `U-Boot 2020.01-gd6c9182f-dirty`. Exact matching RevyOS source commit: `d6c9182f6238f2fc4b386b9e4c5d2cfebbef4746`.

Verified environment layout:

- `CONFIG_ENV_IS_IN_MMC=y`
- MMC device `0` → `/dev/mmcblk0`
- offset `0xe0000`
- size `0x20000`

The live read-only probe verifies the stored CRC against that exact region.

## Vendor rollback capability: present, but not wired into the live boot flow

The exact vendor source contains a custom U-Boot command named `rollback`. It is separate from upstream `CONFIG_BOOTCOUNT_LIMIT`.

When invoked with `bootlimit` configured, the vendor command:

- increments `bootcount`;
- persists it with `env_save()`;
- after the configured number of failed attempts, restores `boot_partition` from `boot_partition_alt` and `root_partition` from `root_partition_alt`;
- removes the `_alt` values after rollback.

However, the **live** environment currently has none of those rollback variables, and its actual boot command is:

`run bootcmd_load; bootslave; sysboot mmc ${mmcdev}:${mmcbootpart} any $boot_conf_addr_r $boot_conf_file;`

The live boot path therefore does not currently invoke the custom `rollback` command. We must not rely on it until we deliberately wire and test it.

## Current safest development path

1. Keep `default l0` unchanged.
2. Maintain exact-source read-only environment validation.
3. Store the exact U-Boot environment plus known-good vendor boot recovery set independently on OVH and Hetzner.
4. Run no-reboot mainline preflight for root storage, initramfs, DTB, Wi-Fi bridge, PowerVR/display, and watchdog capability.
5. Configure `fw_printenv` read-only and prove its interpretation matches our validated raw parser.
6. Only after two independent backups exist, prove a bounded environment write/read/restore cycle.
7. Decide whether the vendor custom `rollback` command can safely guard an extlinux candidate boot without replacing U-Boot.
8. Deliberately test rollback while `l0` remains the durable normal state.
9. Only then perform a one-shot `mainline71` boot.

## Mainline-specific warning

The staged 7.1 kernel has soft-watchdog support but does not currently enable `CONFIG_DW_WATCHDOG`. Therefore the first mainline boot must **not** depend on the current DesignWare hardware watchdog for recovery unless another compatible hardware watchdog path is separately proven.

## Persistent switch gate

Do not make `mainline71` the normal boot until all of these pass:

- deliberate failed-boot drill returns automatically to `l0`;
- clean mainline boot reaches multi-user target repeatedly;
- eMMC root mounts correctly;
- Wi-Fi/network returns without manual action;
- both cloud reverse SSH paths reconnect;
- storage and package management work;
- GPU/display reaches the intended usable state;
- `l0` and `l0r` remain intact.

## Disaster boundary

A Debian/mainline experiment must never require local display/keyboard access merely because the candidate kernel failed. The vendor boot path and independent cloud recovery paths stay recoverable throughout the transition.
