# Open Food Supply Chain

Food is a parallel Open Supply Chain project beside linen and computing.

The goal is not to make every household fully self-sufficient. The goal is to make local food production easier to start, easier to understand, easier to share, and progressively more resilient.

## North-star loop

Seed → soil / growing medium → water → nutrients / compost → planting → care → harvest → eat / share / preserve → scraps → compost → seed saving where practical → next season.

Every stage should be understandable enough that a household or community group can reproduce it with locally available substitutes.

## Relationship to the Community Farming Network

The Community Farming Network is the people-and-coordination layer:

- Who has growing space.
- Who needs food.
- Who has surplus harvest.
- Who has seed, compost, tools, time, transport, or knowledge.
- Who can help another person start or maintain a garden.

This file is the physical supply-chain layer:

- What inputs are needed.
- Where they come from.
- Which inputs can be produced locally.
- Which alternatives are safe and practical.
- What each growing method costs.
- What can be repaired, reused, composted, saved, or shared.

Canonical community plan: `../docs/community-farming-network-plan.md`.

## Start with home gardens

Support four beginner profiles:

1. Window or indoor containers.
2. Balcony or patio containers.
3. Yard or raised bed.
4. Community garden plot.

For each profile, publish small regional starter recipes rather than giant gardening manuals.

A starter recipe should record:

- Region / climate assumptions.
- Season.
- Sunlight requirement.
- Space requirement.
- Container or bed specification.
- Seed or seedling requirements.
- Growing medium.
- Compost / nutrient assumptions.
- Water requirements.
- Basic tools.
- Planting date range.
- Estimated harvest window.
- Common failure modes.
- Food safety notes where relevant.
- Expected reusable inputs.
- Expected compostable outputs.
- Local substitutions.
- Approximate cost.

## Open Food Supply Record

For seeds, soil inputs, tools, growing systems, preserved foods, or other material records, use fields such as:

- `id`
- `category`
- `material_or_crop`
- `variety`
- `supplier`
- `producer`
- `region`
- `source`
- `season`
- `specification`
- `organic_or_other_certification`
- `chemistry_or_treatment_known`
- `minimum_order`
- `price_public`
- `lead_time`
- `storage_requirements`
- `shelf_life`
- `reuse_path`
- `compost_path`
- `seed_saving_notes`
- `local_alternative`
- `evidence`
- `notes`

Use plain JSON, YAML, or CSV first. Do not require a blockchain.

## Food sharing

The system should make surplus easy to route locally rather than wasting it.

Useful listing types include:

- Fresh harvest.
- Seedlings.
- Seeds.
- Preserved food.
- Compost.
- Mulch.
- Growing space.
- Containers.
- Tools.
- Garden labor.
- Watering help.
- Harvest help.
- Delivery.
- Teaching.

Listings should support gifting, direct swaps, and optional community credits.

## Community credits

Credits belong to the coordination layer, not the physical supply-chain record, but they can help close loops when direct barter is awkward.

Credits should begin as simple mutual-credit accounting for completed useful contributions such as food, seedlings, seed, compost, labor, tool lending, teaching, delivery, preservation, or growing space.

Version 0.1 should remain intentionally boring:

- Optional.
- No interest.
- No investment promise.
- No required cash value.
- No automatic cash redemption.
- No speculative trading.
- No blockchain dependency.
- Every transaction tied to a real contribution or an explicit community grant.
- Reasonable balance limits.

Gifts and direct swaps remain first-class even if credits exist.

## First pilot

Run a tiny reproducible loop with a few households or friends:

1. Pick three easy crops appropriate to the participants' region and season.
2. Publish the starter recipe.
3. Record seed, soil, compost, water, container, and tool inputs.
4. Track basic planting and harvest results.
5. Keep what each household needs.
6. List any surplus on the Community Farming Network.
7. Gift, swap, or optionally credit completed exchanges.
8. Compost usable scraps and save seed where practical.
9. Publish the results and improve the recipe.

The important metric is not app engagement. It is how much useful food, knowledge, material, and trust moved through the loop.

## Milestone 0.1

A beginner can open the portal, choose their growing situation, receive a tiny regional garden plan, grow at least one useful crop, and route surplus into the Community Farming Network without needing prior gardening knowledge.
