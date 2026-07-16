const test = require('node:test');
const assert = require('node:assert/strict');
const { chmod, mkdtemp, mkdir, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const modulePath = path.join(__dirname, '..', 'thomas-agent', 'node', 'agent-heartbeat');

function loadHeartbeatModule() {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test('agent heartbeat snapshot reflects tmux state and formats a readable summary', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-heartbeat-'));
  const binDir = path.join(tmp, 'bin');
  await mkdir(binDir, { recursive: true });
  await writeFile(
    path.join(binDir, 'tmux'),
    `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "has-session" ] && [ "\${2:-}" = "-t" ]; then
  case ",\${FAKE_TMUX_RUNNING_SESSIONS:-}," in
    *",\${3:-},"*) exit 0 ;;
    *) exit 1 ;;
  esac
fi
exit 1
`,
  );
  await chmod(path.join(binDir, 'tmux'), 0o755);

  const originalEnv = {
    PATH: process.env.PATH,
    THREEDVR_AGENT_OWNER_ALIAS: process.env.THREEDVR_AGENT_OWNER_ALIAS,
    THREEDVR_INBOX_TMUX_SESSION: process.env.THREEDVR_INBOX_TMUX_SESSION,
    THREEDVR_AUTOPILOT_TMUX_SESSION: process.env.THREEDVR_AUTOPILOT_TMUX_SESSION,
    THREEDVR_LEADS_FILE: process.env.THREEDVR_LEADS_FILE,
    THREEDVR_OUTREACH_LOG_FILE: process.env.THREEDVR_OUTREACH_LOG_FILE,
    THREEDVR_INBOX_STATE_FILE: process.env.THREEDVR_INBOX_STATE_FILE,
    FAKE_TMUX_RUNNING_SESSIONS: process.env.FAKE_TMUX_RUNNING_SESSIONS,
  };

  try {
    const leadsFile = path.join(tmp, 'leads.csv');
    const outreachLogFile = path.join(tmp, 'outreach.ndjson');
    const inboxStateFile = path.join(tmp, 'inbox.json');
    await writeFile(leadsFile, 'name,link,contact,status,date,variant\nLead,https://lead.example,mailto:lead@example.com,new,2026-05-14,\n');
    await writeFile(outreachLogFile, '');
    await writeFile(inboxStateFile, '{}');

    process.env.PATH = `${binDir}:${process.env.PATH}`;
    process.env.THREEDVR_AGENT_OWNER_ALIAS = 'ops@3dvr';
    process.env.THREEDVR_INBOX_TMUX_SESSION = 'beat-inbox';
    process.env.THREEDVR_AUTOPILOT_TMUX_SESSION = 'beat-outreach';
    process.env.THREEDVR_LEADS_FILE = leadsFile;
    process.env.THREEDVR_OUTREACH_LOG_FILE = outreachLogFile;
    process.env.THREEDVR_INBOX_STATE_FILE = inboxStateFile;
    process.env.FAKE_TMUX_RUNNING_SESSIONS = 'beat-inbox,beat-outreach';

    const heartbeat = loadHeartbeatModule();

    const running = heartbeat.getRuntimeSnapshot();
    assert.equal(running.ownerAlias, 'ops@3dvr');
    assert.equal(running.service, '3dvr-agent');
    assert.equal(running.status, 'running');
    assert.equal(running.inbox.running, true);
    assert.equal(running.outreach.running, true);
    assert.equal(running.sales.ownerAlias, 'ops@3dvr');
    assert.equal(running.sales.leads.statusCounts.new, 1);
    assert.match(running.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(running.lastBeatAt, /^\d{4}-\d{2}-\d{2}T/);

    const runningSummary = heartbeat.summarizeRuntime(running);
    assert.match(runningSummary, /Owner: ops@3dvr/);
    assert.match(runningSummary, /Status: running/);
    assert.match(runningSummary, /Inbox: running \(beat-inbox\)/);
    assert.match(runningSummary, /Outreach: running \(beat-outreach\)/);
    assert.match(runningSummary, /Sales: new=1, contacted=0, replied=0, failed=0, manual=0, today=0/);

    process.env.FAKE_TMUX_RUNNING_SESSIONS = 'beat-inbox';
    const degraded = heartbeat.getRuntimeSnapshot();
    assert.equal(degraded.status, 'degraded');
    assert.equal(degraded.inbox.running, true);
    assert.equal(degraded.outreach.running, false);

    const degradedSummary = heartbeat.summarizeRuntime(degraded);
    assert.match(degradedSummary, /Status: degraded/);
    assert.match(degradedSummary, /Outreach: stopped \(beat-outreach\)/);
  } finally {
    process.env.PATH = originalEnv.PATH;
    process.env.THREEDVR_AGENT_OWNER_ALIAS = originalEnv.THREEDVR_AGENT_OWNER_ALIAS;
    process.env.THREEDVR_INBOX_TMUX_SESSION = originalEnv.THREEDVR_INBOX_TMUX_SESSION;
    process.env.THREEDVR_AUTOPILOT_TMUX_SESSION = originalEnv.THREEDVR_AUTOPILOT_TMUX_SESSION;
    process.env.THREEDVR_LEADS_FILE = originalEnv.THREEDVR_LEADS_FILE;
    process.env.THREEDVR_OUTREACH_LOG_FILE = originalEnv.THREEDVR_OUTREACH_LOG_FILE;
    process.env.THREEDVR_INBOX_STATE_FILE = originalEnv.THREEDVR_INBOX_STATE_FILE;
    process.env.FAKE_TMUX_RUNNING_SESSIONS = originalEnv.FAKE_TMUX_RUNNING_SESSIONS;
    await rm(tmp, { recursive: true, force: true });
  }
});
