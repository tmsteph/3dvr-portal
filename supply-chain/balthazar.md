# Balthazar north-star device

3DVR Open Supply Chain uses the Balthazar Personal Computing Device as a north-star example for a computer that is open, modular, repairable, upgradeable, and sustainable.

## Why Balthazar

Balthazar is an open-hardware 13.3-inch laptop concept designed around swappable compute modules, RISC-V and FPGA options, Linux, replaceable storage and peripherals, hardware privacy switches, repairability, and CERN Open Hardware licensing.

Reference project: https://balthazar.space/
Reference hardware organization: https://github.com/balthazar-space

## First concrete stepping stone: Lichee Pi 4A / LM4A

The first hardware we can physically inspect is the Sipeed Lichee Pi 4A and its removable Lichee Module 4A compute module.

Known high-level parts to trace:

- T-Head TH1520 SoC
  - four RISC-V C910 application cores
  - C906 audio core
  - integrated GPU
  - 4 TOPS INT8 NPU
- LPDDR4/LPDDR4X memory
- eMMC storage
- SODIMM-style LM4A compute module connector
- power-management ICs
- Ethernet PHYs
- Wi-Fi / Bluetooth radio
- audio DAC / ADC and amplifier
- HDMI, USB, Ethernet, MIPI, microSD, and audio connectors
- PCB substrate, copper, solder, passive components, shielding, fasteners, and enclosure materials

Official Sipeed documentation already publishes schematics, a BOM, dimensional drawings, and a 3D model for the Lichee Pi 4A. Those documents are our first source set.

## Open Supply Chain questions

For each part, record:

1. What is it and what does it do?
2. Who manufactures it?
3. Where is it fabricated or assembled, when known?
4. What materials are inside it?
5. Can it be salvaged or reused?
6. Can it be repaired or replaced independently?
7. Is there a more open or locally manufacturable substitute?
8. What would it take for a community or cooperative to make the next layer down?

## Milestones

### 0 — Document

Build a verified bill of materials for the Lichee Pi 4A / LM4A from public documentation and the physical board.

### 1 — Repair and reuse

Document replaceable modules, common failure points, salvage sources, and second-life uses.

### 2 — Open laptop prototype

Use an existing RISC-V compute module as the heart of a repairable laptop prototype inspired by Balthazar rather than attempting to design a processor first.

### 3 — Replace closed layers

Identify proprietary firmware, undocumented chips, closed GPU/NPU paths, difficult-to-source components, and other dependencies. Replace them one layer at a time where practical.

### 4 — Community manufacturing

Develop or adopt open designs for the case, keyboard, power system, I/O boards, display mounting, wiring, and eventually compute hardware that regional workshops can build or assemble.

### 5 — Open source all the way down

Trace materials into recycling, refining, and—only where genuinely necessary—responsible, regulated, transparent extraction with worker and community ownership.

## Principle

We do not need to manufacture everything ourselves on day one. We need to make every dependency visible, understandable, replaceable, and progressively more open.
