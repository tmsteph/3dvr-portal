# Open Electronics Commons

## Vision

Build a community-based path from repairing and assembling electronics toward making increasingly complete electronic systems from raw materials, open designs, shared tools, local knowledge, and cooperative production.

The goal is not to pretend every layer can be localized immediately. The goal is to steadily replace opaque dependencies with understandable, repairable, reproducible ones.

## Inspirations

### Hacker Fab

Hacker Fab demonstrates that semiconductor fabrication does not have to remain a sealed industrial mystery. Its model is to make DIY versions of nanofabrication tools, document processes openly, and encourage independent labs, universities, clubs, and contributors to replicate and improve them.

3DVR should learn especially from its emphasis on replication, documentation, low-cost tooling, measurable process capability, and strong safety culture.

Reference: https://hackerfab.org/

### Open Source Ecology

Open Source Ecology demonstrates the larger industrial pattern: open, modular machines that can build infrastructure and eventually other machines. The Global Village Construction Set includes fabrication, agriculture, energy, construction, metalworking, circuit-making, furnaces, and material-processing equipment.

3DVR should treat electronics as one branch of a broader community production stack rather than an isolated hobby.

Reference: https://www.opensourceecology.org/

### Balthazar Personal Computing Device

Balthazar gives the stack a concrete product target: a repairable, upgradeable, open personal computer built around open architectures such as RISC-V and FPGA-based computing modules.

3DVR can use Balthazar as a north star while progressively opening the supply chain underneath it.

Reference: https://balthazar.space/

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

8. **Community semiconductor fabrication**
   - learn from Hacker Fab and related open nanofabrication communities
   - replicate safe, documented tools and process modules rather than inventing everything independently
   - begin with educational devices and coarse geometries before pursuing higher-density integrated circuits
   - maintain professional controls for chemicals, gases, vacuum, high voltage, contamination, and waste

9. **Materials and elements**
   - connect every device BOM downward to its constituent materials and useful elements
   - prioritize urban mining, repair, reuse, scrap sorting, and closed-loop recycling before virgin extraction
   - develop community-scale capability for safe metal sorting, remelting, casting, wire production, sheet, simple alloys, glass, ceramics, carbon materials, and other achievable feedstocks
   - document where copper, aluminum, iron, tin, nickel, silicon, carbon, lithium, rare earths, and other materials actually originate
   - study responsible gathering, quarrying, mining, beneficiation, refining, and purification only where legally, environmentally, and technically appropriate
   - treat land stewardship, worker safety, water, tailings, emissions, indigenous/local rights, and ecological restoration as part of the engineering specification

See `elements.md` for the Open Elements Commons roadmap.

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
- Recycle before virgin mining where practical.
- Prefer documented interfaces.
- Prefer multiple suppliers.
- Publish source, schematics, BOMs, firmware, tests, and mechanical files.
- Avoid proprietary lock-in where practical.
- Be honest about closed layers that remain.
- Separate community-scale processes from industrial processes that require specialized safety infrastructure.
- Treat environmental and worker protections as engineering requirements, not externalities.
- Make the first useful thing before optimizing the whole stack.

## Long-term north star

A community should eventually be able to understand, repair, reproduce, and improve the electronics it depends on — and understand where the matter itself came from.

Not everything must be made or mined in one neighborhood. The important thing is that the knowledge, designs, interfaces, processes, and production path are open enough that communities can progressively take ownership of more layers.

Open source all the way down — from software to silicon to atoms.
