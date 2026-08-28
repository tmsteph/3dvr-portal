# 3DVR Compute Module Interface v0

Status: **draft for first physical prototype**

The purpose of this interface is not to invent another high-density board connector. It is to define a small, stable boundary between a long-lived laptop shell and replaceable compute hardware.

## Core decision

**The laptop-side interface is functional, not tied to one SoM connector.**

Each supported compute board gets a thin adapter/carrier that maps its native connector into the 3DVR laptop interface. An LM4A adapter may use Sipeed's native 260-pin SODIMM-style connector internally; a future StarFive, Beagle, x86, or community board can use a completely different native connector without forcing a redesign of the laptop shell.

This follows the strongest part of the original Balthazar architecture: support multiple System-on-Module boards and keep the minimum common interface small. Balthazar identified power, USB, and HDMI as the minimum compatibility set and used a unifying board to connect modular subsystems.

## v0 required functions

A compute adapter MUST provide:

1. **Power input**
   - Laptop power subsystem feeds the adapter.
   - Exact rail(s), voltage, and current envelope remain prototype decisions.
   - Adapter owns board-specific regulation when practical.

2. **Primary display output**
   - v0 transport: HDMI-compatible digital video from compute adapter to the laptop display controller.
   - The panel itself should not be electrically coupled to one compute board generation.

3. **Primary peripheral link**
   - At least one USB 3.x host link from compute adapter to the laptop I/O subsystem.
   - Keyboard, pointing device, camera, audio, and general peripheral expansion should preferably sit behind the laptop-side I/O subsystem rather than on a compute-specific carrier.

4. **Boot/storage path**
   - Compute board may contain local boot storage (for example eMMC).
   - Laptop should also expose replaceable storage through a standard interface where feasible.

5. **Service/debug access**
   - UART or equivalent serial console exposed through a service connector or internal header.
   - Reset/recovery controls should be reachable without destructive disassembly.

## v0 optional functions

Adapters MAY expose:

- second USB link
- Ethernet
- PCIe or another high-speed expansion link
- direct MIPI display/camera links
- I2C management bus
- fan PWM / tachometer
- power-state signals
- GPIO
- audio I2S/PDM
- hardware accelerator-specific links

Optional signals must not become required for basic laptop operation.

## Mechanical boundary

For prototype 0, do **not** freeze the final module dimensions.

Instead:

- reserve a rectangular service bay behind or below the keyboard
- mount the compute adapter on removable standoffs or rails
- use short replaceable cables between adapter and laptop subsystems
- make the adapter the sacrificial compatibility layer
- leave room for a heat spreader and active cooling if needed

After two substantially different compute boards have been adapted successfully, we can freeze a mechanical envelope based on evidence rather than guessing.

## Laptop-side subsystem split

```text
                +----------------------+
                |  Replaceable compute |
                |  board + adapter     |
                +----------+-----------+
                           |
          power + video + USB + service
                           |
       +-------------------+------------------+
       |        3DVR laptop-side bus          |
       +---------+--------------+-------------+
                 |              |             |
             Display          I/O hub       Power
                 |              |             |
              Panel      keyboard/cam/     Battery
                          audio/USB/etc.     charger
```

The shell, display, keyboard, battery system, storage bay, and most peripheral I/O should remain useful when the compute module changes.

## Why not standardize LM4A's connector?

The LM4A is a strong first prototype board, but its connector exposes many TH1520-specific functions including MIPI CSI/DSI, HDMI, USB, Ethernet PHY signals, SDIO, UART, I2C, I2S, GPIO, boot/recovery signals, and more. Making that exact pinout the 3DVR standard would unnecessarily couple future modules to one vendor's SoM architecture.

Instead, the LM4A native connector terminates on an **LM4A adapter**, and only the smaller common function set crosses into the laptop architecture.

## Compatibility levels

### Level A — boots as a laptop
Required:
- power
- display
- USB peripherals
- boot/storage
- service console

### Level B — daily-driver capable
Adds:
- replaceable high-speed storage
- Wi-Fi/Bluetooth or replaceable radio module
- audio
- camera
- suspend/resume and battery-state integration
- thermal control

### Level C — advanced/open compute
Adds as hardware permits:
- PCIe/high-speed accelerator expansion
- direct open accelerator support
- hardware privacy controls
- increasingly open firmware/boot chain
- open or community-designed compute hardware

## Non-goals for v0

- custom silicon
- a universal 260-pin electrical standard
- final industrial design
- fanless operation at all costs
- perfect openness on day one
- requiring RISC-V for every prototype

The architecture should make it possible to replace closed pieces over time without throwing away the rest of the computer.

## Upstream / reference work

- Balthazar Specifications: https://balthazar.space/wiki/Specifications
- Balthazar Documentation / Unifying Board: https://balthazar.space/wiki/Documentation
- Sipeed LM4A documentation: https://wiki.sipeed.com/hardware/en/lichee/th1520/lm4a.html
- Sipeed LM4A Datasheet v1.1: https://dl.sipeed.com/fileList/LICHEE/licheepi4a/01_Specification/SIPEED_LM4A_DataSheet_EN_V1.1.pdf

## Gate before v1

Do not call this interface v1 until:

1. one LM4A-based prototype boots and operates as a laptop through the boundary above;
2. one meaningfully different compute board is mapped to the same laptop-side functions;
3. we have measured power, thermals, cable routing, and serviceability on real hardware.
