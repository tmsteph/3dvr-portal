# Active Learning Lab — Experiment 001

## Hypothesis
Selecting informative examples yields better accuracy per token than selecting random examples.

## Controls
Use the same base model, prompt budget, evaluation set, and inference settings for both arms. Never include evaluation examples in the selection pool.

## Protocol
1. Collect 100–500 labeled examples of a narrow task (e.g. classifying support requests).
2. Split by source into train pool (70%), validation (15%), and locked test (15%).
3. Start both arms with the same 10 examples.
4. Random arm: sample 10 additional examples per round using a seeded RNG.
5. Active arm: score unseen examples for uncertainty and diversity; select 10, have a human verify their labels.
6. Run both arms on the same locked test after each round, using in-context examples or identical fine-tuning configurations.
7. Log accuracy, calibration, total tokens, latency, and estimated energy if measurable.
8. Repeat with at least five seeds. Report uncertainty intervals and failure cases.

## Stop / success criteria
The active arm wins only if it achieves a meaningful accuracy improvement at the same token budget, or reaches the same accuracy using fewer tokens, across repeated runs. Record negative results.

## Implementation checklist
- [ ] Dataset manifest with provenance, licensing, and privacy checks
- [ ] Seeded split and leakage detection
- [ ] Baseline evaluator
- [ ] Uncertainty + diversity selector
- [ ] Results dashboard in Operator
- [ ] Human approval before adding external data or updating deployed models

## Architecture
Dataset -> split -> selector (random / active) -> context or training -> evaluator -> metrics -> next round.

This is a proposed experiment, not evidence of autonomous weight updates or self-improvement. Keep experiments on owned infrastructure and do not modify production models automatically.
