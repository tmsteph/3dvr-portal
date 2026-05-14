const fs = require('fs');
const os = require('os');
const path = require('path');

const { readOutreachLog, isFailureEntry } = require('./outreach-log');
const { routeFromContact } = require('./lead-route');

const ROOT = path.join(__dirname, '..');
const STATE_DIR = process.env.THREEDVR_AUTOPILOT_STATE_DIR || path.join(ROOT, 'state');
const DEFAULT_OWNER_ALIAS = process.env.THREEDVR_AGENT_OWNER_ALIAS || 'tmsteph@3dvr';
const DEFAULT_LEADS_FILE = process.env.THREEDVR_LEADS_FILE || path.join(ROOT, 'leads.csv');
const DEFAULT_INBOX_STATE_FILE = process.env.THREEDVR_INBOX_STATE_FILE || path.join(STATE_DIR, 'inbox-monitor-state.json');
const DEFAULT_WRITE_TIMEOUT_MS = parseInteger(process.env.THREEDVR_SALES_SUMMARY_WRITE_TIMEOUT_MS, 10000);

function normalizeText(value) {
  return String(value || '').trim();
}

function todayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readJsonFile(filePath, fallback = {}) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function readLeads(filePath = DEFAULT_LEADS_FILE) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const [name = '', link = '', contact = '', status = '', date = '', variant = ''] = line.split(',');
      return { name, link, contact, status, date, variant };
    });
}

function countLeadStatuses(leads = []) {
  const counts = {
    total: leads.length,
    new: 0,
    contacted: 0,
    nurture: 0,
    replied: 0,
    failed: 0,
    closed: 0,
    other: 0,
  };

  for (const lead of leads) {
    const status = normalizeText(lead.status).toLowerCase() || 'other';
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    } else {
      counts.other += 1;
    }
  }

  return counts;
}

function countLeadRoutes(leads = []) {
  const routes = {
    emailReady: 0,
    formReady: 0,
    pageOnly: 0,
    needsEnrichment: 0,
    other: 0,
  };

  for (const lead of leads) {
    if (normalizeText(lead.status).toLowerCase() !== 'new') continue;
    const route = routeFromContact(lead);
    if (route === 'email') {
      routes.emailReady += 1;
    } else if (route === 'form') {
      routes.formReady += 1;
    } else if (route === 'contact-page' || route === 'site') {
      if (!normalizeText(lead.contact)) {
        routes.needsEnrichment += 1;
      } else {
        routes.pageOnly += 1;
      }
    } else {
      routes.other += 1;
    }
  }

  return routes;
}

function compactLead(lead = {}) {
  return {
    name: normalizeText(lead.name),
    status: normalizeText(lead.status),
    contact: normalizeText(lead.contact || lead.link),
    variant: normalizeText(lead.variant),
  };
}

function compactOutreachEntry(entry = {}) {
  return {
    timestamp: normalizeText(entry.timestamp),
    kind: normalizeText(entry.kind),
    status: normalizeText(entry.status),
    name: normalizeText(entry.name),
    route: normalizeText(entry.route),
    source: normalizeText(entry.source),
    subject: normalizeText(entry.subject),
    note: normalizeText(entry.note),
  };
}

function summarizeLeads(leads = [], options = {}) {
  const recentLimit = Math.max(1, options.recentLimit || 5);
  const newLeads = leads.filter((lead) => normalizeText(lead.status).toLowerCase() === 'new');
  const contactedLeads = leads.filter((lead) => normalizeText(lead.status).toLowerCase() === 'contacted');
  const failedLeads = leads.filter((lead) => normalizeText(lead.status).toLowerCase() === 'failed');
  const routes = countLeadRoutes(leads);

  return {
    statusCounts: countLeadStatuses(leads),
    routeCounts: routes,
    manualReview: routes.formReady + routes.pageOnly,
    topNew: newLeads.slice(-recentLimit).reverse().map(compactLead),
    topContacted: contactedLeads.slice(-recentLimit).reverse().map(compactLead),
    topFailed: failedLeads.slice(-recentLimit).reverse().map(compactLead),
  };
}

function summarizeOutreach(entries = [], options = {}) {
  const recentLimit = Math.max(1, options.recentLimit || 5);
  const today = options.today || todayIsoDate();
  const failures = entries.filter(isFailureEntry);
  const contactedToday = entries.filter((entry) => {
    const status = normalizeText(entry.status).toLowerCase();
    return normalizeText(entry.timestamp).startsWith(today) && ['sent', 'submitted'].includes(status);
  });

  return {
    total: entries.length,
    sent: entries.filter((entry) => normalizeText(entry.status).toLowerCase() === 'sent').length,
    submitted: entries.filter((entry) => normalizeText(entry.status).toLowerCase() === 'submitted').length,
    failed: failures.length,
    contactedToday: contactedToday.length,
    recent: entries.slice(-recentLimit).reverse().map(compactOutreachEntry),
    failures: failures.slice(-recentLimit).reverse().map(compactOutreachEntry),
  };
}

