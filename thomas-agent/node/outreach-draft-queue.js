const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { finalizeCommercialOutreach, validateCommercialOutreach } = require('./outreach-compliance');

const DEFAULT_QUEUE_DIR = process.env.THREEDVR_OUTREACH_DRAFT_QUEUE_DIR
  || path.join(__dirname, '..', 'state', 'outreach-drafts');
const DEFAULT_PREVIEW_BASE_URL = process.env.THREEDVR_OUTREACH_PREVIEW_BASE_URL
  || 'https://portal.3dvr.tech/free-page/preview/';

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  const email = normalizeText(value).toLowerCase().replace(/^mailto:/i, '').split('?')[0];
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

function cleanId(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function leadFingerprint(lead = {}) {
  return crypto.createHash('sha256').update([
    normalizeText(lead.name).toLowerCase(),
    normalizeText(lead.site || lead.link).toLowerCase(),
    normalizeEmail(lead.recipientEmail || lead.contact),
  ].join('|')).digest('hex');
}

function buildPersonalizedPreviewUrl(preview = {}, options = {}) {
  const baseUrl = normalizeText(options.baseUrl || DEFAULT_PREVIEW_BASE_URL);
  const url = new URL(baseUrl);
  url.searchParams.set('r', cleanId(preview.recipientId));
  url.searchParams.set('name', normalizeText(preview.name).slice(0, 80));
  if (normalizeText(preview.focus)) url.searchParams.set('focus', normalizeText(preview.focus).slice(0, 180));
  if (normalizeText(preview.action)) url.searchParams.set('action', normalizeText(preview.action).slice(0, 40));
  const contactEmail = normalizeEmail(preview.contactEmail);
  if (contactEmail) {
    // Keep contact details in the fragment so they are not sent in HTTP requests or referrer headers.
    url.hash = new URLSearchParams({ email: contactEmail }).toString();
  }
  return url.toString();
}

function queuePaths(queueDir = DEFAULT_QUEUE_DIR) {
  return {
    pending: path.join(queueDir, 'pending'),
    ready: path.join(queueDir, 'ready'),
    rejected: path.join(queueDir, 'rejected'),
  };
}

function ensureQueue(queueDir) {
  const paths = queuePaths(queueDir);
  Object.values(paths).forEach(dir => fs.mkdirSync(dir, { recursive: true }));
  return paths;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function listRequests(status = 'pending', options = {}) {
  const paths = ensureQueue(options.queueDir || DEFAULT_QUEUE_DIR);
  const dir = paths[status];
  if (!dir) throw new Error(`Unsupported draft queue status: ${status}`);
  return fs.readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => readJson(path.join(dir, file)))
    .filter(Boolean)
    .sort((left, right) => normalizeText(left.createdAt).localeCompare(normalizeText(right.createdAt)));
}

function findRequestForLead(lead, options = {}) {
  const fingerprint = leadFingerprint(lead);
  for (const status of ['ready', 'pending']) {
    const match = listRequests(status, options).find(request => request.leadFingerprint === fingerprint);
    if (match) return { status, request: match };
  }
  return null;
}

function enqueueDraftRequest(lead = {}, options = {}) {
  const queueDir = options.queueDir || DEFAULT_QUEUE_DIR;
  const recipientEmail = normalizeEmail(lead.recipientEmail || lead.contact);
  if (!recipientEmail) throw new Error('A verified recipient email is required before queueing a draft.');

  const existing = findRequestForLead(lead, { queueDir });
  if (existing) return { ...existing.request, ready: existing.status === 'ready' };

  const paths = ensureQueue(queueDir);
  const id = `draft-${crypto.randomBytes(12).toString('hex')}`;
  const recipientId = `lead-${crypto.randomBytes(12).toString('hex')}`;
  const previewUrl = buildPersonalizedPreviewUrl({
    recipientId,
    name: lead.name,
    focus: lead.previewFocus,
    action: lead.previewAction,
  }, options);
  const request = {
    version: 1,
    id,
    status: 'pending',
    createdAt: new Date().toISOString(),
    campaignId: normalizeText(options.campaignId || lead.campaignId),
    experimentVariant: normalizeText(options.experimentVariant || lead.experimentVariant),
    leadFingerprint: leadFingerprint(lead),
    lead: {
      name: normalizeText(lead.name),
      site: normalizeText(lead.site || lead.link),
      recipientEmail,
      quality: lead.quality || null,
    },
    preview: { recipientId, url: previewUrl },
    instructions: {
      maximumWords: 110,
      requiredGreeting: `Hi ${normalizeText(lead.name)} team,`,
      requiredPreviewUrl: previewUrl,
      sender: 'Thomas at 3dvr.tech in San Diego',
      offer: 'A no-cost one-page website draft with no obligation to keep it.',
      prohibited: ['invented observations', 'pricing', 'guarantees', 'hype', 'alternate recipients'],
    },
  };
  writeJsonAtomic(path.join(paths.pending, `${id}.json`), request);
  return { ...request, ready: false };
}

function requestById(id, options = {}) {
  const requestId = cleanId(id);
  const paths = ensureQueue(options.queueDir || DEFAULT_QUEUE_DIR);
  for (const status of ['ready', 'pending', 'rejected']) {
    const request = readJson(path.join(paths[status], `${requestId}.json`));
    if (request) return { status, request };
  }
  return null;
}

function validateDraftText(request, text, config = process.env) {
  const raw = normalizeText(text);
  const errors = [];
  if (!raw) errors.push('Draft text is empty.');
  if (raw.split(/\s+/).length > Number(request.instructions?.maximumWords || 110)) {
    errors.push('Draft exceeds the queue word limit.');
  }
  if (!raw.startsWith(request.instructions?.requiredGreeting || 'Hi ')) {
    errors.push('Draft greeting does not match the queued business.');
  }
  if (!raw.includes(request.preview?.url || 'missing-preview')) {
    errors.push('Draft is missing the exact personalized preview URL.');
  }
  if (!/\bThomas\b[\s\S]*\b3dvr\.tech\b/i.test(raw)) errors.push('Draft must identify Thomas and 3dvr.tech.');
  if (/^(?:to|cc|bcc|from|reply-to):/im.test(raw)) errors.push('Draft body cannot set email recipients or headers.');
  if (/\b(?:guaranteed|best in|#1|number one)\b/i.test(raw)) errors.push('Draft contains an unsupported claim.');

  const finalized = finalizeCommercialOutreach(raw, config);
  const compliance = validateCommercialOutreach(finalized, config);
  errors.push(...compliance.errors);
  return { ok: errors.length === 0, errors, text: finalized };
}

function completeDraftRequest(id, draft = {}, options = {}) {
  const found = requestById(id, options);
  if (!found || found.status !== 'pending') throw new Error(`Pending draft request not found: ${id}`);
  const validation = validateDraftText(found.request, draft.text, options.config || process.env);
  if (!validation.ok) throw new Error(`Draft rejected: ${validation.errors.join(' ')}`);
  const paths = ensureQueue(options.queueDir || DEFAULT_QUEUE_DIR);
  const ready = {
    ...found.request,
    status: 'ready',
    completedAt: new Date().toISOString(),
    draft: { source: normalizeText(draft.source) || 'codex', text: validation.text },
  };
  writeJsonAtomic(path.join(paths.ready, `${ready.id}.json`), ready);
  fs.unlinkSync(path.join(paths.pending, `${ready.id}.json`));
  return ready;
}

function rejectDraftRequest(id, reason, options = {}) {
  const found = requestById(id, options);
  if (!found || found.status !== 'pending') throw new Error(`Pending draft request not found: ${id}`);
  const paths = ensureQueue(options.queueDir || DEFAULT_QUEUE_DIR);
  const rejected = { ...found.request, status: 'rejected', rejectedAt: new Date().toISOString(), reason: normalizeText(reason) };
  writeJsonAtomic(path.join(paths.rejected, `${rejected.id}.json`), rejected);
  fs.unlinkSync(path.join(paths.pending, `${rejected.id}.json`));
  return rejected;
}

function loadReadyDraft(lead = {}, options = {}) {
  const found = findRequestForLead(lead, options);
  if (!found || found.status !== 'ready') return null;
  const request = found.request;
  if (normalizeEmail(lead.recipientEmail || lead.contact) !== request.lead.recipientEmail) {
    throw new Error('Queued draft recipient no longer matches the selected lead.');
  }
  const validation = validateDraftText(request, request.draft?.text, options.config || process.env);
  if (!validation.ok) throw new Error(`Queued draft failed revalidation: ${validation.errors.join(' ')}`);
  return {
    source: `queue-${normalizeText(request.draft?.source) || 'codex'}`,
    text: validation.text,
    requestId: request.id,
    recipientId: request.preview.recipientId,
    previewUrl: request.preview.url,
  };
}

module.exports = {
  buildPersonalizedPreviewUrl,
  completeDraftRequest,
  enqueueDraftRequest,
  findRequestForLead,
  leadFingerprint,
  listRequests,
  loadReadyDraft,
  rejectDraftRequest,
  requestById,
  validateDraftText,
};
