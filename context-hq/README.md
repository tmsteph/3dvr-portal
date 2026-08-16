# Context HQ Portal Cockpit

`/context-hq/` is the admin-authenticated human view of the persisted founder Context HQ state.

It reads:

- `3dvr-portal/agentOps/3dvr.tech@gmail.com/contextHQ/latestSweep`
- `3dvr-portal/agentOps/3dvr.tech@gmail.com/contextHQ/latestSession`

The page intentionally renders stored sweep markdown as text rather than HTML so durable agent output cannot inject markup into the admin surface.

The managed execution queue remains separate at owner `3dvr-managed`. The Context HQ workflow reads that queue, mirrors safe completion metadata into founder handoffs, and persists the full morning sweep under the founder context owner.
