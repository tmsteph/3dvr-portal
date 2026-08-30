# Balthazar preservation and continuation

3DVR Open Supply Chain is preserving the Balthazar Personal Computing Device as a practical starting point for an open, modular, repairable, upgradeable, and sustainable laptop.

Balthazar's public engineering work is largely dormant: its core hardware repositories show their last substantive commits in 2024. Rather than wait for upstream development, 3DVR will preserve the published work, keep attribution and license history intact, and continue the ideas experimentally.

Reference project: https://balthazar.space/
Original hardware organization: https://github.com/balthazar-space
3DVR preservation forks: https://github.com/tmsteph?tab=repositories&q=Balthazar

## Preserve first

The Balthazar project is spread across multiple repositories rather than one monorepo. 3DVR has forked the original project repositories for preservation, including the concept, case, keyboard, firmware, PSU, I/O, and unifying-PCB work. Third-party upstream forks are not duplicated as if they were Balthazar originals.

The original project authors and contributors remain the authors. Existing CERN Open Hardware and GPL licensing must remain attached to the work. Repositories without clear license metadata should be treated conservatively until their file-level licensing is verified.

## Keep the idea, loosen the compute module

One of Balthazar's strongest design decisions is that the computer itself is a replaceable System on a Module. Our continuation should make the chassis as compute-module-neutral as practical.

Candidate compute platforms:

- **Lichee Pi 4A / LM4A** — TH1520 RISC-V; our first physical reference and supply-chain trace.
- **BeagleV-Ahead** — TH1520 RISC-V in the BeagleBoard open-hardware ecosystem; a strong alternate reference platform.
- **StarFive VisionFive 2 / PINE64 Star64** — JH7110 RISC-V ecosystem; useful as a second architecture and supplier path.
- **LattePanda Mu** — x86 compute module with open carrier-board design files; useful for validating the laptop chassis, power, display, and I/O even though x86 is not the open-ISA end state.
- **FPGA / future open accelerators** — preserve Balthazar's original idea that programmable and emerging open compute modules can coexist with conventional SoMs.

The laptop should not be married to one board. Define a small adapter/carrier contract around power, display, USB/I/O, storage, networking, thermal limits, mounting, and optional PCIe/MIPI so new compute modules can be added without redesigning the whole computer.

## First concrete stepping stone: Lichee Pi 4A / LM4A

The first hardware we can physically inspect is the Sipeed Lichee Pi 4A and its removable Lichee Module 4A compute module.

Known high-level parts to trace:

- T-Head TH1520 SoC with four RISC-V C910 application cores, C906 audio core, GPU, and 4 TOPS INT8 NPU
- LPDDR4/LPDDR4X memory and eMMC storage
- SODIMM-style LM4A compute-module connector
- power-management ICs
- Ethernet PHYs and Wi-Fi / Bluetooth radio
- audio DAC / ADC and amplifier
- HDMI, USB, Ethernet, MIPI, microSD, and audio connectors
- PCB substrate, copper, solder, passive components, shielding, fasteners, and enclosure materials

Official Sipeed documentation publishes schematics, a BOM, dimensional drawings, and a 3D model for the Lichee Pi 4A. Those documents are our first source set.

## Open Supply Chain questions

For each part, record what it does, who makes it, where it is fabricated or assembled when known, what materials are inside it, whether it can be salvaged or repaired, what substitutes exist, and what it would take for a community or cooperative to make the next layer down.

## Milestones

### 0 — Preserve

Keep the upstream Balthazar repositories and their history available. Verify licenses and document which files are safe to modify and redistribute.

### 1 — Document

Build a verified bill of materials for the Lichee Pi 4A / LM4A from public documentation and the physical board.

### 2 — Prototype the shell

Reuse Balthazar's modular ideas for a working laptop around whichever supported compute module is easiest to integrate first. Prove display, keyboard, trackpoint/touchpad, battery, charging, storage, audio, Wi-Fi, and hardware privacy controls.

### 3 — Define the 3DVR compute-module adapter

Create an open electrical and mechanical contract so LM4A, BeagleV, StarFive/PINE64, LattePanda, and future modules can use the same laptop platform through adapters where necessary.

### 4 — Replace closed layers

Identify proprietary firmware, undocumented chips, closed GPU/NPU paths, difficult-to-source components, and other dependencies. Replace them one layer at a time where practical.

### 5 — Community manufacturing

Develop or adopt open designs for the case, keyboard, power system, I/O boards, display mounting, wiring, and eventually compute hardware that regional workshops can build or assemble.

### 6 — Open source all the way down

Trace materials into recycling, refining, and—only where genuinely necessary—responsible, regulated, transparent extraction with worker and community ownership.

## Principle

We do not need to manufacture everything ourselves on day one. Preserve what already exists, make every dependency visible, and replace closed layers one at a time.