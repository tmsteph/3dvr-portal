# 3DVR Next Build Plan

This is the current small-agent execution plan for 3DVR. Keep each task narrow, preserve the existing Gun SEA identity path, and avoid adding new Vercel API routes unless the route budget has been checked first.

Primary rule: sell first, build second, keep the system operable.

## Current State

3DVR is moving from separate pages and scripts into a browser-first personal operating layer:

```text
portal.3dvr.tech
  -> Gun SEA identity
  -> Gun realtime graph
  -> limited Vercel serverless API
  -> DigitalOcean agent host
  -> 3dvr-agent workers
```

What is already done:

- `3dvr-agent` runs on the DigitalOcean droplet at `167.172.193.194`.
- The agent service starts inbox, outreach, and heartbeat workers.
- The agent writes runtime heartbeats to Gun under `3dvr-portal/agentOps/<alias>/runtime`.
- The portal admin panel has an Agent Operations surface with host settings, copyable server commands, and a runtime card.
- `/api/session` is the single consolidated Vercel endpoint for health, session, and device hints.
- Meeting pages now include smart join, ops packs, meshcast preset, loopback tests, and meeting-note video packs.

Known constraints:

- Vercel free tier route count is tight. Prefer extending `/api/session` or Gun-backed flows over adding endpoint files.
- Auth already exists through Gun SEA. Do not introduce a second auth system without a migration card.
- The DigitalOcean server is reachable as `root@167.172.193.194` using the Termux RSA key.
- Do not commit runtime logs such as `thomas-agent/outreach-log.ndjson`.

## Immediate Objective

Make the agent controllable from the portal and useful for real operations.

Success means an admin can open `portal.3dvr.tech/admin/`, see whether the DigitalOcean agent is alive, inspect recent outreach/reply/failure state, and run or copy the next operational command without SSH guesswork.

## Work Packets

Each packet is designed for one smaller agent. Do not combine packets unless explicitly assigned.

### Packet A: Verify Live Portal Runtime Card

Repo: `3dvr-portal`

Goal: prove the admin page reads the Gun heartbeat written by the droplet.

Files likely involved:

- `admin/index.html`
- `tests/admin-agent-ops.test.js`

Steps:

1. Open or inspect the live admin page after deploy.
2. Confirm the runtime card has fields for host, status, last beat, inbox worker, outreach worker, and process info.
3. If live production does not show the card, check branch/deploy source before changing code.
4. Add auto-refresh only if the Gun subscription is not updating reliably.

Acceptance:

- Admin page shows a non-empty last heartbeat after `3dvr agent heartbeat` runs on the droplet.
- Existing `admin-agent-ops` tests pass.
- No new Vercel API route files are added.

Suggested verification:

```sh
node --test tests/admin-agent-ops.test.js
ssh -i /data/data/com.termux/files/home/.ssh/id_rsa root@167.172.193.194 '3dvr agent heartbeat'
```

### Packet B: Agent Runtime Summary

Repo: `3dvr-agent`

Goal: make `3dvr status` and `3dvr agent status` include useful runtime details, not just tmux session existence.

Files likely involved:

- `thomas-agent/node/agent-heartbeat.js`
- `thomas-agent/scripts/3dvr`
- `thomas-agent/scripts/ask-agent-heartbeat`
- `test/agent-heartbeat.test.js`
- `test/cli.test.js`

Steps:

1. Read the latest heartbeat from Gun in status mode.
2. Print owner, host, service state, last beat, inbox state, outreach state, and heartbeat session state.
3. Keep one-shot commands exiting cleanly even though Gun opens sockets.
4. Preserve `tmux` fallback behavior.

Acceptance:

- `3dvr agent heartbeat` writes a heartbeat and exits.
- `3dvr agent status` shows worker status and last heartbeat.
- Tests cover running and degraded heartbeat states.

Suggested verification:

```sh
node --test test/agent-heartbeat.test.js test/cli.test.js
bash -n thomas-agent/scripts/3dvr thomas-agent/scripts/ask-agent-heartbeat thomas-agent/scripts/ask-agent-heartbeat-daemon
```

### Packet C: Recent Runs Panel

Repo: `3dvr-portal`

Goal: show recent agent activity in the admin panel from existing Gun/log state.

Files likely involved:

- `admin/index.html`
- `tests/admin-agent-ops.test.js`

Data sources to inspect before editing:

- Gun node paths used by `3dvr-agent` in `thomas-agent/node/gun-db.js`
- `3dvr-portal/agentOps/<alias>/runtime`
- `3dvr` CRM/outreach paths already used by the agent

