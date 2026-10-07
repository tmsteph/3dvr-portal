# 3DVR Open Phone Roadmap

## North star

Build an open, repairable personal computing system that can begin around the phone people already own and progressively replace closed components without requiring a giant all-at-once smartphone project.

**Evolution:** existing phone → modular dock → Linux companion compute → modular handheld → open phone.

The Phone Dock is therefore not an accessory dead-end. It is the mechanical and electrical bridge toward a full 3DVR computing platform.

## Principles

- Useful at every stage.
- Replace one closed layer at a time.
- Standard interfaces before custom parts.
- Linux and web-first where practical.
- Operator remains the primary conversational interface.
- Repairable, printable, documented, and open.
- Cellular is a module, not the identity of the computer.
- Preserve situational awareness in wearable modes.
- Prototype ergonomics before electronics; prototype electronics before a custom mainboard.

## Phase 0 — Phone Dock

Use an existing Android/iPhone as screen, camera, sensors, cellular radio, battery, and compute.

3DVR provides:
- universal rotating cradle
- quick-release belt/chest/head/desk mounting
- physical keyboard/pointer/game controls
- USB-C power/data/display
- modular accessory rail
- Operator as the software shell

**Success:** the dock is genuinely useful even if no later phase ships.

## Phase 1 — Companion Compute

Add an optional Linux compute module to the dock while the phone remains display/modem/sensor gateway.

Candidate architecture:
- Raspberry Pi Compute Module or comparable ARM/RISC-V SBC
- USB-C networking/display/input
- removable storage
- optional battery module
- browser/SSH/remote desktop bridge to Operator

This lets us develop the open software environment before solving telephony.

**Success:** unplug the companion module and use it as a normal Linux computer; dock it and the phone becomes its pocket UI.

## Phase 2 — Modular Handheld

Replace more phone responsibilities with commodity modules:
- Linux compute
- touchscreen
- cameras
- GNSS
- Wi-Fi/Bluetooth
- audio
- battery + charging/BMS
- sensors
- LTE/5G modem
- microcontroller for low-power controls

Keep modules separable where practical instead of recreating a monolithic smartphone motherboard immediately.

**Success:** daily networked handheld computing works without relying on the original phone for core compute.

## Phase 3 — Open Phone

Integrate the proven modules into a purpose-built 3DVR handheld/mainboard.

Software layers:
- Linux base
- modem/telephony service
- power and hardware services
- adaptive touch/keyboard/spatial shell
- Operator
- web/PWA applications
- optional Android compatibility where useful

Hardware goals:
- documented interfaces
- replaceable battery
- replaceable compute/modem where feasible
- accessible screws/connectors
- published CAD/PCB/firmware
- community-manufacturable accessories

**Success:** calls, messaging, data, camera, navigation, audio, everyday apps, and desktop-style computing are coherent enough to be a real primary device.

## Architecture rule

Do not make one processor pretend to be every subsystem.

A practical prototype may use:
- application processor / SBC for Linux and apps
- cellular modem for radio
- microcontroller for buttons, LEDs, power state, and low-power peripherals
- dedicated charging/BMS hardware
- commodity camera/display modules

The challenge is the integration layer: power states, drivers, buses, modem control, audio routing, suspend/resume, thermal behavior, and a UI that makes the modules feel like one device.

## First experiments

1. Finish and physically test the Phone Dock mechanical interface.
2. Attach an off-the-shelf keyboard/pointer and USB-C hub.
3. Prototype a detachable Linux compute module.
4. Make Operator work cleanly across phone + Linux compute.
5. Test commodity LTE modem support on Linux separately.
6. Only after those experiments, choose parts for a first integrated electronics carrier board.

## What we deliberately do not do yet

- custom smartphone motherboard
- custom cellular RF design
- certification-heavy radio hardware
- custom display/camera electronics
- bespoke keyboard PCB before ergonomics are proven

Those become justified only after the modular prototypes tell us what the real device wants to be.

## Long-term idea

The screen, modem, compute, controls, battery, cameras, and mounting system should become composable parts of one open personal-computing ecosystem. A phone is one configuration; a wearable, desk terminal, vehicle computer, or spatial display can reuse the same system.

**Build the future by replacing the black box one layer at a time.**
