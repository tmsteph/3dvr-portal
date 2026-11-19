# Host agent — slice 0 (metering)

The program a future Community Cloud host would run. This slice only
**measures**. It is the trust foundation for everything else in the
[design](../docs/DESIGN.md): payouts later are computed from numbers
like the ones this agent produces.

## Run it

Needs Node.js v18 or newer. No dependencies, nothing to install.

```bash
# run and sample once a minute (defaults: ./share, 1 GB offered)
node agent.js

# with a config file
node agent.js --config ./host-agent-config.json

# print the metering report (JSON) from the state file
node agent.js --report
node agent.js --report --config ./host-agent-config.json

# run the built-in pipeline check against a temp dir
node agent.js --self-test
```

Example config:

```json
{
  "shareDir": "/srv/community-cloud-share",
  "offeredBytes": 50000000000,
  "stateFile": "/var/lib/3dvr/host-agent-state.json",
  "sampleIntervalMs": 60000,
  "interfaces": ["eth0"]
}
```

`interfaces` is optional. Leave it out (or null) to count all
non-loopback interfaces.

## What it measures

One sample per minute, kept in a JSON state file:

- **Storage offered**: the bytes in the config (what the host commits).
- **Storage stored**: bytes physically present in the share directory,
  counted recursively. This is what would earn real credit later.
- **Filesystem room**: total and free bytes of the share directory's
  filesystem, so "offered" can be checked against reality.
- **Bandwidth**: bytes in/out deltas from `/proc/net/dev` (Linux)
  between samples. On platforms without those counters, the fields
  stay null instead of pretending.
- **Uptime**: how long the agent process has been running.

From the samples it computes **hourly and daily rolling averages** of
storage offered, storage stored, and bandwidth rate. Averages are the
point: payouts will follow sustained contribution, not spikes.

## How to run the tests

```bash
node agent.js --self-test
```

The self-test runs the whole measurement pipeline against a temporary
directory seeded with a known number of bytes, for a few seconds. It
asserts the report structure is complete, stored-byte averages match
the seeded data exactly, and every measured value is non-negative. It
prints PASS/FAIL per check and exits non-zero on any failure.

## What it deliberately does NOT do yet

- No networking. The agent talks to nobody.
- No uploads or downloads. Nothing enters or leaves the share dir
  except what you put there yourself.
- No accounts, no identity keys, no signed receipts (slice 2/4 work).
- No payouts, no token, no wallet. "Tommycoin" is a placeholder name
  in the design doc, not a thing that exists.
- Bandwidth is whole-machine counters, not yet attributable to agent
  traffic alone. That distinction is called out in every report.
