const { execFileSync } = require('child_process');
const os = require('os');

const OWNER_ALIAS = process.env.THREEDVR_AGENT_OWNER_ALIAS || 'tmsteph@3dvr';
const INBOX_SESSION = process.env.THREEDVR_INBOX_TMUX_SESSION || '3dvr-inbox';
const OUTREACH_SESSION = process.env.THREEDVR_AUTOPILOT_TMUX_SESSION || '3dvr-autopilot';
const HEARTBEAT_INTERVAL_SECONDS = Number(process.env.THREEDVR_AGENT_HEARTBEAT_INTERVAL_SECONDS || 60);
const PROCESS_STARTED_AT = new Date().toISOString();

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isSessionRunning(sessionName) {
  if (!sessionName) return false;
  try {
    execFileSync('tmux', ['has-session', '-t', sessionName], { stdio: 'ignore' });
    return true;
  } catch (error) {
    return false;
  }
}

function getRuntimeSnapshot() {
  const now = new Date().toISOString();
  const hostName = os.hostname();
  const inboxRunning = isSessionRunning(INBOX_SESSION);
  const outreachRunning = isSessionRunning(OUTREACH_SESSION);
  const status = inboxRunning && outreachRunning ? 'running' : 'degraded';

  return {
    ownerAlias: OWNER_ALIAS,
    service: '3dvr-agent',
    status,
    hostName,
    pid: process.pid,
    startedAt: PROCESS_STARTED_AT,
    lastBeatAt: now,
    inbox: {
      session: INBOX_SESSION,
      running: inboxRunning,
    },
    outreach: {
      session: OUTREACH_SESSION,
      running: outreachRunning,
    }
  };
}

function summarizeRuntime(runtime = {}) {
  const inbox = runtime.inbox && typeof runtime.inbox === 'object' ? runtime.inbox : {};
  const outreach = runtime.outreach && typeof runtime.outreach === 'object' ? runtime.outreach : {};
  return [
    `Owner: ${normalizeText(runtime.ownerAlias) || OWNER_ALIAS}`,
    `Host: ${normalizeText(runtime.hostName) || os.hostname()}`,
    `Status: ${normalizeText(runtime.status) || 'unknown'}`,
    `Last beat: ${normalizeText(runtime.lastBeatAt) || 'unknown'}`,
    `Inbox: ${inbox.running ? 'running' : 'stopped'} (${normalizeText(inbox.session) || INBOX_SESSION})`,
    `Outreach: ${outreach.running ? 'running' : 'stopped'} (${normalizeText(outreach.session) || OUTREACH_SESSION})`
  ].join('\n');
}

function putGun(node, payload) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('heartbeat write timeout'));
    }, 2500);

    node.put(payload, ack => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (ack && ack.err) {
        reject(new Error(ack.err));
        return;
      }
      resolve(ack || {});
    });
  });
}

function onceGun(node) {
  return new Promise(resolve => {
    node.once(data => resolve(data || null));
  });
}

function getPortalAgentOpsNode() {
  return require('./gun-db').portalAgentOpsNode();
}

async function writeHeartbeat() {
  const snapshot = getRuntimeSnapshot();
  const node = getPortalAgentOpsNode().get(OWNER_ALIAS).get('runtime');
  await putGun(node, snapshot);
  return snapshot;
}

async function readHeartbeat() {
  const runtime = await onceGun(getPortalAgentOpsNode().get(OWNER_ALIAS).get('runtime'));
  return runtime || {};
}

async function main() {
  const command = normalizeText(process.argv[2]);

  if (command === 'status') {
    const runtime = await readHeartbeat();
    console.log(summarizeRuntime(runtime));
    return;
  }

  if (command === 'loop') {
    for (;;) {
      const snapshot = await writeHeartbeat();
      console.log(`Heartbeat written: ${snapshot.lastBeatAt}`);
      await sleep(Math.max(10, HEARTBEAT_INTERVAL_SECONDS) * 1000);
    }
  }

  const snapshot = await writeHeartbeat();
  console.log(`Heartbeat written: ${snapshot.lastBeatAt}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Failed to write agent heartbeat: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  getRuntimeSnapshot,
  summarizeRuntime,
  writeHeartbeat,
  readHeartbeat,
  isSessionRunning,
};
