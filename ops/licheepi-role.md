# LicheePi 4A role

The LicheePi 4A (`lpi4a`) is a permanent 3DVR infrastructure node with a deliberately narrow role.

## Primary role

**Native RISC-V lab / canary / low-power worker.**

Use it to:

- run and validate real `riscv64` builds/tests on physical hardware;
- reproduce Debian/RevyOS/Sipeed/TH1520 issues that do not reproduce reliably under emulation;
- test kernel, firmware, device-tree, networking, browser/graphics, audio, and userspace improvements in a guarded way;
- host lightweight non-critical services when useful;
- turn reproducible findings into upstream bug reports, docs, tests, patches, or packaging improvements.

## Safety rules

- The recovered vendor `5.10.113+` boot path remains the known-good default until a newer lane has passed a deliberate guarded test.
- The staged 6.6 TH1520 lane is additive only; do not promote it automatically.
- Never rewrite GPT, enter vendor USB recovery, flash root, or replace known-good early firmware as part of routine work.
- Prefer the 3DVR Open Runner / SSH mesh for control. Direct SSH is recovery. Remote Desktop Commander is an emergency bridge, not the normal control plane.
- Keep the Pi useful while improving it; upstream experiments must not turn the node into a disposable test target.

## Upstream rule

When work on this node reveals a real generalizable bug or improvement, first identify the correct upstream home (Debian, RevyOS, Sipeed, Linux/RISC-V, Mesa/browser/audio project, etc.), reproduce it cleanly, then contribute the smallest well-tested fix or documentation improvement that benefits other users.

The Open Source Hourly Loop owns this upstream work and should reuse this physical board as the native validation target whenever that meaningfully improves confidence.