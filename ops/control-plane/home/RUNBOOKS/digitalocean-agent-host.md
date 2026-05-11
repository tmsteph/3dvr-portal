# DigitalOcean Agent Host

Use this runbook for the live `3dvr-agent` droplet.

## Host Details

- Public IPv4: `167.172.193.194`
- Private IP: `10.120.0.3`
- SSH user: `root`
- SSH key: Termux RSA key at `/data/data/com.termux/files/home/.ssh/id_rsa`
- OS: Debian 13
- Agent service: `3dvr-agent.service`
- Agent path: `/opt/3dvr-agent`
- CLI symlink: `/usr/local/bin/3dvr`
- Worker sessions: `3dvr-inbox`, `3dvr-autopilot`, `3dvr-heartbeat`

## What Runs There

The droplet currently runs:

- inbox worker
- outreach worker
- heartbeat writer

The agent writes its heartbeat to Gun under:

- `3dvr-portal/agentOps/<alias>/runtime`

The agent also persists autopilot summaries under:

- `3dvr/ops/autopilot/state`
- `3dvr/ops/autopilot/runs`

## Common Commands

```sh
ssh -i /data/data/com.termux/files/home/.ssh/id_rsa root@167.172.193.194
systemctl status 3dvr-agent.service --no-pager
3dvr agent status
3dvr agent heartbeat
3dvr agent logs
tmux ls
```

## Restart Flow

Use this sequence after updating the agent code:

```sh
ssh -i /data/data/com.termux/files/home/.ssh/id_rsa root@167.172.193.194
cd /opt/3dvr-agent
systemctl restart 3dvr-agent.service
sleep 3
3dvr agent status
```

## Recovery Notes

- Do not overwrite `/root/.3dvr/config/env` unless you intend to update the outbound phone, Gmail app password, or portal auth settings.
- Do not commit runtime logs such as `thomas-agent/outreach-log.ndjson`.
- If `3dvr agent status` shows a stopped worker, check the tmux session first before changing the service file.
- If the portal runtime card is blank, force a fresh heartbeat with `3dvr agent heartbeat` and then refresh `portal.3dvr.tech/admin/`.

## Verification

The host is considered healthy when:

- `systemctl status 3dvr-agent.service --no-pager` is active
- `3dvr agent heartbeat` writes successfully
- `3dvr agent status` shows inbox, outreach, and heartbeat sections
- `portal.3dvr.tech/admin/` shows the live runtime card

