# 3DVR open hardware lab matrix

Date: 2026-09-17
Status: living test matrix

This file is the common evidence surface for physical compute platforms used by 3DVR. It should distinguish observed facts from vendor documentation and from work that has not yet been tested.

Legend:

- **Observed** — directly seen on hardware we control.
- **Documented** — supported by upstream/vendor documentation but not yet independently verified here.
- **Unknown** — needs a deliberate test.

## LicheePi 4A / LM4A

Role: primary TH1520 RISC-V lab, low-power native RISC-V worker, first supply-chain trace, active Sipeed upstream contribution path.

| Area | Current state | Evidence / next test |
| --- | --- | --- |
| Identity | Observed | LicheePi 4A with removable LM4A / TH1520 platform. Record exact RAM/eMMC and board/SOM revision from the physical labels next hands-on session. |
| Boot | Observed | Board recovered through the BOOT/RESET USB recovery path. Physical enclosure can hide BOOT. |
| Recovery | Observed + upstreamed | `sipeed/sipeed_wiki#1032`; active patch `#1033`. |
| Linux | Observed | Running Linux as a rack node. Record exact current distro/kernel automatically on next health check. |
| Mainline | Documented / incomplete | Treat mainline support as a moving target; test current upstream kernel rather than assuming vendor-kernel behavior. |
| Ethernet | Observed | Ethernet used after rack restoration. Add repeatable link/reboot test and throughput baseline. |
| Wi-Fi | Historical friction | Previously slow/unstable in our use. Retest only if Wi-Fi becomes operationally important; prefer Ethernet for rack role. |
| Bluetooth | Unknown | No current 3DVR baseline. |
| Graphics | Unknown | Not required for current rack-worker role; test when evaluating desktop/laptop use. |
| NPU / local AI | Experimental | TH1520 exposes an NPU path, but usable 3DVR runtime/performance still needs a reproducible benchmark. |
| Thermals | Active concern | Keep temperature and throttling visible. Fan behavior should be checked under load rather than inferred from whether it spins at idle. |
| Power | Unknown | Record idle/load draw when measurement equipment is available. |
| Storage | Observed | System boots from onboard storage in current rack role. Record exact eMMC capacity and health metrics. |
| Reliability | In progress | Goal is unattended operation without getting stuck. Add reboot, watchdog, service-health, and recovery checks. |
| Upstream | Active | Sipeed issue #1032; PR #1033 open. PR #1034 closed duplicate. |

## StarFive VisionFive

Role: second RISC-V ecosystem and portability counterweight to the TH1520 path.

| Area | Current state | Evidence / next test |
| --- | --- | --- |
| Identity | Observed at inventory level | A VisionFive board is part of the 3DVR hardware inventory. Record exact model/revision, RAM, storage, and SoC before drawing model-specific conclusions. |
| Boot | Unknown | Establish known-good boot media and recovery path. |
| Linux | Unknown | Record current distro/kernel after next power-up. |
| Mainline | Test target | Measure how much functionality works on current upstream Linux without vendor-specific assumptions. |
| Ethernet | Unknown | Baseline link, DHCP/static networking, throughput, and reboot persistence. |
| Wi-Fi / Bluetooth | Unknown | Depends on exact board/model and attached hardware; inventory first. |
| Graphics | Unknown | Test display and acceleration only after exact model is confirmed. |
| Accelerators | Unknown | Inventory SoC first, then determine GPU/NPU/runtime path. |
| Thermals | Unknown | Establish idle/load temperature and cooling needs. |
| Power | Unknown | Establish supply requirements and draw. |
| Storage | Unknown | Inventory SD/eMMC/NVMe/USB options actually present. |
| Reliability | Unknown | Add unattended reboot and workload soak tests. |
| Upstream | Planned | Find one real documentation, Linux, or board-support contribution after the baseline is reproducible. |

## BeagleBoard / BeagleV reference lane

Role: open-hardware process and community reference; candidate physical platform when useful rather than a required purchase.

Current work is primarily comparative: study reproducible design releases, contribution practices, Linux integration, and documentation structure. Do not create a hardware row with observed results until a specific board is actually in the lab.

## LattePanda Mu reference lane

Role: carrier-board and modular x86 engineering reference for the 3DVR/Balthazar compute-module contract.

Current work is design-study first. Extract carrier boundaries and requirements from the open KiCad examples: power, high-speed I/O, display, storage expansion, networking, thermals, mounting, firmware assumptions, and battery/portable-system gaps. A physical Mu is optional unless chassis validation requires it.

## Common test sequence

When a board is brought into active use, run the same sequence where applicable:

1. Inventory exact hardware identity and photograph/read revision labels.
2. Record known-good power supply, boot media, firmware, distro, and kernel.
3. Prove normal boot and a documented recovery path.
4. Establish Ethernet first; add wireless only after the wired baseline is stable.
5. Capture temperatures at idle and under a repeatable CPU workload; note throttling and fan behavior.
6. Test storage health and one sustained read/write workload.
7. Run one representative 3DVR workload: agent utility, web service, build/test job, or local inference experiment.
8. Reboot repeatedly and run an unattended soak period.
9. Compare failures with upstream docs/issues before creating local workarounds.
10. Publish the smallest useful upstream issue or patch when a reproducible gap is found.

## Design feedback

Every repeated failure should become either:

- an upstream fix;
- a compatibility test;
- a 3DVR carrier-contract requirement;
- a Balthazar mechanical/power/recovery requirement;
- or an explicit reason not to use that platform for a particular role.

Related: `docs/hardware-participation-loop.md`, `compute/hardware/ecosystem-models.md`, and `supply-chain/balthazar.md`.
