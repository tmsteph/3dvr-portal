function clean(value) {
  return String(value || '').trim();
}

function compact(value, max = 260) {
  const text = clean(value).replace(/\s+/g, ' ');
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trim()}...`;
}

function parseBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  const normalized = clean(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function toNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function escapeCsv(value = '') {
  const text = String(value ?? '');
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function slugify(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'prospect';
}

function splitCsvLine(line = '') {
  const cells = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
      continue;
    }
    cell += char;
  }

  cells.push(cell);
  return cells.map(clean);
}

export function parseProspectsCsv(csv = '') {
  const lines = String(csv || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = splitCsvLine(lines[0]).map(header => slugify(header).replace(/-/g, '_'));
  return lines.slice(1).map((line, index) => {
    const cells = splitCsvLine(line);
    const row = {};
    headers.forEach((header, cellIndex) => {
      row[header] = cells[cellIndex] || '';
    });
    return normalizeProspect(row, index);
  }).filter(prospect => prospect.name || prospect.company || prospect.email || prospect.segment);
}

function normalizeProspect(input = {}, index = 0) {
  const name = clean(input.name || input.contact || input.lead || input.person);
  const company = clean(input.company || input.business || input.organization);
  const segment = clean(input.segment || input.niche || input.type);
  const email = clean(input.email || input.mail);
  const channel = clean(input.channel || (email ? 'email' : 'text'));
  const relationship = clean(input.relationship || input.source || input.context || 'warm/local');
  const problemHint = clean(input.problem || input.problem_hint || input.need || input.notes);
  const website = clean(input.website || input.url || input.link);
  const allowAutoSend = parseBool(input.allow_auto_send ?? input.allowAutoSend, false);
  const status = clean(input.status || 'new');

  return {
    id: clean(input.id) || slugify(`${name || company || segment || 'prospect'}-${index + 1}`),
    name,
    company,
    segment: segment || 'person who could use a simple first website',
    email,
    channel,
    relationship,
    problemHint,
    website,
    allowAutoSend,
    status,
    lastContactedAt: clean(input.last_contacted_at || input.lastContactedAt),
    replyStatus: clean(input.reply_status || input.replyStatus),
    pageStatus: clean(input.page_status || input.pageStatus),
    subscriptionStatus: clean(input.subscription_status || input.subscriptionStatus),
    notes: clean(input.notes)
  };
}

export const DEFAULT_OUTBOUND_PROSPECTS = Object.freeze([
  {
    id: 'warm-side-project',
    name: 'Warm contact with a side project',
    segment: 'friend, freelancer, or creator with a project they mention often',
    channel: 'text',
    relationship: 'warm network',
    problemHint: 'They need one clean link that explains the thing without turning it into a big brand project.',
    allowAutoSend: false
  },
  {
    id: 'local-service-pro',
    name: 'Local service pro',
    segment: 'solo contractor, technician, coach, vendor, or service provider',
    channel: 'email',
    relationship: 'local business',
    problemHint: 'They may be relying on referrals, screenshots, or social profiles instead of a simple page.',
    allowAutoSend: false
  },
  {
    id: 'event-industry-contact',
    name: 'Event industry contact',
    segment: 'AV, event, production, or freelance operator contact',
    channel: 'text',
    relationship: 'industry network',
    problemHint: 'They could use a simple page to show services, credits, availability, and contact info.',
    allowAutoSend: false
  },
  {
    id: 'creator-or-teacher',
    name: 'Creator or teacher',
    segment: 'person with a useful skill, class, offer, or lesson',
    channel: 'email',
    relationship: 'warm/community',
    problemHint: 'They need a first public page for the idea before they need a course platform or full site.',
    allowAutoSend: false
  }
]);

function prospectLabel(prospect = {}) {
  return clean(prospect.name)
    || clean(prospect.company)
    || clean(prospect.segment)
    || 'there';
}

function firstName(label = '') {
  const first = clean(label).split(/\s+/)[0] || '';
  if (!first || /^(warm|local|event|creator|person)$/i.test(first)) return 'there';
  return first;
}

function scoreProspect(prospect = {}) {
  let score = 40;
  if (/warm|friend|industry|local/i.test(prospect.relationship)) score += 18;
  if (/service|freelance|creator|teacher|contractor|event|av|production/i.test(`${prospect.segment} ${prospect.problemHint}`)) score += 18;
  if (prospect.email || prospect.channel === 'text') score += 8;
  if (prospect.website) score += 4;
  if (prospect.status === 'new') score += 6;
  if (prospect.lastContactedAt) score -= 20;
  if (/replied|interested/i.test(prospect.replyStatus)) score += 20;
  if (/converted|subscribed/i.test(prospect.subscriptionStatus)) score -= 40;
  return Math.max(0, Math.min(100, score));
}

function buildSubject(prospect = {}, offer = {}) {
  if (prospect.channel === 'text') return '';
  const label = prospect.company || prospect.name || 'your project';
  if (/service|contractor|local/i.test(`${prospect.segment} ${prospect.relationship}`)) {
    return `Simple page for ${label}`;
  }
  return 'I can make you a simple one-page website';
}

function buildMessage(prospect = {}, offer = {}) {
  const label = prospectLabel(prospect);
  const greeting = firstName(label);
  const destinationUrl = clean(offer.destinationUrl) || 'https://portal.3dvr.tech/free-page/';
  const problem = clean(prospect.problemHint)
    || 'it helps to have one clean link that explains what you do';
  const relationship = clean(prospect.relationship);
  const contextLine = relationship && !/warm\/local/i.test(relationship)
    ? `I thought of you because of your ${relationship} context.`
    : 'I thought of you because this is easiest to test with real people, not abstract audiences.';

  return [
    `Hey ${greeting},`,
    '',
    "I'm testing a small 3DVR offer: I make a clean one-page website draft for free.",
    contextLine,
    `The angle is simple: ${problem}`,
    '',
    'If you send me the basics, I can make a first draft page. If it is useful, keeping it live is optional at $5/month. If not, no pressure.',
    '',
    `Details: ${destinationUrl}`
  ].join('\n');
}

function buildApprovalReason(prospect = {}, mode = 'approval-required') {
  if (mode === 'draft-only') return 'Draft only. No send decision requested.';
  if (!prospect.allowAutoSend) return 'Needs approval because this prospect is not allowlisted for auto-send.';
  if (!prospect.email && prospect.channel === 'email') return 'Needs approval because no email is available.';
  return 'Allowlisted for auto-send if sender is configured and daily cap allows it.';
}

export function buildOutboundQueue({
  prospects = DEFAULT_OUTBOUND_PROSPECTS,
  autopilot = {},
  mode = 'approval-required',
  dailyCap = 3,
  now = new Date()
} = {}) {
  const allowedModes = new Set(['draft-only', 'approval-required', 'allowlisted-auto-send']);
  const safeMode = allowedModes.has(clean(mode)) ? clean(mode) : 'approval-required';
  const offer = {
    title: clean(autopilot.topOpportunity?.title) || '3DVR Free Page',
    destinationUrl: clean(autopilot.publish?.destinationUrl)
      || clean(autopilot.promotion?.destinationUrl)
      || 'https://portal.3dvr.tech/free-page/'
  };
  const cap = Math.max(0, Math.floor(toNumber(dailyCap, 3)));
  let autoSendSlots = cap;

  return prospects
    .map((item, index) => normalizeProspect(item, index))
    .map(prospect => {
      const score = scoreProspect(prospect);
      const eligibleForAutoSend = safeMode === 'allowlisted-auto-send'
        && prospect.allowAutoSend
        && !prospect.lastContactedAt
        && (prospect.email || prospect.channel !== 'email');
      const autoSendPlanned = eligibleForAutoSend && autoSendSlots > 0;
      if (autoSendPlanned) autoSendSlots -= 1;
      const status = safeMode === 'draft-only'
        ? 'drafted'
        : autoSendPlanned
          ? 'ready-to-send'
          : 'needs-approval';

      return {
        ...prospect,
        score,
        offer: offer.title,
        destinationUrl: offer.destinationUrl,
        subject: buildSubject(prospect, offer),
        messageDraft: buildMessage(prospect, offer),
        approvalStatus: status,
        approvalReason: buildApprovalReason(prospect, safeMode),
        eligibleForAutoSend,
        autoSendPlanned,
        generatedAt: now.toISOString()
      };
    })
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export function queueToCsv(queue = []) {
  const columns = [
    'id',
    'score',
    'name',
    'company',
    'segment',
    'channel',
    'email',
    'relationship',
    'approvalStatus',
    'approvalReason',
    'subject',
    'messageDraft',
    'destinationUrl',
    'allowAutoSend',
    'lastContactedAt',
    'replyStatus',
    'pageStatus',
    'subscriptionStatus',
    'notes'
  ];
  return [
    columns.join(','),
    ...queue.map(row => columns.map(column => escapeCsv(row[column])).join(','))
  ].join('\n') + '\n';
}

export function outcomeTrackerToCsv(queue = []) {
  const columns = [
    'id',
    'name',
    'channel',
    'contactedAt',
    'replyStatus',
    'pageRequestedAt',
    'pageDeliveredAt',
    'keepLiveDecision',
    'subscriptionStatus',
    'revenue',
    'nextFollowUpAt',
    'notes'
  ];
  return [
    columns.join(','),
    ...queue.map(row => columns.map(column => escapeCsv(row[column])).join(','))
  ].join('\n') + '\n';
}

export async function dispatchOutboundWebhook({
  queue = [],
  webhookUrl = '',
  token = '',
  fetchImpl = fetch
} = {}) {
  const ready = queue.filter(item => item.autoSendPlanned);
  const result = {
    attempted: false,
    sent: false,
    skipped: false,
    failed: false,
    sentCount: 0,
    reason: ''
  };

  if (!ready.length) {
    result.skipped = true;
    result.reason = 'no allowlisted prospects planned for auto-send';
    return result;
  }
  if (!clean(webhookUrl)) {
    result.skipped = true;
    result.reason = 'sender webhook not configured';
    return result;
  }

  result.attempted = true;
  try {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify({
        mode: 'outbound-autopilot',
        messages: ready.map(item => ({
          id: item.id,
          channel: item.channel,
          to: item.email,
          subject: item.subject,
          body: item.messageDraft,
          metadata: {
            score: item.score,
            segment: item.segment,
            offer: item.offer
          }
        }))
      })
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(text || `sender webhook returned ${response.status}`);
    }
    result.sent = true;
    result.sentCount = ready.length;
    result.reason = 'sent via sender webhook';
    return result;
  } catch (error) {
    result.failed = true;
    result.reason = `send failed: ${error.message}`;
    return result;
  }
}

export function buildOutboundSummary({
  queue = [],
  mode = 'approval-required',
  dispatch = null,
  now = new Date()
} = {}) {
  const top = queue.slice(0, 5);
  const ready = queue.filter(item => item.autoSendPlanned);
  const approval = queue.filter(item => item.approvalStatus === 'needs-approval');
  const drafted = queue.filter(item => item.approvalStatus === 'drafted');
  const lines = top.map((item, index) => (
    `${index + 1}. ${prospectLabel(item)} (${item.channel}, score ${item.score}) - ${item.approvalStatus}`
  ));
  const firstDraft = top[0];

  return `# Outbound Autopilot

Generated: ${now.toISOString()}
Mode: ${mode}

## Money Action

Approve or contact the highest-score prospect, deliver a free page draft, and ask whether it is useful enough to keep live for $5/month.

## Queue Status

- prospects scored: ${queue.length}
- needs approval: ${approval.length}
- drafted only: ${drafted.length}
- planned auto-send: ${ready.length}
- dispatch: ${dispatch ? dispatch.reason : 'not attempted'}

## Top Prospects

${lines.length ? lines.map(line => `- ${line}`).join('\n') : '- No prospects available.'}

## First Draft

${firstDraft ? [
    `To: ${prospectLabel(firstDraft)}`,
    firstDraft.subject ? `Subject: ${firstDraft.subject}` : '',
    '',
    compact(firstDraft.messageDraft, 900)
  ].filter(Boolean).join('\n') : 'No draft generated.'}

## Guardrail

Auto-send requires mode \`allowlisted-auto-send\`, an allowlisted prospect, daily cap room, and a configured sender webhook.
`;
}