function summarizeInbox(state = {}) {
  const messages = state.messages && typeof state.messages === 'object' ? state.messages : {};
  const seen = state.seen && typeof state.seen === 'object' ? state.seen : {};
  const pendingAutoReplies = Object.values(messages).filter((message) => {
    if (!message || typeof message !== 'object') return false;
    return message.dueAt && !message.autoRepliedAt;
  }).length;

  return {
    lastAlertAt: normalizeText(state.lastAlertAt),
    seenCount: Object.keys(seen).length,
    messageCount: Object.keys(messages).length,
    pendingAutoReplies,
  };
}

function buildSalesSummary(options = {}) {
  const leads = readLeads(options.leadsFile || DEFAULT_LEADS_FILE);
  const outreach = readOutreachLog({ filePath: options.outreachLogFile });
  const inboxState = readJsonFile(options.inboxStateFile || DEFAULT_INBOX_STATE_FILE, {});

  return {
    ownerAlias: normalizeText(options.ownerAlias) || DEFAULT_OWNER_ALIAS,
    hostName: os.hostname(),
    generatedAt: new Date().toISOString(),
    leads: summarizeLeads(leads, options),
    outreach: summarizeOutreach(outreach, options),
    inbox: summarizeInbox(inboxState),
  };
}

function gunSafe(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) {
    return value.reduce((output, item, index) => {
      output[`item_${index}`] = gunSafe(item);
      return output;
    }, {});
  }
  if (typeof value === 'object') {
    return Object.entries(value).reduce((output, [key, entry]) => {
      output[key] = gunSafe(entry);
      return output;
    }, {});
  }
  return value;
}

function putGun(node, payload, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, err: 'sales summary write timeout' });
    }, timeoutMs);

    node.put(gunSafe(payload), (ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack || { ok: true });
    });
  });
}

async function writeSalesSummary(summary = buildSalesSummary(), options = {}) {
  const { portalAgentOpsNode } = require('./gun-db');
  const ownerAlias = normalizeText(options.ownerAlias || summary.ownerAlias) || DEFAULT_OWNER_ALIAS;
  const ack = await putGun(portalAgentOpsNode().get(ownerAlias).get('sales'), summary, options.timeoutMs || DEFAULT_WRITE_TIMEOUT_MS);
  return { ownerAlias, ack };
}

function formatCounts(counts = {}) {
  return [
    `new=${counts.new || 0}`,
    `contacted=${counts.contacted || 0}`,
    `replied=${counts.replied || 0}`,
    `failed=${counts.failed || 0}`,
    `closed=${counts.closed || 0}`,
  ].join(' ');
}

function printSalesSummary(summary = {}) {
  const leads = summary.leads || {};
  const outreach = summary.outreach || {};
  const inbox = summary.inbox || {};
  const statusCounts = leads.statusCounts || {};
  const routeCounts = leads.routeCounts || {};

  console.log(`Sales summary: ${summary.generatedAt || 'unknown'}`);
  console.log(`Leads: ${formatCounts(statusCounts)} total=${statusCounts.total || 0}`);
  console.log(`Routes: email=${routeCounts.emailReady || 0} form=${routeCounts.formReady || 0} page=${routeCounts.pageOnly || 0} enrich=${routeCounts.needsEnrichment || 0}`);
  console.log(`Manual review: ${leads.manualReview || 0}`);
  console.log(`Outreach: today=${outreach.contactedToday || 0} sent=${outreach.sent || 0} submitted=${outreach.submitted || 0} failed=${outreach.failed || 0} total=${outreach.total || 0}`);
  console.log(`Inbox: messages=${inbox.messageCount || 0} seen=${inbox.seenCount || 0} pendingAutoReplies=${inbox.pendingAutoReplies || 0}`);
}

async function cli(argv = process.argv.slice(2)) {
  const command = normalizeText(argv[0] || 'status').toLowerCase();
  if (command === 'help' || command === '-h' || command === '--help') {
    console.log('Usage: ask-sales [status|publish]');
    return;
  }

  const summary = buildSalesSummary();
  printSalesSummary(summary);

  if (command === 'publish') {
    const result = await writeSalesSummary(summary);
    if (result.ack?.err) {
      console.warn(`Sales summary write not acknowledged: ${result.ack.err}`);
      console.warn('The heartbeat runtime record still carries the latest sales summary.');
      return;
    }
    console.log(`Published sales summary for ${result.ownerAlias}.`);
  }
}

module.exports = {
  buildSalesSummary,
  compactLead,
  compactOutreachEntry,
  countLeadRoutes,
  countLeadStatuses,
  formatCounts,
  gunSafe,
  printSalesSummary,
  readLeads,
  summarizeInbox,
  summarizeLeads,
  summarizeOutreach,
  todayIsoDate,
  writeSalesSummary,
};

if (require.main === module) {
  cli()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
