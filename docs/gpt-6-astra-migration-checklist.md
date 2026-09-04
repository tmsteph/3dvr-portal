# GPT-6 Astra migration checklist

This checklist turns the readiness plan into a small, reversible implementation sequence.

- [ ] Replace GPT-5-name checks that suppress `temperature` with a capability-oriented helper that also covers GPT-6 Astra and future reasoning models.
- [ ] Add regression tests proving `gpt-6-astra` requests omit unsupported sampling parameters.
- [ ] Add `gpt-6-astra` to curated Site Builder, Guide, and Forge choices as an opt-in model.
- [ ] Keep existing production defaults unchanged during rollout.
- [ ] Add server configuration for the frontier model / approved model set so a later promotion does not require business-logic edits.
- [ ] Verify Money Printer reasoning requests omit unsupported sampling parameters when configured for Astra.
- [ ] Run focused API tests, then the normal test suite.
- [ ] Canary Astra for Thomas-only high-value tasks before any global default change.
- [ ] Record success, tool reliability, latency, retries, and cost during the canary.
- [ ] Promote by task class only when eval evidence beats the existing route.

Official migration guidance checked September 3, 2026: use `gpt-6-astra` with the Responses API, use `reasoning.effort`, and remove `temperature`, `top_p`, and `top_logprobs` for Astra.
