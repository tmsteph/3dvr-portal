# Open computing ecosystem models

Date: 2026-09-17
Status: working hardware strategy

This note captures four complementary organizations that are useful reference models for 3DVR's open-computing work. The point is not to copy one company. It is to understand which layer each organization handles well and combine the useful patterns into a more open, modular system.

## The four models

### Sipeed — rapid productization of emerging silicon

Sipeed is useful as a model for taking new or unusual processors and turning them into affordable developer hardware quickly. The LicheePi 4A uses the T-Head TH1520 RISC-V SoC, and its removable LM4A compute module separates the difficult CPU, memory, and storage design from the carrier board.

Useful lessons for 3DVR:

- get real hardware into developers' hands early;
- use modular compute where possible;
- expose schematics, BOMs, drawings, and other engineering artifacts;
- accept that early platforms may be rough while upstream software catches up;
- build laptops, handhelds, clusters, and other products around a reusable module rather than redesigning the compute core every time.

Reference: https://wiki.sipeed.com/hardware/en/lichee/th1520/lpi4a/1_intro.html
Reference: https://wiki.sipeed.com/hardware/en/lichee/th1520/lm4a.html

### StarFive — RISC-V silicon and IP

StarFive is useful as the deeper silicon-side reference. Its product stack includes RISC-V CPU IP, NoC IP, processors such as the JH-7110, and the VisionFive development-board family.

Useful lessons for 3DVR:

- eventually move below the board level into CPU, interconnect, and SoC design;
- make development boards part of the silicon strategy so software can mature alongside the hardware;
- support Linux and upstream ecosystems early;
- use the current VisionFive hardware as a second RISC-V architecture and supplier path alongside TH1520 systems.

Reference: https://www.starfivetech.com/en/
Reference: https://www.starfivetech.com/en/index.php?c=show&id=14&s=hardware

### BeagleBoard.org — open hardware as a community institution

BeagleBoard.org is a nonprofit foundation whose mission centers on education and collaboration around open-source software and hardware in embedded computing. Its published designs are explicitly intended to be open and reproducible.

Useful lessons for 3DVR:

- openness should include design files and the ability for other people to manufacture compatible hardware;
- community governance, education, documentation, and contribution paths matter as much as the board itself;
- commercial manufacturers can coexist with a nonprofit/open foundation model;
- the project should remain useful to learners, hackers, researchers, and product builders rather than becoming a closed appliance company.

Reference: https://www.beagleboard.org/about

### LattePanda — modular x86 and open carrier-board engineering

LattePanda is useful as a bridge between maker hardware and conventional PC compatibility. The LattePanda Mu family packages Intel x86 processors, memory, and storage into a compute module while leaving carrier-board I/O to the system designer. LattePanda publishes carrier-board design guidance, and its Lite Carrier is fully open-source and designed in KiCad.

Useful lessons for 3DVR:

- define a clean compute-module/carrier boundary;
- let the carrier own ports, power, display, storage expansion, networking, and physical integration;
- use a familiar x86 module when it helps prototype a chassis or product even if RISC-V remains the long-term open-ISA direction;
- study production-quality open KiCad carrier files instead of beginning every design from a blank PCB.

Reference: https://www.lattepanda.com/lattepanda-mu
Reference: https://docs.lattepanda.com/content/mu_edition/lite_carrier/

## Combined model for 3DVR

The useful synthesis is:

1. **StarFive-style silicon depth** — learn CPU, NoC, FPGA, and eventual SoC design.
2. **Sipeed-style productization** — turn emerging compute into usable devices quickly.
3. **BeagleBoard-style openness** — make the designs, documentation, education, and community first-class.
4. **LattePanda-style modularity** — separate the compute module from the carrier, chassis, and I/O so the rest of the computer can survive processor changes.

The immediate goal is not to manufacture a CPU. The immediate goal is to make the layers visible and replaceable.

## Participation is part of the architecture

Studying these organizations is not enough. 3DVR should participate in the ecosystems it depends on and use upstream work as a training ground for deeper hardware competence.

The first concrete example came from recovering our physical LicheePi 4A:

- `sipeed/sipeed_wiki#1032` records the BOOT-vs-RESET enclosure recovery gotcha;
- `sipeed/sipeed_wiki#1033` is the active upstream documentation PR adding that clarification in place;
- `sipeed/sipeed_wiki#1034` was closed as a duplicate after a second, larger documentation version was created.

The lesson is useful beyond Sipeed: prefer the smallest upstream change that fixes a real problem, keep one canonical contribution path, and turn field experience into maintainable evidence.

The operating procedure is documented in `docs/hardware-participation-loop.md`.

## Practical roadmap

### Stage 1 — learn from real boards

Use the LicheePi 4A / LM4A and VisionFive hardware as active Linux and RISC-V lab machines. Record boot, kernel, firmware, GPU, NPU, networking, power, thermals, and reliability lessons instead of treating board quirks as isolated problems.

Maintain a common compatibility matrix so the same categories are checked across architectures and vendors.

### Stage 2 — trace open designs

Study Sipeed schematics and BOMs, BeagleBoard hardware releases, StarFive reference designs, and LattePanda carrier-board files. Turn that study into our own component and interface knowledge base.

### Stage 3 — contribute while learning

When physical use exposes a reproducible problem, open or improve the upstream issue first, then prepare the smallest useful patch. Record maintainer feedback and feed the lesson back into the hardware-lab matrix.

Documentation, tests, kernel/device-tree fixes, packaging, recovery instructions, and reproducible benchmarks all count when they solve a real user problem.

### Stage 4 — define a 3DVR carrier contract

The Balthazar continuation should stay compute-module-neutral. Define common mechanical and electrical requirements for power, display, USB, storage, networking, thermals, mounting, keyboard, battery, and optional high-speed expansion.

### Stage 5 — build adapters, not a new CPU

Prototype a common laptop/device platform that can accept LM4A, StarFive-based hardware, LattePanda Mu, and future modules through carriers or adapters. This lets the chassis, keyboard, battery system, and repair model evolve independently of processor choice.

### Stage 6 — push upstream at deeper layers

Improve Debian, mainline Linux, firmware documentation, drivers, boot flows, and open tooling as issues are discovered. A useful 3DVR hardware project should improve the ecosystems it depends on rather than merely consuming them.

### Stage 7 — go deeper only when earned

Move toward FPGA-first RISC-V cores, accelerators, interconnects, and eventually a more open SoC when the team has accumulated enough practical board, kernel, PCB, firmware, and manufacturing experience.

## Principle

Do not wait for a perfectly open computer to appear. Start with the most open practical layer available, document every dependency, make interfaces replaceable, contribute upstream, and progressively replace the closed layers.

Related work: `docs/hardware-participation-loop.md`, `supply-chain/balthazar.md`, `compute/hardware/compute-module-v0.md`, and `compute/hardware/prototype-01-lm4a.md`.
