# Four Roads to an Open Computer

*What Sipeed, StarFive, BeagleBoard, and LattePanda teach us about building computers that people can understand, repair, modify, and eventually manufacture themselves.*

September 17, 2026

The dream of an open computer often gets framed as an all-or-nothing problem: either every transistor, firmware blob, board file, driver, operating system, and enclosure is open, or the machine is not truly open.

That standard is useful as a destination. It is not a very useful place to start.

A practical path looks more like a ladder. At each layer, we can choose something more understandable, more replaceable, more documented, and more community-controlled than what came before. Four organizations illustrate different parts of that ladder unusually well: Sipeed, StarFive, BeagleBoard.org, and LattePanda.

None of them is the complete answer. Together, however, they sketch a surprisingly coherent blueprint.

## Sipeed: turn emerging silicon into something you can touch

Sipeed's value is not simply that it sells inexpensive development boards. Its more interesting habit is taking processors that are still unfamiliar to much of the computing world and turning them into usable hardware quickly.

The LicheePi 4A is a good example. It uses the T-Head TH1520, a 64-bit RISC-V application processor with four C910 cores, graphics, video hardware, and an NPU. More important for system design, the board is built around the removable Lichee Module 4A. The difficult processor, memory, and storage work can live on the module while different carrier boards expose the interfaces a product needs. Sipeed publishes schematics, a bill of materials, dimensional drawings, and a 3D model for the LicheePi 4A. [Sipeed's documentation](https://wiki.sipeed.com/hardware/en/lichee/th1520/lpi4a/1_intro.html) also makes clear that this is still an early RISC-V platform rather than a frictionless consumer PC.

That combination matters. Emerging architectures do not become useful merely because a processor exists. Someone has to turn the processor into boards, modules, laptops, handheld terminals, clusters, documentation, and a developer community.

For an open-computing project, the lesson is simple: **ship learning platforms early, and make the compute core reusable.**

## StarFive: go one layer deeper

StarFive represents a different layer of the stack. It develops RISC-V CPU IP, interconnect technology, processors, and development systems. Its current portfolio includes CPU cores in the Dubhe family, NoC technology, the JH-7110 application processor, MCUs, and data-center-oriented silicon. [StarFive's current product map](https://www.starfivetech.com/en/) shows a company trying to build much more than a single-board computer.

The VisionFive 2 is the part most hackers encounter first. It uses StarFive's JH-7110, a quad-core 64-bit RISC-V application processor with an integrated GPU and a broad embedded I/O set. [StarFive documents](https://www.starfivetech.com/en/index.php?c=show&id=14&s=hardware) the board as both a developer platform and a path into commercial embedded products.

This is where the open-computer journey eventually has to go. Carrier boards and modular systems are powerful, but somebody still defines the CPU, interconnect, memory subsystem, accelerators, and SoC architecture underneath them.

The immediate lesson is not that every small hardware project should start designing a CPU. It is that **the silicon layer should remain visible as a future frontier rather than becoming a permanent black box.** Development boards such as VisionFive let software, Linux support, drivers, and developer knowledge grow while the silicon ecosystem matures.

## BeagleBoard.org: openness is an institution, not just a license

BeagleBoard.org offers perhaps the most important cultural lesson.

The BeagleBoard.org Foundation is a U.S. 501(c)(3) nonprofit created around education and collaboration in open-source software and hardware for embedded computing. The foundation says its designs are fully open-source and that the components and design materials are available for others to manufacture compatible hardware. [Its mission page](https://www.beagleboard.org/about) is explicit about community participation, education, documentation, and reproducibility.

That is a different idea from merely publishing a PDF schematic after a product ships.

Open hardware needs institutions that help people understand the design, reproduce it, teach with it, modify it, build accessories for it, manufacture compatible versions, and contribute improvements upstream. BeagleBoard's long history with Linux, embedded systems, community support, and education demonstrates how much infrastructure surrounds a genuinely open board.

The lesson is that **the community is part of the hardware architecture.**

A computer that can technically be copied but is impossible for normal developers to understand is only partially open. Documentation, governance, contribution paths, educational material, long-lived repositories, and accessible development tools are all part of making a machine meaningfully inspectable.

## LattePanda: separate the computer from the motherboard

LattePanda approaches the problem from the familiar x86 PC world rather than RISC-V.

That makes it particularly useful.

The LattePanda Mu packages Intel processors, memory, and storage into a compact compute module and leaves the surrounding system to a carrier board. Current Mu modules include Intel N100 and N305 configurations, while the newer Mu Ultra family moves into Core Ultra processors. [LattePanda's Mu documentation](https://docs.lattepanda.com/content/mu_edition/) provides carrier-board design guidance for interfaces such as power, USB, HDMI, PCIe, and SATA.

Even better, LattePanda's [Lite Carrier](https://docs.lattepanda.com/content/mu_edition/lite_carrier/) is fully open-source and designed in KiCad, with the design files available for modification.

This suggests a powerful architectural rule: **the life of the computer should be longer than the life of its processor.**

A laptop chassis, keyboard, display, battery system, speakers, storage, ports, cooling, and repairable mechanical structure should not have to become waste merely because a new CPU arrives. If the compute subsystem is modular and the carrier interface is documented, the surrounding machine can evolve much more slowly.

RISC-V may be the more philosophically open long-term ISA, but an x86 compute module can still be useful while prototyping the rest of an open laptop. Openness does not require refusing useful transitional technology. It requires keeping the boundaries clear enough that the transitional part can eventually be replaced.

## Four companies, four layers

Put the four organizations next to one another and a larger pattern appears.

**StarFive shows the silicon path.** Learn CPU cores, interconnects, SoCs, reference platforms, and the software required to make new silicon useful.

**Sipeed shows the productization path.** Take emerging silicon and rapidly turn it into modules, boards, laptops, handhelds, and developer tools.

**BeagleBoard shows the community path.** Treat documentation, reproducibility, education, governance, and compatible manufacturing as fundamental parts of an open system.

**LattePanda shows the modular-PC path.** Put the most difficult compute subsystem on a replaceable module and keep the surrounding machine customizable through an open carrier.

The most interesting open computer may combine all four ideas.

## A practical roadmap instead of a purity test

For 3DVR, that suggests a sequence that is much more achievable than trying to manufacture a CPU immediately.

Start with real machines. Use RISC-V boards such as the LicheePi 4A and VisionFive as Linux systems, servers, build nodes, and experimental desktops. Document what breaks. Improve Debian and upstream Linux where possible. Learn how boot firmware, device trees, graphics, networking, AI accelerators, and power management actually behave on emerging hardware.

Then study the boards themselves. Read schematics and bills of materials. Trace power rails. Identify Ethernet PHYs, radios, regulators, storage, connectors, and firmware dependencies. Compare Sipeed's modular LM4A approach with StarFive reference designs, BeagleBoard hardware releases, and LattePanda carrier files.

Next, define a reusable carrier contract. The computer should describe what it needs from a compute module—power, display, USB, storage, networking, thermals, mounting, and optional high-speed expansion—without assuming one processor forever.

That carrier can become the bridge into a modular laptop or desktop. Existing work such as the Balthazar open laptop provides a useful chassis-and-repair philosophy. Different compute modules can then be adapted into the same broader machine instead of forcing the entire product to restart every time the processor changes.

Only after enough experience accumulates does it make sense to move deeper: FPGA-based RISC-V cores, open accelerators, interconnect experiments, and eventually more of the SoC itself.

## Open source all the way down—one layer at a time

The long-term vision can still be radical.

A community should be able to understand the machine it depends on. It should be able to repair it, modify it, manufacture replacement parts, improve its software, audit its dependencies, and gradually replace components that remain closed or fragile.

But that future will probably not arrive as one perfect computer descending fully formed from a fabrication plant.

It can be assembled progressively.

Use today's open board to understand tomorrow's carrier. Use today's carrier to build tomorrow's modular laptop. Use today's RISC-V development system to learn enough to design tomorrow's FPGA core. Use each imperfect but inspectable layer as scaffolding for the next one.

That may be the most important lesson these four organizations share.

**Do not wait for the perfectly open computer. Build toward it.**

## Primary references

- Sipeed, LicheePi 4A board documentation: https://wiki.sipeed.com/hardware/en/lichee/th1520/lpi4a/1_intro.html
- Sipeed, Lichee Module 4A documentation: https://wiki.sipeed.com/hardware/en/lichee/th1520/lm4a.html
- StarFive product and IP overview: https://www.starfivetech.com/en/
- StarFive VisionFive 2 / JH-7110 overview: https://www.starfivetech.com/en/index.php?c=show&id=14&s=hardware
- BeagleBoard.org mission and organizational model: https://www.beagleboard.org/about
- LattePanda Mu documentation: https://docs.lattepanda.com/content/mu_edition/
- LattePanda Mu Lite Carrier open-source design documentation: https://docs.lattepanda.com/content/mu_edition/lite_carrier/
