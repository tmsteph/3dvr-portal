# Open Remote Runner

3DVR Open Remote Runner is a tiny, self-hosted alternative to paid remote-command bridges.
It polls a **private GitHub repository** for command issues, executes approved commands on a server, posts the result back to the issue, and closes it.

The runner itself is open source and has no vendor tool-call quota. GitHub is only the default transport; the command runner can later be paired with another queue.

## Security model

Use a private queue repository. The runner executes only issues whose JSON body has `action: "shell"`, whose `device` matches this host (or `any`), and whose GitHub author is in `allowed_authors`.
Do not put passwords, API tokens, or other secrets in issue bodies or command output. The issue thread is the audit trail.

## Run it

Copy `apps/agent/config/open-runner.example.json` to a root-owned config file and edit the repository, device name, and allowed GitHub login. Make sure `gh auth status` succeeds on the server, then run:

```bash
python3 apps/agent/tools/github-open-runner.py --config /path/to/config.json
```

A systemd service is recommended for always-on use.

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

## Why this exists

The goal is portability: ChatGPT, another assistant, a phone, or a human can all enqueue work through GitHub without depending on a proprietary remote-desktop quota. The same machine can still expose the safer allowlisted MCP control surface for routine operations.
