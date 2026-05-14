const { execFileSync } = require('child_process');
const os = require('os');
const { writeHeartbeat: writeAgentOpsHeartbeat, onceGun, putGun } = require('./agent-ops');
const { buildSalesSummary, gunSafe } = require('./sales-summary');

const OWNER_ALIAS = process.env.THREEDVR_AGENT_OWNER_ALIAS || 'tmsteph@3dvr';
const INBOX_SESSION = process.env.THREEDVR_INBOX_TMUX_SESSION || '3dvr-inbox';
const OUTREACH_SESSION = process.env.THREEDVR_AUTOPILOT_TMUX_SESSION || '3dvr-autopilot';
const HEARTBEAT_INTERVAL_SECONDS = Number(process.env.THREEDVR_AGENT_HEARTBEAT_INTERVAL_SECONDS || 60);
const HEARTBEAT_WRITE_TIMEOUT_MS = Number(process.env.THREEDVR_AGENT_HEARTBEAT_WRITE_TIMEOUT_MS || 10000);
const HEARTBEAT_FLUSH_MS = Number(process.env.THREEDVR_AGENT_HEARTBEAT_FLUSH_MS || 1000);
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
  let sales = {};
  try {
    sales = gunSafe(compactRuntimeSales(buildSalesSummary({ ownerAlias: OWNER_ALIAS, recentLimit: 3 })));
  } catch (error) {
    sales = {
      generatedAt: now,
      error: error.message || String(error),
    };
  }

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
    },
    sales,
  };
}

function compactRuntimeSales(summary = {}) {
  const leads = summary.leads && typeof summary.leads === 'object' ? summary.leads : {};
  const outreach = summary.outreach && typeof summary.outreach === 'object' ? summary.outreach : {};
  const inbox = summary.inbox && typeof summary.inbox === 'object' ? summary.inbox : {};

  return {
    ownerAlias: summary.ownerAlias || OWNER_ALIAS,
    hostName: summary.hostName || os.hostname(),
    generatedAt: summary.generatedAt || new Date().toISOString(),
    leads: {
      statusCounts: leads.statusCounts || {},
      routeCounts: leads.routeCounts || {},
      manualReview: leads.manualReview || 0,
    },
    outreach: {
      total: outreach.total || 0,
      sent: outreach.sent || 0,
      submitted: outreach.submitted || 0,
      failed: outreach.failed || 0,
      contactedToday: outreach.contactedToday || 0,
    },
    inbox,
  };
}

function summarizeRuntime(runtime = {}) {
  const inbox = runtime.inbox && typeof runtime.inbox === 'object' ? runtime.inbox : {};
  const outreach = runtime.outreach && typeof runtime.outreach === 'object' ? runtime.outreach : {};
  const sales = runtime.sales && typeof runtime.sales === 'object' ? runtime.sales : {};
  const leads = sales.leads && typeof sales.leads === 'object' ? sales.leads : {};
  const leadCounts = leads.statusCounts && typeof leads.statusCounts === 'object' ? leads.statusCounts : {};
  const outreachCounts = sales.outreach && typeof sales.outreach === 'object' ? sales.outreach : {};
  const lines = [
    `Owner: ${normalizeText(runtime.ownerAlias) || OWNER_ALIAS}`,
    `Host: ${normalizeText(runtime.hostName) || os.hostname()}`,
    `Status: ${normalizeText(runtime.status) || 'unknown'}`,
    `Last beat: ${normalizeText(runtime.lastBeatAt) || 'unknown'}`,
    `Inbox: ${inbox.running ? 'running' : 'stopped'} (${normalizeText(inbox.session) || INBOX_SESSION})`,
    `Outreach: ${outreach.running ? 'running' : 'stopped'} (${normalizeText(outreach.session) || OUTREACH_SESSION})`
  ];
  if (sales.generatedAt) {
    lines.push(`Sales: new=${leadCounts.new || 0}, contacted=${leadCounts.contacted || 0}, replied=${leadCounts.replied || 0}, failed=${leadCounts.failed || 0}, manual=${leads.manualReview || 0}, today=${outreachCounts.contactedToday || 0}`);
  }
  return lines.join('\n');
}

function getPortalAgentOpsNode() {
  return require('./gun-db').portalAgentOpsNode();
}

