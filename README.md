# 3dvr-agent

A local command-line system for:
- building apps with AI
- finding and closing real-world customers

## Sales Engine

### Install

One-command install on Debian, Termux, WSL, or macOS:

```sh
curl -Ls https://raw.githubusercontent.com/tmsteph/3dvr-agent/main/install.sh | bash
```

The installer clones or updates the repo at `~/.3dvr/agent`, installs Node dependencies, creates
`~/.3dvr/config/env`, and links `3dvr` into `~/.local/bin` or `$PREFIX/bin` on Termux.

After install:

```sh
3dvr setup
3dvr doctor
3dvr connect
```

From npm package:

```sh
npm install -g 3dvr-agent
3dvr setup
```

From a local checkout:

```sh
git clone https://github.com/tmsteph/3dvr-agent.git
cd 3dvr-agent
./install.sh
3dvr setup
```

Verify the install:

```sh
3dvr doctor
```

If you are not using `npm link`, add the scripts directory to your shell:

```sh
export PATH="$(pwd)/thomas-agent/scripts:$PATH"
```

Installer configuration:

```sh
THREEDVR_HOME="$HOME/.3dvr" ./install.sh
THREEDVR_AGENT_DIR="$HOME/3dvr-agent" ./install.sh
THREEDVR_BIN_DIR="$HOME/.local/bin" ./install.sh
THREEDVR_AGENT_REPO="https://github.com/tmsteph/3dvr-agent.git" ./install.sh
```

### 3dvr CLI

```sh
3dvr
3dvr setup
3dvr connect
3dvr next
3dvr contacted
3dvr sent-next
3dvr inbox check
3dvr email status
3dvr status
3dvr portal
```

Run `3dvr` with no arguments for the guided cockpit menu. The menu accepts both numbers and normal commands, so you can stay inside the TUI and type `next`, `contacted`, `sent-next`, or `inbox check` directly.

### OAuth-first email setup

3dvr should use portal OAuth for Gmail and future Outlook support. Do not set Gmail app passwords for normal use.

```sh
3dvr connect
```

Approve Gmail in the portal. The portal will show a connection JSON payload for the CLI.

Import it:

```sh
3dvr auth import
```

Paste the JSON and press `Ctrl-D`, then verify:

```sh
3dvr email status
3dvr inbox check
```

Outlook keeps the same command shape for the future provider path:

```sh
3dvr auth login microsoft
```

The portal owns Google/Microsoft client secrets. The CLI stores the approved provider connection in
`~/.3dvr/oauth.json` and asks the portal to refresh short-lived access tokens. Tokens are not printed by status
commands.

### Workflow

```sh
3dvr lead find
3dvr lead enrich
3dvr next
3dvr outreach message
3dvr contacted
3dvr sent-next
3dvr inbox check
```

On mobile, `3dvr sent-next` is the fast path after you finish a draft. It marks the last shown lead as contacted and immediately loads the next one without making you retype the lead name.

The older `lead` commands still work. For new users, prefer the clearer outreach aliases:

```sh
3dvr outreach find
3dvr outreach next
3dvr outreach message
3dvr outreach sent
```

### Main sales page

- Launch in 3 Days → https://3dvr.tech/launch-in-3-days.html
- use this when a lead asks what 3dvr actually does

### Commands

- ask-crawl → find nearby businesses from OpenStreetMap/Overpass, dedupe them, and add them to `thomas-agent/leads.csv`
- ask-enrich → find email addresses, contact forms, and contact pages
- ask-track → manage pipeline, including `new`, `contact`, `nurture`, `reply`, `close`
- ask-next → next lead + ready opener + launch-page follow-up
- ask-message → outreach message variants and launch-page follow-up
- ask-send → copy opener, open email/contact page, optionally enrich first, optionally send direct email, and optionally mark contacted
- ask-form → open a contact page in Playwright, fill the form, and stop before submit unless `--submit` is explicit
- ask-artifact → store outreach drafts and screenshots in Gun for later reuse
- ask-yolo → use a local llama.cpp server to draft a file edit, preview it, and optionally apply/commit/push
- ask-sales → outreach messages
- ask-reply → reply messages
- ask-post → simple posts
- ask-flow → daily execution steps
- ask-autopilot → run one unattended operator cycle
- ask-autopilot-daemon → keep the operator cycling in the background
- ask-inbox → poll the 3DVR inbox for unread replies and alert the operator
- ask-inbox-daemon → keep inbox monitoring running in the background

### Lead Crawling

Run a dry crawl first:

```sh
ask-crawl --location "La Mesa, CA" --category professional --limit 10 --radius-km 8 --dry-run
```

Append the usable leads to the pipeline:

```sh
ask-crawl --location "La Mesa, CA" --category professional --limit 10 --radius-km 8
```

Categories:

```text
coffee, food, service, professional, health
```

Useful defaults:

```sh
export THREEDVR_LEAD_LOCATION="San Diego, CA"
export THREEDVR_LEAD_CATEGORY="service"
export THREEDVR_LEAD_LIMIT=25
export THREEDVR_LEAD_RADIUS_KM=8
```

