# DigitalOcean Money Printer Supervisor

Money Printer is not a fully autonomous company. It is a supervised operator loop that can run on an always-on server, keep state, generate market and build plans, create Codex prompts, and execute only locally approved connector operations.

The founder still owns judgment, customer trust, legal/compliance risk, money movement, production merges, and final approval.

## What It Can Do Today

- Run a scheduled Money Printer daemon cycle.
- Use OpenAI mode when `OPENAI_API_KEY` and `MONEY_PRINTER_AI_MODE=openai` are configured.
- Fall back to mock mode when AI config is missing.
- Write reports to `.money-printer/reports/`.
- Write event logs to `.money-printer/logs/`.
- Generate Codex prompts into `.money-printer/codex-prompts/`.
- Plan connector operations in `.money-printer/operations.json`.
- Execute only approved operations when the supervisor is run with `--execute-approved` and connector-specific env flags allow it.

## What It Must Not Do Unattended

- Send cold email.
- Move money.
- Change DNS.
- Delete data.
- Merge to production.
- Change prices.
- Run Codex execution without `MONEY_PRINTER_ALLOW_CODEX_EXEC=true` and an explicit execution command.

Those are red-zone actions. Keep them as human-reviewed workflows.

## Droplet Setup

On a DigitalOcean Ubuntu droplet:

```bash
sudo apt update
sudo apt install -y git curl nodejs npm ripgrep build-essential

mkdir -p ~/projects ~/.config/3dvr
cd ~/projects
git clone https://github.com/tmsteph/3dvr-portal.git
cd 3dvr-portal
npm install
npm run money-printer -- init
```

Create the private environment file:

```bash
nano ~/.config/3dvr/money-printer.env
chmod 600 ~/.config/3dvr/money-printer.env
```

Money Printer CLI and supervisor runs load this file automatically. For a nonstandard path, set
`MONEY_PRINTER_ENV_FILE=/path/to/money-printer.env`.

Example:

```bash
MONEY_PRINTER_AI_MODE=openai
OPENAI_API_KEY=
MONEY_PRINTER_MODEL=gpt-5.5

GITHUB_TOKEN=
GITHUB_OWNER=tmsteph
GITHUB_REPO=3dvr-portal

VERCEL_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=

MONEY_PRINTER_LIVE_CONNECTORS=false
MONEY_PRINTER_ALLOW_GITHUB_WRITE=false
MONEY_PRINTER_ALLOW_VERCEL_WRITE=false
MONEY_PRINTER_ALLOW_CODEX_EXEC=false
```

## First Manual Runs

Run health only:

```bash
npm run money-printer:supervisor -- --health-only
```

Run one supervised cycle:

```bash
npm run money-printer:supervisor -- --ai
```

Review output:

```bash
cat .money-printer/reports/supervisor-latest.json
npm run money-printer -- operations
```

Approve one safe operation:

```bash
npm run money-printer -- operations approve <operation-id>
```

Execute approved operations only when the relevant env flag is enabled:

```bash
MONEY_PRINTER_ALLOW_GITHUB_WRITE=true npm run money-printer:supervisor -- --ai --execute-approved
```

## Install Systemd Timer

Copy the unit files:

```bash
mkdir -p ~/.config/systemd/user
cp ops/systemd/money-printer-supervisor.service ~/.config/systemd/user/
cp ops/systemd/money-printer-supervisor.timer ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now money-printer-supervisor.timer
```

If the droplet user is not logged in all the time, enable lingering:

```bash
sudo loginctl enable-linger "$USER"
```

Check status:

```bash
systemctl --user status money-printer-supervisor.timer
systemctl --user list-timers money-printer-supervisor.timer
journalctl --user -u money-printer-supervisor.service -n 100 --no-pager
```

## Founder Review Rhythm

Daily:

- Read `.money-printer/reports/supervisor-latest.json`.
- Review `.money-printer/operations.json`.
- Approve only operations you understand.
- Check replies and customer signals before sending any more outreach.
- Turn any useful reply into a better market/pain note.

Weekly:

- Kill experiments with vague replies.
- Double down only when there is a paid audit, booked call, or specific pain from the same segment.
- Convert shipped work into proof assets before scaling outreach.

This can compound into a stronger company operating system, but it is not a magic self-founding company. The useful path is supervised autonomy: recurring research, planning, execution prompts, and metrics, with the founder protecting trust and choosing the bets.
