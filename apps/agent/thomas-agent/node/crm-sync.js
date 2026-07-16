const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { readOutreachLog } = require('./outreach-log');
const { leadAction, routeFromContact } = require('./lead-route');

const ROOT = path.join(__dirname, '..');
const DEFAULT_LEADS_FILE = process.env.THREEDVR_LEADS_FILE || path.join(ROOT, 'leads.csv');
const DEFAULT_OUTREACH_LOG_FILE = process.env.THREEDVR_OUTREACH_LOG_FILE || path.join(ROOT, 'outreach-log.ndjson');
const DEFAULT_WRITE_TIMEOUT_MS = Number.parseInt(process.env.THREEDVR_CRM_SYNC_TIMEOUT_MS || '10000', 10);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeLower(value) {
  return normalizeText(value).toLowerCase();
}

function slugify(input) {
  return normalizeLower(input)
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeEmail(value) {
  const text = normalizeText(value).replace(/^mailto:/i, '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : '';
}

function normalizePhone(value) {
  const text = normalizeText(value);
  if (!/^\+?[0-9][0-9().\-\s]{6,}$/.test(text)) return '';
  return text.replace(/\s+/g, ' ');
}

function stableHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 12);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function isoDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  if (Number.isNaN(date.getTime())) return fallback.toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
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
    })
    .filter((lead) => normalizeText(lead.name));
}

