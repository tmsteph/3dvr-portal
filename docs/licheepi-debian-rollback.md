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

## Prior kexec result

A mainline kexec attempt has already been tried. It hung before a new SSH connection became available, consistent with an early RISC-V handoff/bring-up failure. The normal U-Boot default was not changed and the machine recovered on the next ordinary boot.

Do **not** repeat kexec as the default test strategy. It remains a diagnostic option only if we later have a proven hardware watchdog/reset path and a specific reason to exercise it.

## Current safest development path

1. Keep `default l0` unchanged.
2. Validate U-Boot environment access read-only against the exact installed bootloader source.
3. Back up the raw environment and known-good boot files before any environment write.
4. Configure and verify Linux-side `fw_printenv` access.
5. Add U-Boot `bootlimit` + `altbootcmd` logic that automatically restores the vendor `l0` path when a candidate boot never becomes healthy.
6. Add a late userspace success service that marks the candidate good only after network, OpenSSH, and both recovery tunnels are healthy.
7. Deliberately test the rollback mechanism while the vendor kernel is still the normal default.
8. Only after rollback is proven, perform a one-shot `mainline71` boot trial.

## U-Boot environment source of truth

The live bootloader identifies as `U-Boot 2020.01-gd6c9182f-dirty`. The exact matching RevyOS source commit is `d6c9182f6238f2fc4b386b9e4c5d2cfebbef4746`.

That exact source defines:

- `CONFIG_ENV_IS_IN_MMC=y`
- `CONFIG_SYS_MMC_ENV_DEV=0`
- `CONFIG_ENV_OFFSET=0xe0000`
- `CONFIG_ENV_SIZE=0x20000`

The matching board header defines `CONFIG_SYS_MMC_ENV_DEV 0`.

These values are valid only while the live U-Boot build identity still matches `d6c9182f`. Any future bootloader change invalidates them until the new source/configuration is verified.

## Persistent switch gate

Do not make `mainline71` the normal boot until all of these pass:

- deliberate rollback drill returns automatically to `l0`
- mainline kernel reaches multi-user target repeatedly
- Wi-Fi/network works after cold boot
- both cloud reverse SSH paths reconnect automatically
- SSH accepts the existing recovery keys
- storage mounts cleanly
- GPU/display reaches the required usable state
- package management works
- the old `l0` and `l0r` entries remain intact

## Automatic rollback target

The intended persistent design is U-Boot bootcount/bootlimit:

- stage the candidate without deleting `l0`
- set a small `bootlimit`
- candidate boots increment the boot count
- Debian marks the boot successful only after network + SSH + both recovery tunnels + core services are healthy
- if the success mark never arrives, `altbootcmd` restores/boots the vendor `l0` path automatically

Environment writes remain forbidden until the exact-source read-only CRC validation succeeds and a raw backup has been captured.

## Disaster boundary

A Debian/mainline experiment must never require physically attaching a display, keyboard, or mouse merely because the new kernel failed. The vendor boot path and cloud recovery paths must remain independently recoverable throughout the transition.
