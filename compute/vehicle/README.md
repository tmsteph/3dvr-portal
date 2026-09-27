# 3DVR Open Vehicle

An open, repairable, user-owned vehicle platform within 3DVR Compute.

The goal is not to pretend a road-ready vehicle can be made safe by simply publishing source code. The goal is to make every layer that can reasonably be opened understandable, replaceable, documented, and interoperable while keeping safety-critical work disciplined.

## Design principles

- User-owned: diagnostics, logs, configuration, and service information belong to the owner.
- Repairable: prefer standard parts, documented connectors, replaceable modules, and ordinary tools.
- Open by default: publish software, schematics, CAD, interfaces, BOMs, and service documentation where licensing allows.
- Modular: separate long-lived structure from fast-moving compute, batteries, displays, sensors, and controllers.
- Offline-capable: basic operation and diagnostics must not require a vendor cloud.
- Interoperable: use documented standards and adapters instead of locking the vehicle to one supplier.
- Safety first: prototype infotainment, telemetry, simulation, and read-only diagnostics before touching steering, braking, propulsion, or other safety-critical control.

## Architecture

1. **Mechanical platform** — chassis, suspension, steering, braking, body, mounting standards, and service access.
2. **Energy and propulsion** — battery modules, BMS, charger, inverter, motor, thermal management, and documented high-voltage boundaries.
3. **Vehicle network** — isolated CAN or equivalent buses, gateways, diagnostics, logging, and replayable test data.
4. **Open cockpit** — Linux-based display, navigation, media, cameras, local storage, and owner-controlled connectivity.
5. **Vehicle computer** — modular compute with a long-term RISC-V path where practical.
6. **3DVR layer** — HUD, local AI, maintenance knowledge, trip tools, automation, and owner-controlled personal context.

## Roadmap

### Phase 1 — Open cockpit
Use an existing vehicle as the development platform. Add Linux compute, GPS, cameras, local media, sensors, and read-only OBD-II/CAN diagnostics without taking control of safety-critical systems.

### Phase 2 — Simulation and bench systems
Build virtual CAN networks, component simulators, replayable logs, bench harnesses, and hardware-in-the-loop tests. Learn interfaces before controlling real hardware.

### Phase 3 — Modular EV prototype
Use documented donor components and proven subsystems to explore an open vehicle management layer, energy system, instrumentation, and service tooling.

### Phase 4 — Open physical platform
Develop or adapt an openly documented chassis/body platform with a BOM, CAD, wiring, service manual, fabrication notes, and clear regulatory assumptions.

### Phase 5 — Open compute stack
Move more vehicle compute toward auditable Linux and open hardware, including RISC-V where it is mature enough for the target role.

## Safety boundary

The early 3DVR Open Vehicle work should remain read-only or non-critical in a real road vehicle. Steering, braking, propulsion, restraint systems, high-voltage battery controls, and other safety-critical functions require appropriate engineering analysis, testing, fault handling, and legal/regulatory review before real-world deployment.

Simulation, RC-scale platforms, bench rigs, and isolated test vehicles are the preferred places to experiment with active control.

## Projects to learn from

- [Open Vehicle Control System](https://github.com/open-vehicle-control-system/ovcs) — open vehicle embedded hardware/software and a useful reference for modular vehicle control architecture.
- [Automotive Grade Linux](https://www.automotivelinux.org/) — Linux Foundation ecosystem for open automotive software.
- [TABBY EVO / Open Motors](https://www.openmotors.co/evplatform/) — an open modular EV platform with published design material.
- [RIGOLETTO](https://rigoletto-project.eu/) — European RISC-V automotive hardware research for software-defined vehicles.

These are references, not dependencies. 3DVR should reuse proven open work where it fits and document boundaries where the stack is still proprietary.

## First build

The first practical milestone is an **Open Vehicle Dev Kit** for an ordinary existing car:

- isolated read-only OBD-II/CAN interface
- Linux or RISC-V computer
- GPS and IMU
- optional cameras
- local-first trip and maintenance logs
- open dashboard/HUD prototype
- reproducible recorded bus data for offline development
- no safety-critical actuation

That gives us something useful now while creating the knowledge needed for deeper vehicle work later.
