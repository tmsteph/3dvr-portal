# Bill of Materials — V0 Working Draft

This BOM begins with **categories and selection rules**, not prematurely locked products. The first sourcing pass should fill in exact part numbers, alternates, prices, and links.

| Item | Qty | V0 requirement | Candidate / status |
|---|---:|---|---|
| Key switches | TBD | Common, replaceable, easy to source | Open |
| Keycaps | TBD | Standard stem/profile where possible | Open |
| Microcontroller | 1–2 | Inexpensive, documented, open-firmware friendly | Open |
| Diodes | 1 per key if matrix requires | Commodity through-hole/SMD | Open |
| Interconnect | 1 | Replaceable, robust, no fragile proprietary connector | Open |
| USB cable/connector | 1 | Replaceable, common standard | Open |
| Wiring or PCB | 2 halves | Hand-wire or existing open PCB for V0 | Compare |
| Case | 2 halves | Printable / easy local fabrication | Design needed |
| Fasteners | TBD | Standard metric sizes preferred | Open |
| Feet / tenting | Optional | Modular rather than integrated | Later |

## Selection rules

Prefer parts that are:

1. available from multiple suppliers;
2. documented well enough to substitute;
3. repairable without specialized equipment;
4. usable without proprietary cloud services;
5. available in small quantities;
6. inexpensive enough for community workshops;
7. unlikely to disappear immediately.

## Cost targets

Initial target is not yet fixed. Record three totals once candidate parts are selected:

- **bare minimum build** — lowest reasonable cost;
- **recommended build** — best balance of durability and price;
- **community batch (10 units)** — expected pooled-order cost.

## Sourcing notes

For every locked part, record:

- manufacturer + exact part number;
- at least one alternate;
- unit price and date checked;
- minimum order quantity;
- supplier region;
- lead time if meaningful;
- whether the design can tolerate substitution.

The BOM itself is part of the open hardware design and should be kept current.