function isLikelyNoiseLead(lead) {
  const text = `${lead.name} ${lead.link} ${lead.variant}`.toLowerCase();
  if (/\btest\b/.test(text)) return true;
  if (/\bduplicate\b/.test(text)) return true;
  if (/starbucks\.com\/store-locator/.test(text)) return true;
  if (/restaurants\.elpolloloco\.com/.test(text)) return true;
  if (/yelp\.com\/biz\//.test(text)) return true;
  return false;
}

function shouldSyncLeadToCrm(lead, options = {}) {
  if (options.includeAll) return true;
  const status = normalizeLower(lead.status) || 'new';
  if (isLikelyNoiseLead(lead)) return false;
  if (status === 'failed') return false;
  if (['contacted', 'replied', 'nurture', 'closed'].includes(status)) return true;
  return ['email', 'form'].includes(leadAction(lead));
}

function buildLeadId(lead) {
  const email = normalizeEmail(lead.contact);
  const seed = email || lead.link || lead.name;
  return `agent-lead-${slugify(seed || lead.name)}`;
}

function marketSegmentForLead(lead) {
  const text = `${lead.name} ${lead.link} ${lead.contact} ${lead.variant}`.toLowerCase();
  if (/professional|law|attorney|legal|estate|account|financial|consult/i.test(text)) {
    return 'Professional services';
  }
  if (/salon|barber|repair|grass|service|restaurant|coffee|cafe|brew|home|loan/i.test(text)) {
    return 'Local services';
  }
  return 'Owner-led service business';
}

function statusForLead(lead) {
  const status = normalizeLower(lead.status);
  if (status === 'contacted') return 'Warm - Follow-up';
  if (status === 'replied') return 'Warm - Discovery';
  if (status === 'nurture') return 'Warm - Awareness';
  if (status === 'closed') return 'Won';
  if (status === 'failed') return 'Lost';
  return 'Lead';
}

function warmthForLead(lead) {
  const status = normalizeLower(lead.status);
  if (status === 'replied' || status === 'closed') return 'hot';
  if (status === 'contacted' || status === 'nurture') return 'warm';
  return 'cold';
}

function nextActionForLead(lead) {
  const status = normalizeLower(lead.status);
  const action = leadAction(lead);
  if (status === 'failed') return 'Repair the contact route before any future outreach.';
  if (status === 'nurture') return 'Revisit later with a more specific reason to reach out.';
  if (status === 'contacted') return 'Watch for a reply; follow up later with one concrete question.';
  if (status === 'replied') return 'Reply with one clear next step and log the outcome.';
  if (action === 'email') return 'Review and send one short opener if this lead is still a fit.';
  if (action === 'form') return 'Review the contact form manually before submitting one concise opener.';
  if (action === 'open') return 'Inspect the website and look for a better contact path.';
  return 'Qualify this lead before spending time on outreach.';
}

function routeTags(lead) {
  const route = routeFromContact(lead);
  const action = leadAction(lead);
  return [`route/${route || 'site'}`, `action/${action || 'review'}`];
}

function buildCrmRecord(lead, options = {}) {
  const now = normalizeText(options.now) || new Date().toISOString();
  const route = routeFromContact(lead);
  const status = normalizeLower(lead.status) || 'new';
  const email = normalizeEmail(lead.contact);
  const phone = normalizePhone(lead.contact);
  const contactUrl = !email && !phone && /^https?:\/\//i.test(normalizeText(lead.contact))
    ? normalizeText(lead.contact)
    : '';
  const link = normalizeText(lead.link);
  const lastContacted = ['contacted', 'replied', 'failed', 'closed'].includes(status)
    ? isoDate(lead.date, new Date(now))
    : '';
  const nextFollowUp = status === 'contacted'
    ? isoDate(addDays(new Date(lastContacted || now), 7))
    : '';
  const tags = [
    'source/3dvr-agent',
    `status/${status}`,
    ...routeTags(lead),
    normalizeText(lead.variant) ? `variant/${normalizeText(lead.variant)}` : '',
  ].filter(Boolean);

  return {
    id: buildLeadId(lead),
    recordType: 'person',
    name: normalizeText(lead.name),
    email,
    phone,
    company: normalizeText(lead.name),
    role: '',
    tags: tags.join(', '),
    status: statusForLead(lead),
    warmth: warmthForLead(lead),
    fit: 'website',
    urgency: status === 'replied' ? 'high' : 'medium',
    marketSegment: marketSegmentForLead(lead),
    primaryPain: 'Possible website, booking, lead follow-up, or customer-flow need.',
    painSeverity: 'Medium',
    currentWorkaround: route === 'email'
      ? 'Direct email route available.'
      : route === 'form'
        ? 'Contact form route available.'
        : 'Needs a better verified contact route.',
    pilotStatus: status === 'closed' ? 'Customer' : status === 'contacted' ? 'Warm' : 'Watching',
    offerAmount: '$20/month launch/support or $50/month Builder when active operations are involved',
    lastSignal: [
      `Agent lead status: ${status}.`,
      link ? `Site: ${link}.` : '',
      contactUrl ? `Contact route: ${contactUrl}.` : '',
      email ? 'Direct email route available.' : '',
      phone ? 'Phone route available.' : '',
    ].filter(Boolean).join(' '),
    nextExperiment: '3dvr-agent outreach loop',
    nextBestAction: nextActionForLead(lead),
    objection: '',
    lastContacted,
    nextFollowUp,
    groupId: '',
    linkedGroupIds: '',
    linkedPersonIds: '',
    contactId: '',
    source: '3dvr-agent',
    activityCount: status === 'new' ? 0 : 1,
    notes: [
      'Synced from 3dvr-agent leads.csv.',
      '',
      link ? `Site: ${link}` : '',
      normalizeText(lead.contact) ? `Contact: ${normalizeText(lead.contact)}` : '',
      normalizeText(lead.variant) ? `Variant: ${normalizeText(lead.variant)}` : '',
    ].filter((line, index) => index < 2 || line).join('\n'),
    created: now,
    updated: now,
  };
}

function buildLeadTouch(lead, record, options = {}) {
  const now = normalizeText(options.now) || new Date().toISOString();
  const status = normalizeLower(lead.status) || 'new';
  const id = `touch-agent-lead-${slugify(record.id)}-${status}`;
  return {
    id,
    recordId: record.id,
    crmRecordId: record.id,
    contactId: '',
    contactName: record.name,
    type: status === 'contacted' ? 'message' : 'note',
    channel: routeFromContact(lead) || 'site',
    summary: `3dvr-agent lead synced as ${status}.`,
    outcome: record.nextBestAction,
    source: '3dvr-agent/leads.csv',
    segment: record.marketSegment,
    created: normalizeText(lead.date) || now,
    updated: now,
  };
}

function buildOutreachTouch(entry, record, options = {}) {
  const now = normalizeText(options.now) || new Date().toISOString();
  const status = normalizeLower(entry.status) || 'sent';
  const kind = normalizeLower(entry.kind) || 'message';
  const id = `touch-agent-outreach-${stableHash([
    entry.timestamp,
    entry.name,
    entry.subject,
    entry.status,
  ].join('|'))}`;
  return {
    id,
    recordId: record.id,
    crmRecordId: record.id,
    contactId: '',
    contactName: record.name,
    type: status === 'sent' || status === 'submitted' ? 'message' : 'note',
    channel: normalizeText(entry.route || kind),
    summary: `${kind} ${status}${entry.subject ? `: ${entry.subject}` : ''}`,
    outcome: normalizeText(entry.note) || (status === 'sent' ? 'Outbound message sent.' : `Outreach logged as ${status}.`),
    source: '3dvr-agent/outreach-log',
    segment: record.marketSegment,
    created: normalizeText(entry.timestamp) || now,
    updated: now,
  };
}

function buildCrmSyncPayload({
  leads = [],
  outreach = [],
  now = new Date().toISOString(),
  limit = 0,
  includeAll = false,
} = {}) {
  const qualifiedLeads = leads.filter((lead) => shouldSyncLeadToCrm(lead, { includeAll }));
  const selectedLeads = limit > 0 ? qualifiedLeads.slice(0, limit) : qualifiedLeads;
  const records = selectedLeads.map((lead) => buildCrmRecord(lead, { now }));
  const byName = new Map();
  const byId = new Map();
  selectedLeads.forEach((lead, index) => {
    byName.set(normalizeLower(lead.name), { lead, record: records[index] });
    byId.set(records[index].id, { lead, record: records[index] });
  });

  const touches = records.map((record) => buildLeadTouch(byId.get(record.id).lead, record, { now }));
  for (const entry of outreach) {
    const match = byName.get(normalizeLower(entry.name));
    if (!match) continue;
    touches.push(buildOutreachTouch(entry, match.record, { now }));
  }

  return { records, touches };
}

function putGun(node, payload, timeoutMs = DEFAULT_WRITE_TIMEOUT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, err: 'crm sync write timeout' });
    }, timeoutMs);

    node.put(payload, (ack) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ack || { ok: true });
    });
  });
}

