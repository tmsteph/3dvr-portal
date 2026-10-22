# OpenClaw Runtime Map and Messaging Runbook

Last verified: 2026-09-17

This is the canonical source of truth for the 3DVR OpenClaw runtime and its chat transports. Do not infer the active OpenClaw instance from a hostname, a default config directory, or an installed plugin alone.

## Canonical live runtime

| Item | Value |
| --- | --- |
| Host | Hetzner `hetzner-openclaw` / `167.233.174.20` |
| systemd service | `openclaw-cloud.service` |
| OpenClaw profile | `cloud` |
| Live config | `/root/.openclaw-cloud/openclaw.json` |
| Gateway command | `openclaw --profile cloud gateway run ...` |
| Current Telegram bot | `@tmstephOpenClawBot` |
| Current Telegram state | enabled, configured, running, connected, polling |
| Current Discord state | plugin enabled; channel not yet configured or connected |

The active Telegram bot is therefore **not** defined by `/root/.openclaw/openclaw.json`. That path is the separate default profile and must not be treated as production merely because it exists on the same host.

## Profile distinction

- `/root/.openclaw-cloud/` = the production `cloud` profile used by `openclaw-cloud.service`.
- `/root/.openclaw/` = a separate default-profile workspace. It is useful for local/default CLI experiments but is not the Telegram-backed production bot.
- DigitalOcean may contain `/root/.openclaw-cloud/openclaw.json` as fallback or historical state. Presence of a config file does not mean a gateway is running there.
- Always follow the running systemd unit to the profile before inspecting or changing channels.

## Required verification before any OpenClaw change

Run these checks on the intended host before editing configuration:

```sh
hostname
systemctl status openclaw-cloud.service --no-pager -l
systemctl cat openclaw-cloud.service
systemctl show -p MainPID --value openclaw-cloud.service
/root/.openclaw/bin/openclaw --profile cloud channels status --probe
```

The expected production result is a running `openclaw-cloud.service` whose ExecStart includes `--profile cloud`. The channel probe must identify the actual messaging transport before any migration, restart, plugin install, or credential change.

## Messaging migration rule

Treat chat transports as replaceable front ends to the same OpenClaw agent. A migration must preserve the agent, workspace, memory/state, model routing, and service while changing only the channel transport.

For Telegram → Discord:

1. Install/enable the Discord plugin on the **cloud profile**, not the default profile.
2. Configure Discord credentials and access policy without printing tokens into chat, logs, commits, or documentation.
3. Restart `openclaw-cloud.service`.
4. Run `openclaw --profile cloud channels status --probe`.
5. Confirm Discord reports configured, running, connected, and working.
6. Send and receive a real test message.
7. Only after Discord passes those checks, disable Telegram.
8. Probe again and verify Discord remains healthy and Telegram is stopped.

Never disable the currently working transport before the replacement has passed an end-to-end test.

## Current migration state — 2026-09-17

Discord support was installed into the production `cloud` profile and `openclaw-cloud.service` was restarted successfully. The live probe then reported:

- Discord: enabled, **not configured**, stopped/disconnected.
- Telegram: enabled, configured, running, connected, polling, bot `@tmstephOpenClawBot`, working.

Telegram therefore remains intentionally enabled until Discord is authenticated and verified.

During the investigation, Discord was initially installed into the separate default profile under `/root/.openclaw/`. That did not migrate the production bot, so the accidental default-profile Discord install was removed after the production `cloud` profile was corrected. This incident is the reason this runbook exists: **profile identity must be proven from the running service before changing OpenClaw.**

## Secrets and identity

Never commit bot tokens, gateway tokens, refresh tokens, API keys, or private keys. Documentation may record the bot username, host role, profile name, config path, service name, and non-secret operational state.

If credentials are missing, recover them from the approved secrets path or authenticated service setup. Do not copy a token into a shell history, issue, chat message, Git repository, or diagnostic output.

## Fast decision tree

If a future session asks “where is our OpenClaw?”:

1. Start with Hetzner `hetzner-openclaw`.
2. Inspect `openclaw-cloud.service`.
3. Follow its `--profile` argument.
4. Probe channels using that exact profile.
5. Treat any other OpenClaw directory/config as non-canonical until a running service proves otherwise.

If the service or host role changes, update this document and `docs/infrastructure-topology.md` in the same change.

## Helm integration and recovery — 2026-10-22

The Hetzner `cloud` gateway returned HTTP 200 and the channel probe reported
Telegram connected/working after the earlier controlled restart. This does not
prove an agent turn completed. `TasksCurrent` reached `TasksMax=160`, later 147;
root disk was 90% full. Native Codex children contributed substantial thread
usage. Preserve task and memory admission controls while diagnosing this.

The existing gateway now has
`gateway.http.endpoints.chatCompletions.enabled=true`, with a server-local
configuration backup. Binding remains loopback and auth remains token-based; an
unauthenticated chat POST returned 401. Never expose port 18789 publicly for Helm.

Helm's Portal source lives at `helm/` and `src/openclaw/`; see
[`helm/README.md`](../helm/README.md) for deployment prerequisites and prototype
limits. Publication and live Portal-to-OpenClaw verification are still pending.
The authenticated smoke check in private terminal-bridge issue #692 was initially
deferred by memory admission, then ran and timed out after 85 seconds without a
model reply. OVH → Hetzner SSH passed. Full chat recovery remains unverified.