async function writeHeartbeat() {
  const snapshot = getRuntimeSnapshot();
  const node = getPortalAgentOpsNode().get(OWNER_ALIAS).get('runtime');
  await writeAgentOpsHeartbeat('runtime', {
    ownerAlias: OWNER_ALIAS,
    deviceId: snapshot.hostName,
    status: snapshot.status,
    metadata: {
      inbox: snapshot.inbox,
      outreach: snapshot.outreach,
      startedAt: snapshot.startedAt,
      sales: snapshot.sales,
    },
    timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS,
  }).catch((error) => {
    console.warn(`Agent ops heartbeat skipped: ${error.message || error}`);
  });
  const rootSnapshot = {
    ownerAlias: snapshot.ownerAlias,
    service: snapshot.service,
    status: snapshot.status,
    hostName: snapshot.hostName,
    pid: snapshot.pid,
    startedAt: snapshot.startedAt,
    lastBeatAt: snapshot.lastBeatAt,
  };
  await putGun(node, rootSnapshot, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS }).catch((error) => {
    console.warn(`Runtime heartbeat skipped: ${error.message || error}`);
  });
  await Promise.all(Object.entries(rootSnapshot).map(([key, value]) => (
    putGun(node.get(key), value, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS })
  ))).catch((error) => {
    console.warn(`Runtime scalar heartbeat skipped: ${error.message || error}`);
  });
  const salesNode = node.get('sales');
  const salesLeadsNode = salesNode.get('leads');
  await Promise.all([
    putGun(node.get('inbox'), snapshot.inbox, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS }),
    putGun(node.get('outreach'), snapshot.outreach, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS }),
    putGun(salesNode, {
      ownerAlias: snapshot.sales.ownerAlias,
      hostName: snapshot.sales.hostName,
      generatedAt: snapshot.sales.generatedAt,
      error: snapshot.sales.error || '',
    }, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS }),
    putGun(salesLeadsNode, {
      manualReview: snapshot.sales.leads?.manualReview || 0,
    }, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS }),
    putGun(salesLeadsNode.get('statusCounts'), snapshot.sales.leads?.statusCounts || {}, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS }),
    putGun(salesLeadsNode.get('routeCounts'), snapshot.sales.leads?.routeCounts || {}, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS }),
    putGun(salesNode.get('outreach'), snapshot.sales.outreach || {}, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS }),
    putGun(salesNode.get('inbox'), snapshot.sales.inbox || {}, { timeoutMs: HEARTBEAT_WRITE_TIMEOUT_MS }),
  ]).catch((error) => {
    console.warn(`Runtime detail heartbeat skipped: ${error.message || error}`);
  });
  return snapshot;
}

async function readHeartbeat() {
  const node = getPortalAgentOpsNode().get(OWNER_ALIAS).get('runtime');
  const runtime = await onceGun(node) || {};
  const scalarKeys = ['ownerAlias', 'service', 'status', 'hostName', 'pid', 'startedAt', 'lastBeatAt'];
  const salesNode = node.get('sales');
  const salesLeadsNode = salesNode.get('leads');
  const [inbox, outreach, sales, salesLeads, salesStatusCounts, salesRouteCounts, salesOutreach, salesInbox, scalarValues] = await Promise.all([
    onceGun(node.get('inbox')).catch(() => null),
    onceGun(node.get('outreach')).catch(() => null),
    onceGun(salesNode).catch(() => null),
    onceGun(salesLeadsNode).catch(() => null),
    onceGun(salesLeadsNode.get('statusCounts')).catch(() => null),
    onceGun(salesLeadsNode.get('routeCounts')).catch(() => null),
    onceGun(salesNode.get('outreach')).catch(() => null),
    onceGun(salesNode.get('inbox')).catch(() => null),
    Promise.all(scalarKeys.map((key) => onceGun(node.get(key)).catch(() => null))),
  ]);
  scalarKeys.forEach((key, index) => {
    const value = scalarValues[index];
    if (value !== null && value !== undefined && value !== '') {
      runtime[key] = value;
    }
  });
  if (inbox && typeof inbox === 'object') runtime.inbox = inbox;
  if (outreach && typeof outreach === 'object') runtime.outreach = outreach;
  if (sales && typeof sales === 'object') runtime.sales = sales;
  if (!runtime.sales || typeof runtime.sales !== 'object') runtime.sales = {};
  if (salesLeads && typeof salesLeads === 'object') runtime.sales.leads = salesLeads;
  if (!runtime.sales.leads || typeof runtime.sales.leads !== 'object') runtime.sales.leads = {};
  if (salesStatusCounts && typeof salesStatusCounts === 'object') runtime.sales.leads.statusCounts = salesStatusCounts;
  if (salesRouteCounts && typeof salesRouteCounts === 'object') runtime.sales.leads.routeCounts = salesRouteCounts;
  if (salesOutreach && typeof salesOutreach === 'object') runtime.sales.outreach = salesOutreach;
  if (salesInbox && typeof salesInbox === 'object') runtime.sales.inbox = salesInbox;
  return runtime;
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
  await sleep(Math.max(0, HEARTBEAT_FLUSH_MS));
}

if (require.main === module) {
  main().then(() => {
    process.exit(0);
  }).catch(error => {
    console.error(`Failed to write agent heartbeat: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  getRuntimeSnapshot,
  compactRuntimeSales,
  summarizeRuntime,
  writeHeartbeat,
  readHeartbeat,
  isSessionRunning,
};
