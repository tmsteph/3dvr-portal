# Open Remote Runner

3DVR Open Remote Runner is a tiny, self-hosted remote-command bridge for machines we control. It polls a **private GitHub repository** for command issues, executes approved commands on a server, posts the result back to the issue, and closes it.

The runner itself is open source and does not depend on a proprietary remote-desktop subscription or per-tool-call quota. GitHub is only the current queue transport; the executor can later be paired with another open queue, MCP client, Portal UI, or local peer-to-peer transport. GitHub API limits still apply to the GitHub transport.

## Current status — 2026-09-16

The open runner is **deployed and verified** on the Hetzner worker.

- systemd service: `3dvr-open-runner.service`
- canonical source: `apps/agent/tools/github-open-runner.py`
- queue: private `tmsteph/3dvr-terminal-bridge` repository
- current device id: `hetzner`
- allowed author: `tmsteph`
- normal poll interval: 20 seconds
- Hetzner can reach both `3dvr-ovh` and `3dvr-do` over the SSH mesh

A smoke test submitted through the ChatGPT GitHub connector was claimed by the Hetzner runner, executed there, reported its output back to the issue, and closed automatically. A second command submitted through the same independent route verified that Hetzner could SSH into both OVH and DigitalOcean.

This means Remote Desktop Commander is no longer a required server-management dependency. It may remain installed as an optional convenience, but loss of its quota or service must not block routine 3DVR server work.

## Control-path priority

For server administration and recovery, prefer:

1. **3DVR Open Runner + GitHub queue** — assistant/human remote command path that is independent of Remote Desktop Commander.
2. **Direct SSH / 3DVR SSH mesh** — primary low-level machine-to-machine and human recovery path.
3. **3DVR MCP control gateway** — safer allowlisted tools for routine structured operations.
4. **Portal / Operator** — human-friendly front end that should increasingly call the same underlying capabilities.
5. **Remote Desktop Commander or similar hosted tools** — optional convenience only, never a required recovery path.
6. **Provider console** — final recovery path when network/SSH control is unavailable.

The architecture goal is not to replace one vendor lock-in with another. The durable layer is the open runner, SSH, documented capability contracts, and Git-controlled source. Transports and assistants should be replaceable.

## Security model

The runner intentionally has powerful shell access, so its queue is a high-trust control channel.

Use a private queue repository. The runner executes only issues whose JSON body has `action: "shell"`, whose `device` matches this host (or `any`), and whose GitHub author is in `allowed_authors`.

Do not put passwords, API tokens, cookies, private keys, or other secrets in issue bodies or command output. The issue thread is an audit trail, not a secret store. Commands should prefer secret references, server-side environment files, and the existing secrets broker rather than printing credentials.

A compromised allowed GitHub account can submit shell commands to the runner. Protect that account with strong MFA, keep the queue private, keep `allowed_authors` narrow, and do not broaden author/device matching for convenience.

## Run it

Copy `apps/agent/config/open-runner.example.json` to a root-owned config file and edit the repository, device name, and allowed GitHub login. Make sure `gh auth status` succeeds on the server, then run:

```bash
python3 apps/agent/tools/github-open-runner.py --config /path/to/config.json
```

For an always-on host, run it under systemd with restart-on-failure/always behavior. The Hetzner deployment uses `3dvr-open-runner.service`.

## Submit a command

Create an issue in the private queue repository with a JSON body like:

```json
{
  "action": "shell",
  "device": "server-name",
  "command": "hostname; uptime; free -h",
  "timeout": 60
}
```

The runner claims the issue, executes `/bin/bash -lc <command>`, posts stdout/stderr and the exit code, then closes the issue.

Because the runner uses the ordinary shell and SSH aliases, a Hetzner command can also route bounded work to another cloud node, for example through `ssh 3dvr-ovh ...` or `ssh 3dvr-do ...`.

## Recovery checks

If the runner appears unavailable:

1. Confirm the queue repository is reachable from GitHub.
2. On Hetzner, check `systemctl status 3dvr-open-runner.service`.
3. Confirm `gh auth status` succeeds for the service environment.
4. Confirm the configuration still names the intended private queue, device id, and narrow `allowed_authors` list.
5. Test direct SSH independently of the queue with `ssh 3dvr-ovh`, `ssh 3dvr-do`, or another documented mesh alias.
6. If GitHub itself is unavailable, bypass the queue and use direct SSH/provider-console recovery; do not treat GitHub as the only possible transport.

## Portability

The runner should remain easy to install on any Debian/Linux server or spare laptop. The durable requirements are intentionally small: Python, GitHub CLI for the current transport, a private queue, and ordinary shell/SSH access.

A future transport can replace GitHub without replacing the execution model. This is important for the broader 3DVR goal: a user should be able to move their personal agent/booking infrastructure to another server or local computer without losing control because a hosted remote-access product changed pricing or quotas.

## Why this exists

The goal is portability and owner control: ChatGPT, another assistant, a phone, or a human can enqueue work without depending on a proprietary remote-desktop quota. The same machine can expose the safer allowlisted MCP control surface for routine operations, while Open Runner remains the explicit high-trust escape hatch for general administration and recovery.
