# 3dvr-agent Pre-Release Draft

Candidate: `1.0.1-beta.1`

Prepared against portal cadence:
- Portal release hub follows weekly milestones.
- Latest portal release index: `v0.0.41` for the week of April 13, 2026.

## Summary

This release strengthens autonomous outreach and lead discovery for the 3dvr sales workflow.

## Highlights

- Local outbound drafting now prefers the on-device Qwen/llama stack.
- Outreach sending only marks a lead contacted after a successful send.
- Crawl can fall back from Overpass to web search seeding when map queries fail.
- Menu parsing is hardened against shell interpretation.
- Automatic lead-page opening is skipped by default when the page is unreliable.

## Verification

- `npm test`

## Release Notes

Use this draft when tagging the next agent pre-release or syncing it into the portal release hub as a staged rollout.
