# Hardware participation loop

Date: 2026-09-17
Status: active operating note

3DVR should not treat open hardware as a spectator activity. Every board we own is a chance to create useful upstream evidence, documentation, tests, fixes, and eventually reusable hardware.

## Operating loop

1. **Use real hardware** — run normal workloads on physical boards instead of relying only on spec sheets.
2. **Capture friction** — record boot, recovery, thermal, networking, graphics, firmware, kernel, tooling, and documentation problems when they actually happen.
3. **Reduce to evidence** — reproduce the smallest useful fact, command, log, photo, or hardware observation.
4. **Contribute upstream first** — prefer a focused issue or patch in the project that owns the problem before building a 3DVR-only workaround.
5. **Record the outcome** — keep links, status, maintainer feedback, and lessons in 3DVR documentation and the contribution ledger.
6. **Generalize the lesson** — convert recurring board-specific pain into reusable tests, carrier-board requirements, recovery patterns, or design rules.
7. **Build downward only when earned** — move from docs and Linux fixes toward firmware, PCB carriers, FPGA work, and SoC design as practical experience accumulates.

## Current upstream example: Sipeed LicheePi 4A

A real LicheePi 4A recovery exposed a physical-access problem: `RESET` and `BOOT` are separate buttons, and an enclosure can expose RESET while covering BOOT.

The contribution trail is:

- `sipeed/sipeed_wiki#1032` — issue documenting the recovery gotcha.
- `sipeed/sipeed_wiki#1033` — active upstream PR adding the clarification directly to the existing flashing documentation.
- `sipeed/sipeed_wiki#1034` — closed duplicate of #1033; it proposed a separate recovery page, but the smaller in-place patch is the cleaner contribution.

This is the pattern to repeat: physical experience -> precise observation -> small upstream patch -> internal reusable lesson.

## Hardware-lab matrix

For every physical compute platform, track at minimum:

| Area | What to capture |
| --- | --- |
| Identity | board, SoC, module, revision, RAM, storage |
| Boot | firmware path, boot media, recovery path, serial access |
| Linux | distro, kernel, mainline status, device-tree status |
| Networking | Ethernet, Wi-Fi, Bluetooth, stability |
| Graphics | display outputs, acceleration, browser/video behavior |
| AI/accelerators | NPU/GPU availability, drivers, usable runtimes |
| Thermals | idle/load temperature, cooling behavior, throttling |
| Power | supply requirements, idle/load draw when measurable |
| Storage | eMMC, SD, NVMe/USB storage behavior |
| Reliability | reboot, watchdog, unattended operation, recovery |
| Upstream | issues, patches, PRs, maintainer feedback |

## Current platform roles

- **LicheePi 4A / LM4A** — TH1520 RISC-V reference, native RISC-V worker, Sipeed contribution path, first supply-chain trace.
- **VisionFive / StarFive** — second RISC-V silicon and software ecosystem for portability testing and JH7110 experience.
- **BeagleBoard / BeagleV** — open-hardware governance, documentation, reproducibility, and community contribution reference.
- **LattePanda Mu** — open carrier-board engineering reference for the module-neutral laptop/device contract.
- **Balthazar continuation** — chassis, keyboard, power, repairability, and system-level integration proving ground.

## Contribution selection rule

Prefer contributions that are:

- discovered through actual use;
- small enough for a maintainer to review quickly;
- useful to another person besides 3DVR;
- backed by direct evidence;
- close to the owning upstream project;
- likely to teach us something reusable about Linux, RISC-V, firmware, PCB design, modular computing, or manufacturing.

Avoid activity whose main purpose is to create a contribution count. A documentation patch that prevents real recovery failure is more valuable than a larger speculative feature nobody needs.

## From board lab to open computer

The long path is:

physical board -> reproducible test matrix -> upstream fixes -> module interface knowledge -> open carrier boards -> modular laptop/device -> FPGA/open accelerators -> increasingly open compute module and SoC.

The near-term objective is not a custom CPU. It is to become competent across the boundaries that make a computer usable: firmware, Linux, power, thermals, I/O, carriers, mechanical integration, documentation, repair, and community maintenance.

## Related work

- `compute/hardware/ecosystem-models.md`
- `compute/hardware/compute-module-v0.md`
- `compute/hardware/prototype-01-lm4a.md`
- `supply-chain/balthazar.md`
- `ops/control-plane/roles/open-source-manager.md`