If Overpass rate-limits a broad search, wait a minute or narrow the radius/city.

### Contact Enrichment

Pull better contact targets from a lead site:

```sh
ask-enrich --name "Dark Horse Coffee Roasters" --refresh
```

The enricher looks for:

```text
mailto links, visible email addresses, contact forms, contact/about/booking pages
```

Send with browser/email integration:

```sh
ask-send --enrich "Dark Horse Coffee Roasters"
```

If an email is found, `ask-send` opens a prefilled draft and copies the full email block (`To`, `Subject`, and message) to the clipboard as a fallback. The default draft mode is `mailto:`. For Gmail, use:

```sh
ask-send --gmail-draft "Dark Horse Coffee Roasters"
```

You can also make Gmail the default:

```sh
export THREEDVR_EMAIL_DRAFT_MODE="gmail"
```

If a form or contact page is found, `ask-send` copies the message and opens the page in the browser. `ask-enrich` also improves email discovery before falling back to a form or contact page. Add `--mark` when you want it to mark the lead contacted after opening. Use `ask-send --form "Dark Horse Coffee Roasters"` or `ask-form "Dark Horse Coffee Roasters"` when you want Playwright to fill a form instead of just opening the page. Use `ask-enrich --prefer-form` only when you explicitly want to refresh a lead toward a form route.

Send directly instead of opening a draft:

```sh
ask-send --auto --mark "Dark Horse Coffee Roasters"
```

This only works for direct email leads. Use Gmail OAuth for local sending:

```sh
3dvr connect
3dvr auth import
export THREEDVR_OUTREACH_EMAIL_TRANSPORT="gmail"
```

Portal relay is still supported for private/operator deployments where the portal owns sending:

```sh
export THREEDVR_OUTREACH_EMAIL_TRANSPORT="portal"
export THREEDVR_OUTREACH_EMAIL_ENDPOINT="https://portal.3dvr.tech/api/calendar/reminder-email"
export THREEDVR_OUTREACH_EMAIL_TOKEN="shared_operator_token"
```

Legacy Gmail app-password fallback is available only when explicitly configured:

```sh
export THREEDVR_OUTREACH_EMAIL_TRANSPORT="gmail"
export GMAIL_USER="3dvr.tech@gmail.com"
export GMAIL_APP_PASSWORD="your_app_password"
```

### Local YOLO Edits

Use `ask-yolo` when you want the local llama.cpp model to draft an edit to one file:

```sh
ask-yolo --file README.md "Clarify the install section"
ask-yolo --apply thomas-agent/scripts/ask-next "Make the next-step wording shorter"
ask-yolo --apply --commit README.md "Add the ask-form command"
```

By default, `ask-yolo` writes a `.yolo-new` preview file and prints a diff. It only overwrites the target file with `--apply`, only commits with `--commit`, and only pushes with `--push`.

### Autonomous Operator

Run one unattended cycle:

```sh
ask-autopilot
```

Dry-run without sending email:

```sh
ask-autopilot --dry-run --no-email
```

Keep it running a few times a day:

```sh
export THREEDVR_AUTOPILOT_INTERVAL_MINUTES=360
ask-autopilot-daemon start
ask-autopilot-daemon status
ask-autopilot-daemon stop
```

When `tmux` is available, the daemon runs in a detached `3dvr-autopilot` session so it survives the terminal that launched it.

The operator:

```text
- refills the lead queue when new leads are low
- enriches weak contact targets
- auto-sends first-touch email for direct-email leads when enabled
- stores run snapshots in Gun and local state
- emails you only when action is needed, errors happen, or spend guardrails trip
```

Useful environment variables:

```sh
export THREEDVR_AUTOPILOT_LOCATIONS="La Mesa, CA;San Diego, CA"
export THREEDVR_AUTOPILOT_CATEGORIES="professional;service"
export THREEDVR_AUTOPILOT_MIN_NEW_LEADS=5
export THREEDVR_AUTOPILOT_NOTIFY_NEW_LEADS=3
export THREEDVR_AUTOPILOT_NOTIFY_EMAIL="3dvr.tech@gmail.com"
export THREEDVR_AUTOPILOT_EMAIL_MODE="action"
export THREEDVR_AUTOPILOT_EMAIL_TRANSPORT="portal"
export THREEDVR_AUTOPILOT_EMAIL_ENDPOINT="https://portal.3dvr.tech/api/calendar/reminder-email"
export THREEDVR_AUTOPILOT_EMAIL_TOKEN="shared_operator_token"
export THREEDVR_AUTOPILOT_AUTO_SEND="true"
export THREEDVR_AUTOPILOT_AUTO_SEND_LIMIT=1
```

For local installs, use OAuth Gmail instead of app passwords:

```sh
3dvr connect
3dvr auth import
export THREEDVR_AUTOPILOT_EMAIL_TRANSPORT="gmail"
export THREEDVR_GMAIL_AUTH="oauth"
```

### Inbox Monitoring

Poll the 3DVR inbox once:

```sh
ask-inbox
```

Preview the operator alert without sending it:

