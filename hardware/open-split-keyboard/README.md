# 3DVR Open Split Keyboard

First physical project of the **3DVR Hardware Commons**.

## Purpose

Build an ergonomic split keyboard that is:

- repairable;
- reproducible by someone outside the original team;
- built from commonly available parts;
- friendly to Linux/Debian;
- open in firmware, documentation, and mechanical design;
- useful on a desk now, with a path toward VR/wearable typing later.

## V0

V0 should be boring in the best way: wired, simple, inexpensive, well documented, and easy to repair.

Current assumptions:

- mechanical switches with easy sourcing;
- one inexpensive microcontroller per half or a simple master/secondary arrangement;
- open keyboard firmware;
- hand-wired or existing open PCB before designing a custom board;
- 3D-printable or similarly accessible enclosure;
- detachable interconnect and host cable where practical.

No decision is final until we have checked availability, cost, documentation, and reproducibility.

## Repository layout

- `BOM.md` — candidate parts, alternates, cost, sourcing
- `CONTRIBUTING.md` — ways to help now
- `cad/` — editable mechanical source and exports
- `firmware/` — firmware configuration/source and flashing guide
- `assembly/` — build instructions and photos
- `testing/` — repeatable test checklist
- `repair/` — failures, diagnosis, replacement procedures

Folders will be added as real artifacts appear rather than as empty placeholders.

## Definition of done for V0

A second person can use only the public files to:

1. obtain the parts;
2. fabricate the mechanical pieces;
3. assemble both halves;
4. flash the firmware;
5. verify every key;
6. diagnose and repair a basic failure.

## Immediate work

1. Inventory parts and tools already available.
2. Pick a conservative key layout.
3. Compare hand wiring with an existing open PCB.
4. Select the controller + firmware stack.
5. Set an initial BOM cost target.
6. Build one working half before optimizing aesthetics.

Tracking issue: #2498
