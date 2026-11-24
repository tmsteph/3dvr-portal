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

test('agent heartbeat snapshot reflects the full living stack and formats a readable summary', async () => {
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
    THREEDVR_AGENT_WORKER_TMUX_SESSION: process.env.THREEDVR_AGENT_WORKER_TMUX_SESSION,
    THREEDVR_CONTEXT_TASK_ROUTER_TMUX_SESSION: process.env.THREEDVR_CONTEXT_TASK_ROUTER_TMUX_SESSION,
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
    process.env.THREEDVR_AGENT_WORKER_TMUX_SESSION = 'beat-worker';
    process.env.THREEDVR_CONTEXT_TASK_ROUTER_TMUX_SESSION = 'beat-router';
    process.env.THREEDVR_LEADS_FILE = leadsFile;
    process.env.THREEDVR_OUTREACH_LOG_FILE = outreachLogFile;
    process.env.THREEDVR_INBOX_STATE_FILE = inboxStateFile;
    process.env.FAKE_TMUX_RUNNING_SESSIONS = 'beat-inbox,beat-outreach,beat-worker,beat-router';

    const heartbeat = loadHeartbeatModule();

    const running = heartbeat.getRuntimeSnapshot();
    assert.equal(running.ownerAlias, 'ops@3dvr');
    assert.equal(running.service, '3dvr-agent');
    assert.equal(running.status, 'running');
    assert.equal(running.inbox.running, true);
    assert.equal(running.outreach.running, true);
    assert.equal(running.worker.running, true);
    assert.equal(running.router.running, true);
    assert.equal(running.sales.ownerAlias, 'ops@3dvr');
    assert.equal(running.sales.leads.total, 1);

    const summary = heartbeat.formatSummary(running);
    assert.match(summary, /ops@3dvr/);
    assert.match(summary, /running/);
  } finally {
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    await rm(tmp, { recursive: true, force: true });
  }
});

test('agent heartbeat detects stale blocked processes across all nodes and reports cloud health degradation (issue #3176)', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), '3dvr-heartbeat-3176-'));
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
    THREEDVR_AGENT_WORKER_TMUX_SESSION: process.env.THREEDVR_AGENT_WORKER_TMUX_SESSION,
    THREEDVR_CONTEXT_TASK_ROUTER_TMUX_SESSION: process.env.THREEDVR_CONTEXT_TASK_ROUTER_TMUX_SESSION,
    THREEDVR_LEADS_FILE: process.env.THREEDVR_LEADS_FILE,
    THREEDVR_OUTREACH_LOG_FILE: process.env.THREEDVR_OUTREACH_LOG_FILE,
    THREEDVR_INBOX_STATE_FILE: process.env.THREEDVR_INBOX_STATE_FILE,
    FAKE_TMUX_RUNNING_SESSIONS: process.env.FAKE_TMUX_RUNNING_SESSIONS,
    THREEDVR_CLOUD_NODES_STATE: process.env.THREEDVR_CLOUD_NODES_STATE,
  };

  try {
    const leadsFile = path.join(tmp, 'leads.csv');
    const outreachLogFile = path.join(tmp, 'outreach.ndjson');
    const inboxStateFile = path.join(tmp, 'inbox.json');
    const cloudStateFile = path.join(tmp, 'cloud-nodes.json');

    await writeFile(leadsFile, 'name,link,contact,status,date,variant\n');
    await writeFile(outreachLogFile, '');
    await writeFile(inboxStateFile, '{}');
    
    // Simulate issue #3176: all three cluster nodes reporting stale blocked processes (> 3600s lock)
    const simulatedStaleCloudState = JSON.stringify({
      nodes: [
        { id: 'node-alpha', status: 'degraded', blockedProcessSeconds: 7200, stale: true },
        { id: 'node-beta', status: 'degraded', blockedProcessSeconds: 5400, stale: true },
        { id: 'node-gamma', status: 'degraded', blockedProcessSeconds: 4100, stale: true }
      ]
    });
    await writeFile(cloudStateFile, simulatedStaleCloudState);

    process.env.PATH = `${binDir}:${process.env.PATH}`;
    process.env.THREEDVR_AGENT_OWNER_ALIAS = 'cloud-watch@3dvr';
    process.env.THREEDVR_INBOX_TMUX_SESSION = 'beat-inbox';
    process.env.THREEDVR_AUTOPILOT_TMUX_SESSION = 'beat-outreach';
    process.env.THREEDVR_AGENT_WORKER_TMUX_SESSION = 'beat-worker';
    process.env.THREEDVR_CONTEXT_TASK_ROUTER_TMUX_SESSION = 'beat-router';
    process.env.THREEDVR_LEADS_FILE = leadsFile;
    process.env.THREEDVR_OUTREACH_LOG_FILE = outreachLogFile;
    process.env.THREEDVR_INBOX_STATE_FILE = inboxStateFile;
    process.env.THREEDVR_CLOUD_NODES_STATE = cloudStateFile;
    process.env.FAKE_TMUX_RUNNING_SESSIONS = 'beat-inbox,beat-outreach,beat-worker,beat-router';

    const heartbeat = loadHeartbeatModule();
    const running = heartbeat.getRuntimeSnapshot();

    // Verify issue #3176 remediation checks are correctly surfacing cloud degradation due to stale blocked processes
    assert.equal(running.cloudHealth.status, 'degraded');
    assert.equal(running.cloudHealth.staleBlockedProcessesAcrossAllNodes, true);
    assert.deepEqual(running.cloudHealth.affectedNodes, ['node-alpha', 'node-beta', 'node-gamma']);

    const summary = heartbeat.formatSummary(running);
    assert.match(summary, /degraded|stale|blocked/i);
  } finally {
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = val;
      }
    }
    await rm(tmp, { recursive: true, force: true });
  }
});