# 3DVR Hardware Commons

**Build the machines together. Publish the recipe. Keep the knowledge local.**

3DVR Hardware Commons is a community-owned path toward computers and tools that people can understand, repair, reproduce, modify, and eventually manufacture closer to home.

The goal is not to become another closed hardware vendor. The goal is to make hardware creation progressively more accessible: first assembly and repair, then open modules and boards, then local fabrication, and eventually deeper semiconductor work.

## Principles

1. **Publish the recipe** — CAD, schematics, firmware, BOMs, assembly instructions, test procedures, and known limitations should be public whenever licensing allows.
2. **Repair before replace** — prefer screws, sockets, standard connectors, replaceable batteries, replaceable compute modules, and documented service procedures.
3. **Community reproducibility** — a design is not finished until another person or group can reproduce it from the documentation.
4. **Local-first manufacturing** — choose processes that can move from global suppliers toward makerspaces, repair shops, schools, co-ops, and small manufacturers.
5. **Modularity over product churn** — cases, keyboards, displays, batteries, I/O, and compute should evolve independently when practical.
6. **Open software by default** — prioritize Linux, Debian, open firmware, RISC-V, open protocols, and tools that do not require proprietary cloud services.
7. **Pay contributors when possible** — use bounties, shared purchasing, paid assembly, repair services, kits, sponsorships, and productized support to fund the commons.
8. **Document failures** — failed builds, unavailable parts, thermal problems, manufacturing mistakes, and dead ends are useful community knowledge.

## First Build Ladder

### Phase 0 — Commons infrastructure

- Hardware Commons portal page and public roadmap.
- Standard project template: README, BOM, CAD, schematics, firmware, assembly, testing, sourcing, repair, license, contribution guide.
- Public inventory of tools and machines available to the community.
- Contribution board for design, sourcing, documentation, testing, and fabrication tasks.

### Phase 1 — Things communities can build now

Start with hardware whose manufacturing burden is low and whose usefulness is immediate.

- Split ergonomic keyboard for desktop and VR typing.
- Open enclosures, mounts, docks, stands, and replacement parts.
- USB and low-voltage electronics kits.
- Repair guides and adapters for existing open/community hardware.
- Small-batch community assembly days.

Success condition: someone outside the original team can build, repair, or modify the design using the published files.

### Phase 2 — Community computer kit

Build a modular small computer around an existing open-friendly compute platform.

Preferred direction:

- RISC-V where it is practical.
- Debian/Linux target.
- Replaceable compute module.
- Standard display, storage, power, and I/O interfaces.
- Open enclosure and carrier-board files.
- Headless-server mode as a first-class use case.

This can begin as a community kit rather than a fully custom motherboard.

### Phase 3 — Open boards and local PCB capability

- Design simple carrier boards and peripherals in open EDA tools.
- Publish Gerbers, source schematics, test fixtures, and manufacturing notes.
- Organize pooled PCB orders.
- Establish repeatable soldering, rework, inspection, and testing workflows.
- Connect local makerspaces, schools, repair shops, and independent technicians.

### Phase 4 — Community microfactory

Create a reproducible small workshop capable of producing useful computing hardware in batches.

Possible capabilities:

- 3D printing and CNC.
- Laser cutting.
- PCB assembly and rework.
- Cable and harness production.
- Keyboard and enclosure assembly.
- Device imaging, testing, and repair.

The microfactory itself should be documented as an open project.

### Phase 5 — Deeper silicon and fabrication

Long-term research lane:

- FPGA-first open processor experiments.
- RISC-V cores and peripherals.
- Open-source PDK and semiconductor tooling education.
- Collaboration with community semiconductor projects such as HackerFab and Libre-SOC.
- Exploration of progressively more local semiconductor fabrication.

This phase is intentionally ambitious. Earlier phases should remain useful even if full community chip fabrication takes years.

## Community Model

Hardware Commons should support multiple ways to participate:

- **Builders** assemble and test designs.
- **Designers** contribute CAD, electronics, firmware, and industrial design.
- **Repairers** document failures and keep devices alive.
- **Local chapters** organize build nights, tool sharing, and workshops.
- **Suppliers** offer transparent parts, fabrication, or small-batch manufacturing.
- **Sponsors/customers** fund builds, bounties, and public documentation.

A contributor should not need to be an electrical engineer to matter. Photography, instructions, sourcing, testing, packaging, translation, teaching, and community coordination are all real hardware work.

## Economic Loop

The commons can support itself without closing the designs.

Potential revenue:

- kits and assembled hardware;
- paid repair and upgrades;
- small-batch manufacturing;
- workshops and training;
- hosted coordination and purchasing tools;
- sponsorships and bounties;
- custom adaptations for organizations;
- optional managed software and support.

Open files create competition, but they also create trust, adoption, contributors, local manufacturers, and new service opportunities.

## First Concrete Project

The default first project is the **3DVR Open Split Keyboard**: an ergonomic, repairable keyboard intended to work at a desk and in VR.

Initial scope:

- off-the-shelf switches and controllers;
- wired first, wireless later;
- replaceable cable and controller;
- printable or easily fabricated case;
- open firmware;
- complete BOM and build instructions;
- cost target that makes community builds realistic;
- design choices that can later support a compact wearable/VR configuration.

## Definition of Done

A Hardware Commons project is healthy when:

- source files are public;
- a BOM is current;
- assembly and repair are documented;
- licenses are explicit;
- another person has reproduced the build;
- known problems are visible;
- contribution tasks are discoverable;
- the design can survive without one vendor or one maintainer.

## Near-Term Actions

1. Publish the Hardware Commons portal page.
2. Create the Open Split Keyboard project folder and BOM template.
3. Inventory parts and fabrication tools already owned or easily accessible.
4. Identify an inexpensive first controller and switch architecture.
5. Publish the first build task so another person can contribute without asking for permission.

Hardware Commons is part of the broader 3DVR goal: move from consuming opaque systems toward communities that can understand and build the tools they depend on.