async function writeCrmSync(payload, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_WRITE_TIMEOUT_MS;
  const roots = options.crmRoot && options.touchRoot
    ? options
    : require('./gun-db');
  const crmRoot = options.crmRoot || roots.portalCrmNode();
  const touchRoot = options.touchRoot || roots.portalCrmTouchLogNode();
  const results = { records: 0, touches: 0, errors: [] };

  for (const record of payload.records || []) {
    const ack = await putGun(crmRoot.get(record.id), record, timeoutMs);
    if (ack?.err) results.errors.push(`record ${record.id}: ${ack.err}`);
    else results.records += 1;
  }

  for (const touch of payload.touches || []) {
    const ack = await putGun(touchRoot.get(touch.id), touch, timeoutMs);
    if (ack?.err) results.errors.push(`touch ${touch.id}: ${ack.err}`);
    else results.touches += 1;
  }

  return results;
}

function parseArgs(argv = []) {
  const options = {
    dryRun: false,
    limit: 0,
    leadsFile: DEFAULT_LEADS_FILE,
    outreachLogFile: DEFAULT_OUTREACH_LOG_FILE,
    noOutreachLog: false,
    includeAll: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--limit') {
      options.limit = Number.parseInt(argv[++index] || '0', 10) || 0;
    } else if (arg === '--leads-file') {
      options.leadsFile = argv[++index] || DEFAULT_LEADS_FILE;
    } else if (arg === '--outreach-log') {
      options.outreachLogFile = argv[++index] || DEFAULT_OUTREACH_LOG_FILE;
    } else if (arg === '--no-outreach-log') {
      options.noOutreachLog = true;
    } else if (arg === '--include-all') {
      options.includeAll = true;
    } else if (arg === '-h' || arg === '--help' || arg === 'help') {
      options.help = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printPreview(payload, options = {}) {
  const records = payload.records || [];
  const touches = payload.touches || [];
  console.log(`CRM sync preview: records=${records.length} touches=${touches.length}`);
  for (const record of records.slice(0, options.previewLimit || 8)) {
    console.log(`- ${record.name} | ${record.status} | ${record.marketSegment} | ${record.nextBestAction}`);
  }
  if (records.length > (options.previewLimit || 8)) {
    console.log(`... ${records.length - (options.previewLimit || 8)} more record(s)`);
  }
}

async function cli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(`Usage:
  ask-crm-sync [--dry-run] [--limit 20] [--no-outreach-log] [--include-all]

Writes local 3dvr-agent leads into:
  - 3dvr-crm/<recordId>
  - 3dvr-portal/crm-touch-log/<touchId>

By default, noisy/test/failed rows and weak scraped leads are skipped so the
portal CRM stays useful. Use --include-all for a full import.`);
    return;
  }

  const leads = readLeads(options.leadsFile);
  const outreach = options.noOutreachLog
    ? []
    : readOutreachLog({ filePath: options.outreachLogFile });
  const payload = buildCrmSyncPayload({
    leads,
    outreach,
    limit: options.limit,
    includeAll: options.includeAll,
  });
  printPreview(payload);

  if (options.dryRun) {
    console.log('CRM sync dry-run only.');
    return;
  }

  const result = await writeCrmSync(payload);
  if (result.errors.length) {
    console.warn(`CRM sync completed with ${result.errors.length} warning(s).`);
    result.errors.slice(0, 5).forEach((error) => console.warn(`- ${error}`));
  }
  console.log(`CRM sync wrote ${result.records} record(s) and ${result.touches} touch log item(s).`);
}

module.exports = {
  buildCrmRecord,
  buildCrmSyncPayload,
  buildLeadId,
  buildLeadTouch,
  buildOutreachTouch,
  marketSegmentForLead,
  nextActionForLead,
  normalizeEmail,
  parseArgs,
  readLeads,
  shouldSyncLeadToCrm,
  statusForLead,
  warmthForLead,
  writeCrmSync,
};

if (require.main === module) {
  cli()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error.message || error);
      process.exit(1);
    });
}
