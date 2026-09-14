# Open Electronics Commons

## Vision

Build a community-based path from repairing and assembling electronics toward making increasingly complete electronic systems from raw materials, open designs, shared tools, local knowledge, and cooperative production.

The goal is not to pretend every layer can be localized immediately. The goal is to steadily replace opaque dependencies with understandable, repairable, reproducible ones.

## Maturity ladder

1. **Repair and salvage**
   - recover parts from discarded electronics
   - publish teardown notes and reusable component inventories
   - teach soldering, diagnostics, rework, and safe handling

2. **Assembly from open modules**
   - build useful devices from documented boards, connectors, sensors, power modules, displays, radios, and compute modules
   - publish BOMs, substitutions, firmware, assembly steps, and test procedures

3. **Community PCB production**
   - design our own boards
   - use open EDA tools and publish source files
   - prototype locally where safe and practical
   - document substrate, copper, solder mask, finish, vias, assembly, and testing

4. **Local enclosures, controls, and interconnects**
   - fabricate cases, brackets, cables, keyboards, switches, heatsinks, and mechanical interfaces
   - favor standard fasteners and repairable construction

5. **Discrete electronics and simple components**
   - teach and reproduce simple power supplies, amplifiers, oscillators, sensor circuits, and logic from discrete parts
   - investigate community-scale production of simple passives, transformers, coils, switches, connectors, and electromechanical parts

6. **Open programmable logic and RISC-V systems**
   - use FPGAs and open cores as the bridge between board-level electronics and custom silicon
   - build computers whose architecture, firmware, operating system, and board design are increasingly open

7. **Open silicon participation**
   - contribute to open PDK, shuttle, packaging, verification, and open CPU/SoC ecosystems
   - design chips before attempting fabrication infrastructure
   - use external foundries where necessary while keeping designs and toolchains open

8. **Long-term community microfabrication research**
   - study what semiconductor, sensor, MEMS, packaging, or thin-film processes could safely become community- or university-scale
   - treat chemicals, high voltage, vacuum systems, clean processes, and hazardous materials with professional safety controls

## First practical target

Build one small useful device whose entire design is public and whose supply chain is documented.

Suggested first device: a simple 3DVR environmental / garden node with:

- open PCB design
- common replaceable microcontroller or RISC-V module
- temperature / humidity / light sensing
- USB-C power
- optional battery or solar input
- simple enclosure that can be printed or fabricated locally
- firmware source
- BOM with at least two substitutes for fragile dependencies
- repair and test guide
- supply-chain record for every major part

This connects directly to the Open Food Commons while exercising the electronics stack.

## Community model

The project should support:

- repair nights
- shared electronics benches
- tool libraries
- component salvage bins
- beginner soldering classes
- open board-design workshops
- local assembly runs
- shared test equipment
- mentorship
- documentation and translation
- paid or credited contributions where useful

Knowledge should be treated as infrastructure. A person who learns how to repair, assemble, test, or design something should be able to teach the next person.

## Open Electronics Supply Record

For every major component or process, track:

- `id`
- `category`
- `function`
- `manufacturer`
- `supplier`
- `facility`
- `country`
- `part_number`
- `open_design_available`
- `datasheet_available`
- `firmware_open`
- `toolchain_open`
- `repairable`
- `salvageable`
- `substitutes`
- `minimum_order`
- `unit_price`
- `lead_time`
- `test_method`
- `hazards`
- `evidence`
- `local_make_path`
- `notes`

## Principles

- Repair before replacement.
- Salvage before extraction.
- Prefer documented interfaces.
- Prefer multiple suppliers.
- Publish source, schematics, BOMs, firmware, tests, and mechanical files.
- Avoid proprietary lock-in where practical.
- Be honest about closed layers that remain.
- Separate community-scale processes from industrial processes that require specialized safety infrastructure.
- Make the first useful thing before optimizing the whole stack.

## Long-term north star

A community should eventually be able to understand, repair, reproduce, and improve the electronics it depends on.

Not everything must be made in one neighborhood. The important thing is that the knowledge, designs, interfaces, and production path are open enough that communities can progressively take ownership of more layers.

Open source all the way down.
