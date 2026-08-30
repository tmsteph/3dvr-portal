# Prototype 01 — LM4A laptop mule

Status: **planned**

Goal: build the fastest useful physical test of the 3DVR Compute architecture using a Sipeed LM4A / Lichee Pi 4A compute path.

This prototype is deliberately allowed to be ugly. It exists to answer architectural questions before we spend time on industrial design.

## Why LM4A first

The LM4A is a useful first compute module because:

- it is a RISC-V SoM built around the TH1520;
- Sipeed exposes the module through a SODIMM-style carrier architecture;
- public documentation includes a module datasheet and pin definition;
- Sipeed has already demonstrated the same SoM in multiple products, including desktop/baseboard, console, cluster, and laptop-style systems;
- Debian is a supported operating-system path in Sipeed's laptop implementation.

The project should still treat LM4A as a **prototype implementation**, not the permanent 3DVR connector standard.

## Prototype architecture

```text
LM4A
  |
LM4A adapter / existing carrier for early bring-up
  |
  +-- HDMI/video ----------> display controller/panel
  +-- USB 3.x -------------> laptop I/O hub
  +-- storage -------------> eMMC first; replaceable SSD second
  +-- UART/service --------> accessible debug header
  +-- power ---------------> prototype power subsystem

Laptop I/O hub
  +-- keyboard
  +-- pointing device
  +-- audio
  +-- camera
  +-- external USB
```

## Phase 0 — bench validation

When the hardware is physically available:

1. Inventory the exact LM4A and carrier/baseboard revision.
2. Record:
   - RAM and eMMC size
   - connector revision
   - input voltage
   - idle and loaded power draw
   - CPU temperature and cooling arrangement
   - working display outputs
   - working USB ports
   - kernel and Debian version
3. Confirm boot from the existing setup before changing anything.
4. Run a small stability workload and tinygrad CPU smoke test.
5. Photograph connector placement and measure the real board stack with calipers.

No destructive modifications in this phase.

## Phase 1 — laptop mule

Use off-the-shelf parts wherever possible:

- LM4A plus known-good carrier/baseboard or a minimal LM4A adapter
- 13–14 inch display with a replaceable HDMI/eDP controller path
- USB keyboard/trackpad assembly
- replaceable USB audio if integrated audio slows the prototype down
- external or protected battery/power solution initially
- simple aluminum/acrylic/3D-printed mounting plate
- accessible fan and heat spreader

Success criterion: the device can boot Debian, use its built-in display and keyboard/pointing device, connect to Wi-Fi or Ethernet, run from its intended power path, and survive normal interactive use without thermal instability.

## Phase 2 — separate long-lived laptop functions

Move functions away from the compute-specific carrier:

- keyboard + pointing device -> laptop I/O board
- camera -> laptop I/O board
- audio -> laptop I/O board
- storage -> replaceable laptop storage bay where practical
- power switching / battery management -> laptop power board
- physical privacy switches -> laptop-side hardware

The compute module should increasingly need only the small function set defined in `compute-module-v0.md`.

## First measurements that matter

Do not optimize dimensions from internet specifications alone. Measure the actual unit.

Capture:

- module + socket stack height
- carrier footprint
- heatsink/fan envelope
- connector keep-out zones
- cable bend radius
- peak wall power during CPU load
- peak wall power during GPU/NPU tests if usable
- surface and core temperatures
- display power draw
- battery/runtime estimate

These measurements become the input to the first CAD envelope.

## Software bring-up

Minimum:

```text
Debian boots
network works
USB input works
display works
audio works or has a documented temporary substitute
suspend/resume tested and documented
tinygrad CPU smoke test runs
```

Nice to have:

- upstream-friendly kernel
- working GPU acceleration
- NPU experimentation
- tinygrad RISC-V fixes upstreamed where concrete issues are found

## Hardware privacy targets

Borrow a particularly good Balthazar idea: physical controls for sensitive hardware.

Prototype candidates:

- camera power cut
- microphone power/mute cut
- radio/Wi-Fi disable
- speaker mute

The exact electrical implementation comes after we map the laptop-side I/O board.

## What we are reusing from Balthazar

Preserve, study, and credit:

- replaceable SoM philosophy
- unifying/carrier-board concept
- modular power and I/O separation
- repair-oriented enclosure thinking
- hardware privacy switches
- serviceable keyboard direction

Do not copy obsolete constraints merely for compatibility. Keep interfaces when they help; adapt when modern available hardware provides a better route.

## Exit criteria

Prototype 01 is successful when we can say, with measurements:

> This laptop shell can run an LM4A compute module without making the display, keyboard, power, and I/O architecture LM4A-specific.

At that point, Prototype 02 should use a different compute family to test whether the interface is genuinely modular.

## References

- Sipeed LM4A: https://wiki.sipeed.com/hardware/en/lichee/th1520/lm4a.html
- Sipeed Lichee Book 4A: https://wiki.sipeed.com/hardware/en/lichee/th1520/lbook4a/lbook4a.html
- Balthazar Specifications: https://balthazar.space/wiki/Specifications
- Balthazar Features: https://balthazar.space/wiki/Features