Steps:

1. Add a compact Recent Runs area below the runtime card.
2. Show last lead processed, last send/form result, last failure, and last inbox check if data exists.
3. If no remote data exists yet, show a real empty state.
4. Do not invent local-only browser data as the source of truth.

Acceptance:

- Admin panel renders recent runtime/activity without layout shift.
- Tests assert the Recent Runs structure exists.
- No secrets, message bodies, or raw email credentials are rendered.

### Packet D: Droplet Install Runbook

Repo: `3dvr-portal`

Goal: document the real DigitalOcean setup so another agent can rebuild it.

Files likely involved:

- `ops/control-plane/home/RUNBOOKS/digitalocean-agent-host.md`
- `ops/control-plane/home/RUNBOOKS/README.md`

Facts to include:

- Host: `167.172.193.194`
- User: `root`
- Agent path: `/opt/3dvr-agent`
- CLI symlink: `/usr/local/bin/3dvr`
- Service: `3dvr-agent.service`
- Worker sessions: `3dvr-inbox`, `3dvr-autopilot`, `3dvr-heartbeat`
- Config path: `/root/.3dvr/config/env`

Acceptance:

- A new agent can SSH in, check service health, restart the service, view logs, and force a heartbeat using the doc.
- The doc does not expose secrets or app passwords.

Suggested commands to document:

```sh
ssh -i /data/data/com.termux/files/home/.ssh/id_rsa root@167.172.193.194
systemctl status 3dvr-agent.service --no-pager
3dvr agent status
3dvr agent heartbeat
journalctl -u 3dvr-agent.service -n 80 --no-pager
tmux ls
```

### Packet E: Meeting System Smoke Test

Repo: `3dvr-portal`

Goal: verify the current meeting system still works as links and pages, especially after deployment.

Files likely involved:

- `portal.3dvr.tech/video/join.html`
- `portal.3dvr.tech/video/meshcast.html`
- `portal.3dvr.tech/video/ops.html`
- `portal.3dvr.tech/video/smart-launcher.html`
- `meeting-notes/index.html`
- `meeting-notes/meeting.html`

Steps:

1. Verify every page exists in source and on live production.
2. Confirm `meshcast.html` uses the working VDO.Ninja preset without `utm_source`.
3. Confirm `join.html` can recommend a profile from device/network hints.
4. Confirm meeting notes generate host, guest, fallback, and ops links.

Acceptance:

- Relevant tests pass.
- Live URLs return 200 after deployment.
- The generated VDO.Ninja links are clean and do not include tracking parameters.

Suggested verification:

```sh
node --test tests/video-meshcast.test.js tests/video-smart-join.test.js tests/video-ops.test.js tests/smart-launcher.test.js tests/meeting-notes-video-pack.test.js
```

### Packet F: Outreach Quality Loop

Repo: `3dvr-agent`

Goal: keep real outreach useful while the platform work continues.

Files likely involved:

- `thomas-agent/scripts/ask-next`
- `thomas-agent/scripts/ask-send`
- `thomas-agent/scripts/ask-form`
- `thomas-agent/scripts/ask-track`
- `thomas-agent/node/outreach-log.js`
- `thomas-agent/node/inbox-monitor.js`

Steps:

1. Run a small batch of real leads from the server or Termux.
2. Review sent/form messages for tone and contact footer.
3. Check `ask-track failures`.
4. Check inbox triage for replies and delivery failures.
5. Patch only the failure class actually observed.

Acceptance:

- New sends/forms are logged.
- Failures are categorized.
- Replies are visible through inbox triage.
- No duplicate outreach is sent to the same lead unless intentionally marked as follow-up.

Suggested verification:

```sh
3dvr next
ask-track failures
3dvr inbox check
```

## Priority Order

1. Packet A: verify portal runtime card live.
2. Packet B: improve agent status output if needed.
3. Packet D: write the droplet runbook.
4. Packet C: show recent runs in the portal.
5. Packet F: continue outreach quality checks.
6. Packet E: smoke-test meeting links before the next live meeting.

## Rules For Smaller Agents

- Start by naming the packet you are working on.
- State the repo and files before editing.
- Use the repo's existing Gun SEA and `/api/session` patterns.
- Do not add a new API endpoint file unless the task explicitly requires it.
- Do not touch billing, Stripe, or auth migration code unless assigned.
- Do not commit runtime logs, local env files, OAuth files, or app passwords.
- Run the smallest relevant test set.
- If production behavior matters, verify the live URL or server command.
- Final response must include files changed, tests run, and remaining risk.
