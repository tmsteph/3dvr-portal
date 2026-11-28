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

const NO_CONTACT_STATES = new Set(['closed', 'suppressed', 'unsubscribed', 'opted-out', 'do-not-contact']);

function isNoContactStatus(status) {
  return NO_CONTACT_STATES.has(normalizeLower(status));
}

function slugify(input) {
  return normalizeLower(input)
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeEmail(value) {
  const raw = normalizeText(value).toLowerCase();
  // A mailto query is compose metadata, not part of the recipient. A regular
  // profile URL with "@" must never be mistaken for a deliverable email.
  const text = raw.startsWith('mailto:') ? raw.slice(7).split('?')[0] : raw;
  return /^[^\s@/:?#<>]+@[^\s@/:?#<>]+\.[^\s@/:?#<>]+$/.test(text) ? text : '';
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

function contactIdentity(value = {}) {
  const email = normalizeEmail(value.contact || value.email);
  if (email) return `email:${email}`;
  const link = normalizeText(value.link || value.site);
  if (link) return `site:${link.toLowerCase()}`;
  return `name:${normalizeLower(value.name)}`;
}

function contactsMatch(left = {}, right = {}) {
  const leftEmail = normalizeEmail(left.contact || left.email);
  const rightEmail = normalizeEmail(right.contact || right.email);
  // A shared business name cannot override two different, explicit email
  // identities. Otherwise one buyer's reply can contaminate another's CRM.
  if (leftEmail && rightEmail && leftEmail !== rightEmail) return false;
  if (contactIdentity(left) === contactIdentity(right)) return true;
  const leftName = normalizeLower(left.name);
  const rightName = normalizeLower(right.name);
  return Boolean(leftName && rightName && leftName === rightName);
}

function leadFromOutreachEntry(entry = {}) {
  return {
    name: normalizeText(entry.name) || normalizeText(entry.contact) || 'Unknown outreach contact',
    link: normalizeText(entry.site),
    contact: normalizeText(entry.contact),
    status: normalizeLower(entry.status) === 'replied' ? 'replied'
      : ['sent', 'submitted'].includes(normalizeLower(entry.status)) ? 'contacted'
        : normalizeText(entry.status) || 'new',
    date: normalizeText(entry.timestamp),
    variant: normalizeText(entry.variant),
  };
}

function mergeOutreachIntoLead(lead, entries = []) {
  // Historical outreach is not authorization to reopen a closed record.
  // A human must explicitly decide that a newly observed reply warrants reopening.
  if (isNoContactStatus(lead.status)) return lead;
  const relevant = entries.filter(entry => contactsMatch(entry, lead));
  if (!relevant.length) return lead;
  const successful = relevant.filter(entry => ['sent', 'submitted', 'replied'].includes(normalizeLower(entry.status)));
  const replied = relevant.filter(entry => normalizeLower(entry.status) === 'replied');
  const latest = (successful.length ? successful : relevant).slice().sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || ''))).pop();
  return {
    ...lead,
    status: replied.length ? 'replied' : successful.length ? 'contacted' : lead.status,
    date: latest?.timestamp || lead.date,
    variant: latest?.variant || lead.variant,
  };
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
  // The legacy CSV "closed" value says nothing about payment or an actual win.
  if (isNoContactStatus(status)) return 'Closed';
  // Failed transport acknowledgement cannot prove the buyer was lost or even
  // that delivery did not occur. Keep it reviewable without inventing a loss.
  if (status === 'failed') return 'Lead';
  return 'Lead';
}

function warmthForLead(lead) {
  const status = normalizeLower(lead.status);
  if (status === 'replied') return 'hot';
  if (status === 'contacted' || status === 'nurture') return 'warm';
  return 'cold';
}

