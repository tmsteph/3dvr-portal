# 3DVR Production

## Scope
Use this for `3dvr-portal` and `3dvr-web` when production behavior matters.

## Rules
- Verify the live domain after production-impacting changes.
- Keep portal and web branch / environment behavior aligned.
- Treat billing as both code and configuration: check deployment config and Stripe configuration.
- Never mix live Stripe keys with test price ids.

## Default Production Sequence
1. Confirm which repo owns the behavior.
2. Check repo-local `AGENTS.md` before editing.
3. Make the smallest viable change.
4. Run the smallest relevant tests.
5. Deploy intentionally.
6. Verify on the real production URL.
7. Record any lasting operating rule in `DECISIONS.md` or `AGENTS.md`.
