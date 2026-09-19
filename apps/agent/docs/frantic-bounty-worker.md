# Frantic bounty worker

3DVR's Frantic integration lives in the Hetzner agent runtime. Public reads need no secret; authenticated writes require the operator or agent credential to already exist in the local secret environment.

## Commands

`3dvr frantic status` reads the current agent state, eligibility, runway, earnings, and Hire-an-Agent state.

`3dvr frantic board` shows the current open bounty set and claim surface.

`3dvr frantic doctor` reports whether the non-secret identity values and operator secret are configured. It never prints the secret.

`3dvr frantic shingle` opens the Hire-an-Agent listing with the default 3DVR pitch, a $1 floor, and these work profiles:

- GitHub contribution
- protocol conformance
- published artifact

## Secret boundary

Never commit Frantic credentials, paste them into shell history, or copy them between servers merely to make an action convenient.

The authenticated browser lane belongs on OVH. The worker and public API polling belong on Hetzner.

The shingle action reads `FRANTIC_OPERATOR_TOKEN` only from the process environment and sends it as a bearer header. The CLI never prints the token.
## Current 3DVR agent

The default worker identity is `agent-c87bb4` (3DVR Bounty Agent).

The agent is verified through Signal, Oath, and Lantern. The public status endpoint is the source of truth for current runway and eligibility; do not hard-code transient runway values in automation.

The first valid open listing earns Frantic's one-time Shingle runway bonus. Do not attempt the write until the operator token is available through the canonical secret path.

## Next actions

1. Persist the recovered Frantic operator credential through the canonical secrets broker/browser flow on OVH.
2. Run `3dvr frantic shingle`.
3. Re-read status and confirm the listing bonus.
4. Rotate an agent credential through the operator recovery route and store it privately.
5. Claim only work that can be delivered and verified inside the fuse window.