function nextActionForLead(lead) {
  const status = normalizeLower(lead.status);
  const action = leadAction(lead);
  if (status === 'closed') return 'Keep closed. Review verified commercial outcomes before counting a win; do not contact automatically.';
  if (isNoContactStatus(status)) return 'Do not contact. Keep the suppression until an authorized human explicitly clears it.';
  if (status === 'failed') return 'Manual delivery reconciliation required. The message may have arrived; do not retry or follow up automatically.';
  if (status === 'nurture') return 'Revisit later with a more specific reason to reach out.';
  if (status === 'contacted') return 'Wait for a reply; stay quiet unless there is a new material reason to reach out.';
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
  // A failed attempt is not evidence the prospect was actually contacted.
  const lastContacted = ['contacted', 'replied'].includes(status)
    ? isoDate(lead.date, new Date(now))
    : '';
  const nextFollowUp = '';
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
    pilotStatus: status === 'contacted' ? 'Warm' : 'Watching',
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
    // Imported CSV status is a historical assertion, not a provider send
    // receipt. Keep it as a note; only outbound-log evidence may create
    // a message touch. This avoids inflating Operator CRM send activity.
    type: 'note',
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
  // Legacy rows without an explicit delivery status are not evidence of a
  // sent message. Likewise a saved draft is not a failed delivery attempt.
  const status = normalizeLower(entry.status) || 'unknown';
  const kind = normalizeLower(entry.kind) || 'message';
  const delivered = ['sent', 'submitted'].includes(status);
  const touchType = status === 'replied' ? 'reply-received'
    : delivered ? 'outreach-sent'
      : ['failed', 'bounced'].includes(status) ? 'outreach-failed' : 'note';
  const id = `touch-agent-outreach-${stableHash([
    entry.timestamp,
    entry.name,
    entry.subject,
    entry.status,
    entry.messageId,
    entry.body,
  ].join('|'))}`;
  return {
    id,
    recordId: record.id,
    crmRecordId: record.id,
    contactId: '',
    contactName: record.name,
    type: delivered ? 'message' : 'note',
    touchType,
    channel: normalizeText(entry.route || kind),
    summary: `${kind} ${status}${entry.subject ? `: ${entry.subject}` : ''}`,
    outcome: normalizeText(entry.note) || (status === 'sent' ? 'Outbound message sent.' : `Outreach logged as ${status}.`),
    subject: normalizeText(entry.subject),
    message: String(entry.body || ''),
    campaignId: normalizeText(entry.campaignId || entry.experiment || entry.experimentId),
    experiment: normalizeText(entry.experiment || entry.experimentId),
    variant: normalizeText(entry.variant),
    messageId: normalizeText(entry.messageId),
    threadId: normalizeText(entry.threadId),
    deliveryStatus: normalizeText(entry.deliveryStatus || entry.status),
    replyStatus: normalizeText(entry.replyStatus || (status === 'replied' ? 'replied' : 'pending')),
    // A failed/ambiguous acknowledgement must not create a follow-up task
    // even when a stale imported log included a suggested follow-up date.
    nextFollowUp: record.status === 'Closed' || ['failed', 'bounced'].includes(status)
      ? '' : normalizeText(entry.nextFollowUp),
    targetUrl: normalizeText(entry.targetUrl),
    previewUrl: normalizeText(entry.previewUrl),
    recipientId: normalizeText(entry.recipientId),
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
  const outreachOnlyLeads = outreach
    .filter(entry => normalizeText(entry.name) || normalizeText(entry.contact))
    .filter(entry => normalizeText(entry.contact) || normalizeText(entry.site))
    .filter(entry => !leads.some(lead => contactsMatch(lead, entry)))
    .map(leadFromOutreachEntry);
  // An imported CSV can contain the same contact more than once. Duplicate
  // CRM IDs cause duplicate writes and make a valid reply ambiguous (so it
  // gets dropped). Canonicalize before matching outreach or applying a limit.
  // Never silently reopen an opted-out/closed contact using a newer scrape.
  const distinctLeads = new Map();
  const identityConflicts = new Set();
  for (const lead of [...leads, ...outreachOnlyLeads].filter(
    candidate => shouldSyncLeadToCrm(candidate, { includeAll })
  )) {
    const id = buildLeadId(lead);
    // CRM IDs use a human-readable slug: different emails such as
    // alice.smith@domain and alice-smith@domain can collapse to one ID.
    // Never merge unrelated buyers, overwrite their opt-outs, or attribute
    // outreach across this collision. Quarantine every row with that ID,
    // including later duplicates, until an explicit migration can assign
    // non-colliding stable identifiers.
    if (identityConflicts.has(id)) continue;
    const prior = distinctLeads.get(id);
    if (prior && contactIdentity(prior) !== contactIdentity(lead)) {
      distinctLeads.delete(id);
      identityConflicts.add(id);
      continue;
    }
    if (!prior) {
      distinctLeads.set(id, lead);
      continue;
    }
    const priorBlocked = isNoContactStatus(prior.status);
    const incomingBlocked = isNoContactStatus(lead.status);
    const newer = (Date.parse(lead.date || '') || 0) > (Date.parse(prior.date || '') || 0);
    if ((!priorBlocked && incomingBlocked) || (priorBlocked === incomingBlocked && newer)) {
      distinctLeads.set(id, lead);
    }
  }
  const qualifiedLeads = [...distinctLeads.values()];
  const selectedLeads = limit > 0 ? qualifiedLeads.slice(0, limit) : qualifiedLeads;
  // Associate each message with exactly one lead before applying status,
  // touches, reply counts or follow-ups. A name-only match is unsafe when
  // multiple contacts share that name. Exact identity wins when unique.
  const outreachByIndex = selectedLeads.map(() => []);
  // A replayed import line is one historical event, not two replies or
  // two delivered messages. Deduplicate exact rows per matched lead while
  // preserving distinct events even when they share a subject or recipient.
  const seenOutreachByIndex = selectedLeads.map(() => new Set());
  for (const entry of outreach) {
    // A name-only historical log has no attributable contact or site route.
    // Even when there is just one currently known buyer with that name, it
    // cannot prove a send or reply; attaching it would fabricate CRM funnel
    // activity and potentially schedule a follow-up for the wrong person.
    // Keep it out of buyer projections until a human reconciles its identity.
    const entryIdentity = contactIdentity(entry);
    if (entryIdentity.startsWith('name:')) continue;
    const exact = selectedLeads.flatMap((lead, index) =>
      contactIdentity(lead) === contactIdentity(entry) ? [index] : []);
    const candidates = exact.length ? exact : selectedLeads.flatMap((lead, index) => {
      const leadIdentity = contactIdentity(lead);
      const entryIdentity = contactIdentity(entry);
      // A shared name cannot prove that an email buyer and a different
      // website/contact route are the same person. Quarantine that reply
      // rather than project it as a verified contact or follow-up.
      const conflictingRoutes = leadIdentity !== entryIdentity
        && !leadIdentity.startsWith('name:')
        && !entryIdentity.startsWith('name:');
      return contactsMatch(lead, entry) && !conflictingRoutes ? [index] : [];
    });
    if (candidates.length === 1) {
      const index = candidates[0];
      const eventKey = JSON.stringify(entry);
      if (!seenOutreachByIndex[index].has(eventKey)) {
        seenOutreachByIndex[index].add(eventKey);
        outreachByIndex[index].push(entry);
      }
    }
  }
  const records = selectedLeads.map((lead, index) =>
    buildCrmRecord(mergeOutreachIntoLead(lead, outreachByIndex[index]), { now }));
  const touches = records.map((record, index) =>
    buildLeadTouch(selectedLeads[index], record, { now }));
  records.forEach((record, index) => {
    for (const entry of outreachByIndex[index]) {
      touches.push(buildOutreachTouch(entry, record, { now }));
    }
  });

  for (const [index, record] of records.entries()) {
    const entries = outreachByIndex[index];
    const replies = entries.filter(entry => normalizeLower(entry.status) === 'replied');
    const chronological = entries.slice().sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    const latest = chronological.at(-1);
    const latestSend = chronological.filter(entry => ['sent', 'submitted'].includes(normalizeLower(entry.status))).at(-1);
    const latestReply = chronological.filter(entry => normalizeLower(entry.status) === 'replied').at(-1);
    if (!latest) continue;
    // A later failed attempt is not evidence of a later delivered message.
    // Imported log order is not necessarily chronological, especially for replies.
    record.lastContacted = latestSend ? isoDate(latestSend.timestamp, new Date(now)) : record.lastContacted;
    // A legacy outreach-log entry is not proof a message was sent. In
    // particular, failed-only or draft-only histories must not manufacture
    // an outbound-send touch for the CRM funnel.
    record.lastTouchType = replies.length ? 'reply-received'
      : latestSend ? 'outreach-sent'
        : normalizeLower(latest.status) === 'failed' ? 'outreach-failed' : 'note';
    record.replyCount = replies.length;
    record.lastReplyAt = latestReply?.timestamp || '';
    record.lastCampaign = normalizeText(latest.campaignId || latest.experiment || latest.experimentId);
    record.lastVariant = normalizeText(latest.variant);
    record.lastMessageSubject = normalizeText(latest.subject);
    record.lastMessage = String(latest.body || '');
    record.lastDeliveryStatus = normalizeText(latest.deliveryStatus || latest.status);
    // Imported outreach history cannot schedule a contact after an opt-out or closure.
    // Logs may disagree: an internal failed acknowledgement can coexist with
    // a transport status such as "pending". Either explicit failure blocks
    // stale follow-up scheduling until a human reconciles delivery.
    const ambiguousDelivery = ['failed', 'bounced'].includes(normalizeLower(latest.status))
      || ['failed', 'bounced'].includes(normalizeLower(latest.deliveryStatus));
    record.nextFollowUp = record.status === 'Closed' || ambiguousDelivery
      ? '' : normalizeText(latest.nextFollowUp) || record.nextFollowUp;
    record.updated = now;
  }

  return { records, touches, identityConflicts: [...identityConflicts] };
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
      // A callback without an affirmative acknowledgement is not evidence
      // that the Portal CRM accepted a record. Never turn missing or negative
      // Gun acknowledgements into successful revenue/CRM projections.
      const accepted = ack && typeof ack === 'object'
        && !ack.err && (ack.ok === 1 || ack.ok === true);
      resolve(accepted ? ack : { ok: false, err: ack?.err ? String(ack.err) : 'crm sync write unacknowledged' });
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
  if (payload.identityConflicts?.length) {
    console.warn(`CRM identity collision(s) quarantined: ${payload.identityConflicts.join(', ')}. Manual review required before migration.`);
  }
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
  contactIdentity,
  buildCrmSyncPayload,
  buildLeadId,
  buildLeadTouch,
  buildOutreachTouch,
  leadFromOutreachEntry,
  mergeOutreachIntoLead,
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
