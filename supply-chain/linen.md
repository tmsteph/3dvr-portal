# Open Linen Supply Chain

3DVR Linen should be reproducible from field to finished garment. The goal is not to own every stage. The goal is to make the chain legible, auditable, forkable, and gradually more local.

## North-star chain

Flax seed → farm → harvest → retting → scutching → hackling → fibre grading → spinning → yarn → weaving/knitting → fabric finishing → cutting → sewing → repair → reuse → fibre recovery.

Every stage should have at least one documented supplier or process, an open specification for what enters and leaves the stage, quality tests, price/range information when public, geography, certifications/claims, and known alternatives.

## Start with a minimum viable chain

1. **Fibre origin:** Prefer traceable flax with verifiable country/region and grower or processor where available.
2. **Yarn:** Document count, twist, wet/dry spinning, composition, source fibre, minimum order, and supplier.
3. **Fabric:** Record weave/knit, GSM, width, finishing, dye/bleach chemistry when known, shrinkage, hand, strength, and price.
4. **Garment:** Publish pattern, seam construction, thread, notions, cutting layout, labor time, and repair instructions.
5. **End of life:** Design for repair first, then reuse, patching, remanufacture, and fibre recovery.

## Open Supply Record — linen extension

For each lot or material, record:

- `id`
- `stage`
- `material`
- `supplier`
- `facility`
- `country`
- `source_lot`
- `composition`
- `specification`
- `certifications`
- `processes`
- `chemistry_known`
- `minimum_order`
- `price_public`
- `lead_time`
- `evidence`
- `repair_or_reuse_path`
- `open_alternative`
- `notes`

Use plain JSON/YAML/CSV first. No blockchain is required. Cryptographic signatures or an append-only ledger can be added later if they solve a real trust problem.

## Existing infrastructure we should build on

- **Alliance for European Flax-Linen & Hemp:** Masters of FLAX FIBRE™ covers European-origin flax fibre and chain-of-custody traceability; Masters of LINEN™ covers European spinning, weaving and knitting. Their current program is moving toward stronger digital traceability.
- **Open Supply Hub:** use its open facility IDs and global supply-chain map when a farm, processor, mill, factory, or sewing facility is represented there instead of inventing another identity system.
- **Independent standards:** record certifications such as GOTS when actually held, but keep the 3DVR record factual and usable even when a supplier has no certification.

## First 3DVR product path

Start with the simplest thing we already know how to make: repairable linen clothing.

**Reference product:** drawstring work pants or robe.

Target specification:

- 100% flax linen where practical
- no elastic required
- mechanically simple closures
- linen thread preferred where it performs adequately
- generous seam allowance for repair and alteration
- pattern published openly
- fabric supplier and lot documented
- wash/shrink test documented
- real-world wear and repair notes fed back into the specification

## Supplier research queue

For each category, find at least three candidates so the project never depends on one vendor:

- flax fibre / scutching mills
- linen spinners
- weavers
- undyed natural-finish fabric
- dyed black fabric suitable for AV work
- linen sewing thread
- small-batch cut-and-sew partners
- San Diego / Baja sewing and repair partners
- fibre recycling / textile reuse partners

## Governance

Supplier facts are data, not endorsements. Keep evidence links and dates. Mark unknowns rather than guessing. Separate spiritual or subjective claims about linen from measurable supply-chain data.

Community contributors can propose new suppliers, corrections, test results, substitutions, and regional forks. The best chain is the one another person can actually reproduce.

## Milestone 0.1

A complete, purchasable chain for one pair of 3DVR linen work pants: traceable fabric → thread/notions → open pattern → local or documented sewing → repair guide → published cost breakdown.