```sh
ask-inbox --dry-run
```

Keep inbox monitoring running every minute while testing:

```sh
export THREEDVR_INBOX_INTERVAL_MINUTES=1
ask-inbox-daemon start
ask-inbox-daemon status
ask-inbox-daemon logs
```

The inbox watcher uses Gmail IMAP. Connect Gmail with portal OAuth first:

```sh
3dvr connect
3dvr auth import
3dvr email status
3dvr inbox check
```

Legacy app-password IMAP is still available if explicitly configured:

```sh
export GMAIL_USER="3dvr.tech@gmail.com"
export GMAIL_APP_PASSWORD="your_app_password"
```

Optional paced auto-replies for leads already marked `contacted`:

```sh
export THREEDVR_INBOX_AUTO_REPLY="true"
export THREEDVR_INBOX_AUTO_REPLY_LIMIT=1
export THREEDVR_INBOX_AUTO_REPLY_MIN_DELAY_MINUTES=0
export THREEDVR_INBOX_AUTO_REPLY_MAX_DELAY_MINUTES=0
export THREEDVR_INBOX_AUTO_REPLY_MIN_GAP_MINUTES=0
```

Auto-replies use LLM-written copy by default. The inbox monitor tries the local Qwen model first, then OpenAI if configured, then the built-in template copy unless strict mode is enabled.

```sh
export THREEDVR_INBOX_REPLY_MODE="local"          # default: local Qwen, then OpenAI, then template
export THREEDVR_INBOX_REPLY_MODE="local-strict"   # local Qwen only
export THREEDVR_INBOX_REPLY_MODE="openai"         # OpenAI, then template
export THREEDVR_INBOX_REPLY_MODE="template"       # no model calls
export THREEDVR_INBOX_LLAMA_CLI="$HOME/llama.cpp/build/bin/llama-cli"
export THREEDVR_INBOX_LOCAL_MODEL="$HOME/.cache/huggingface/hub/models--Qwen--Qwen2.5-Coder-1.5B-Instruct-GGUF/snapshots/f86cb2c1fa58255f8052cc32aeede1b7482d4361/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
export OPENAI_API_KEY="sk-..."                    # optional fallback
export THREEDVR_INBOX_LLM_MODEL="gpt-4o-mini"
export THREEDVR_INBOX_LLM_TEMPERATURE=0.95
```

This only replies to matched `mailto:` leads already in the pipeline as `contacted`, keeps the `Thomas @ 3DVR` identity explicit, and uses the configured delay window before sending. Run `ask-inbox --dry-run` first to preview the exact reply text and whether it came from `local`, `openai`, or `template`.

If you keep the shared token in a private file, `ask-autopilot` will read it automatically from:

```text
~/.3dvr-agent-operator-email-token
```

Optional spend guard:

```sh
export OPENAI_ADMIN_KEY="org_admin_key"
export THREEDVR_AUTOPILOT_OPENAI_COST_LIMIT_USD=5
```

Optional Codex probe modes:

```sh
export THREEDVR_AUTOPILOT_CODEX_PROBE="auth"   # default, reads local Codex auth summary
export THREEDVR_AUTOPILOT_CODEX_PROBE="codex"  # runs `codex exec \"/status\"`
export THREEDVR_AUTOPILOT_CODEX_PROBE="off"
```

Gun paths:

```text
3dvr/ops/autopilot/runs/<run-id>
3dvr/ops/autopilot/state
```

### Outreach Artifacts

Create a universal browser handoff that writes the draft and screenshots into Gun, then opens the portal:

```sh
ask-artifact open "Dark Horse Coffee Roasters" \
  --draft ~/outreach/darkhorse-coffee-roasters/darkhorse-footer-outreach-draft.txt \
  --file ~/outreach/darkhorse-coffee-roasters/darkhorse-footer-buttons-current.png \
  --file ~/outreach/darkhorse-coffee-roasters/darkhorse-footer-buttons-mock.png
```

The handoff file is written to the first available portable location:

```text
$THREEDVR_OUTREACH_DIR
~/3dvr-outreach
~/Downloads/3dvr-outreach
~/outreach
/sdcard/Download/3dvr-outreach
```

Use `--no-open` to create the handoff without launching a browser.

Store a draft and screenshots directly from Node:

```sh
ask-artifact save "Dark Horse Coffee Roasters" \
  --draft ~/outreach/darkhorse-coffee-roasters/darkhorse-footer-outreach-draft.txt \
  --file ~/outreach/darkhorse-coffee-roasters/darkhorse-footer-buttons-current.png \
  --file ~/outreach/darkhorse-coffee-roasters/darkhorse-footer-buttons-mock.png
```

Review the saved Gun record:

```sh
ask-artifact list "Dark Horse Coffee Roasters"
```

Gun path:

```text
3dvr/crm/outreach-artifacts/<lead-slug>
```

## AI Dev Engine

- self-yolo
- self-yolo-agent
- self-yolo-loop
- yolo-app
- yolo-new-site
- rollback-agent

## Philosophy

Keep it simple.
One action at a time.
Real output beats perfect systems.
