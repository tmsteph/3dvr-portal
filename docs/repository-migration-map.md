# 3DVR repository migration map

`tmsteph/3dvr-portal` is the canonical monorepo for active 3DVR product, platform, and research work.

This map is intentionally conservative. The goal is not to copy every old repository into Portal. The goal is to preserve useful history while moving the **active continuation** of an idea into one canonical place.

## Decision rule

When evaluating an existing repository:

1. **Already absorbed** — keep the old repository as ancestry/reference and point active development to the Portal path.
2. **Absorb next** — port the smallest useful implementation or documentation into Portal, then convert the old repository into a pointer/reference.
3. **External by design** — keep a separate repository when it closely tracks a large upstream codebase or genuinely needs an independent contributor/release lifecycle.
4. **Legacy** — preserve history, stop parallel development, and point to the current Portal/Core replacement.

Independent deployment, packaging, installation, or release is not by itself a reason to split code out of the monorepo.

## Already absorbed / canonical continuation

| Repository | Canonical continuation | Treatment |
| --- | --- | --- |
| `browser-life` | `life-lab/` | Keep as project ancestry/reference. Life Lab now owns active artificial-life work. |
| `3dvr-digital-organism` | `apps/agent/` + Portal organism surfaces | Keep as public architecture/reference while runtime work stays in Portal. |
| `tommyOS` / DaedalOS lineage | `3dvr-os/` + `apps/computing/` | Keep as Labs/reference; proven ideas graduate into 3DVR OS. |
| Android/device-control experiments | `apps/companion/` + `apps/computing/` | New capability work belongs in Portal. |

## Absorb next

These repositories appear to represent active ideas that fit an existing Portal home better than a separate product line.

| Repository | Proposed Portal home | Next move |
| --- | --- | --- |
| `distributed-os` | `apps/computing/` / `3dvr-os/` | Capture any still-useful architecture, then make the repo a historical pointer. |
| `web-os-tiling` | `3dvr-os/` or a Computing Lab surface | Port useful window-management ideas only; do not create another OS product. |
| `debian-in-browser` | `apps/computing/` / 3DVR OS Labs | Preserve browser-Linux research and integrate only useful vertical slices. |
| `3dvr-mind-os` | Digital Organism / Agent docs | Consolidate concept language into the existing organism architecture. |
| `3dvr-digital-mind` | Digital Organism / Agent docs | Treat as overlapping concept lineage unless unique implementation is found. |
| `3dvr-system` | Portal architecture docs | Fold any unique system-level ideas into the canonical architecture. |
| `3dvr-science` / `3dvr-citizen-science` | Portal Labs | Use as themes/collections rather than separate empty product repos. |
| `natural-computer` | Portal Labs / future hardware area | Preserve the moonshot as research; add experiments here before creating another product surface. |
| `3dvr-keyboard` / `3dvr-laptop` | Portal hardware research | Centralize original 3DVR hardware concepts and link to upstream/reference designs. |

## External by design

Some repositories should remain separate because absorbing their full source would make Portal worse.

| Repository | Why it stays separate | Portal relationship |
| --- | --- | --- |
| `3dvr-browser` | Chromium-scale source tree / upstream-derived browser work | Portal owns product intent, Agent capability contracts, experiments, and integration; browser source can remain external. |
| Balthazar hardware forks such as `Unifying-PCB` and `Balthazar-Keyboard-v.2` | Upstream/open-hardware lineage with its own project history | Reference from Portal hardware work; avoid pretending upstream-derived work is a native Portal codebase. |
| Large upstream forks (`linux`, `OpenROAD`, `XiangShan`, etc.) | Upstream tracking and contribution workflows | Keep contributions upstream-oriented; document 3DVR usage/results in Portal when relevant. |

## Legacy/pointer candidates

Empty or superseded 3DVR repositories should not become active again merely because the name is attractive. Prefer a short README that says where the idea lives now.

Known candidates include:

- `3dvr-app`
- `3dvr-react-app`
- `3dvr-website-build`
- `3DVR-Website`
- `3dvr-mind-os`
- `3dvr-digital-mind`
- `3dvr-system`
- thin framework experiments that no longer contain unique work

## Migration method

Do not bulk-copy repositories just to make the monorepo look complete.

For each migration:

1. Identify what is actually unique and still valuable.
2. Port that smallest useful piece into the appropriate Portal path.
3. Add or extend tests where the migrated piece is executable.
4. Link the new Portal implementation back to its ancestry when useful.
5. Update the old repository README with its status and canonical continuation.
6. Archive only when it is clearly safe; a readable historical repository is often more valuable than deletion.

## Current priority

1. Keep Digital Organism, Agent, Companion, and Computing contracts coherent inside Portal.
2. Continue turning Browser Life into Life Lab rather than developing both copies.
3. Consolidate overlapping OS/browser concepts around `3dvr-os/` and `apps/computing/`.
4. Create a coherent hardware research area before reviving individual hardware product repositories.
5. Convert thin overlapping repos into clear pointers as their useful ideas are verified or migrated.
