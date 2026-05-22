const CAPTURE_STORAGE_KEY = '3dvr.memoryCapture.captures.v1';
const SOURCE_STORAGE_KEY = '3dvr.memoryCapture.source.v1';
const ROOT_KEY = '3dvr-portal';
const CAPTURE_NODE = 'memoryCapture';
const PROPOSALS_NODE = 'proposals';
const CRM_NODE = '3dvr-crm';
const TOUCH_LOG_NODE = 'crm-touch-log';
const MANAGED_AGENT_OWNER_ALIAS = '3dvr-managed';
const DEFAULT_SOURCE = 'memory-capture';
const PROPOSAL_STAGES = [
  { id: 'idea', label: 'Idea' },
  { id: 'draft', label: 'Draft' },
  { id: 'sent', label: 'Sent' },
  { id: 'follow-up', label: 'Follow-up' },
  { id: 'won', label: 'Won' },
  { id: 'lost', label: 'Lost' }
];
const OPEN_PROPOSAL_STAGES = ['idea', 'draft', 'sent', 'follow-up'];
const DEFAULT_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];

const state = {
  captures: loadLocalCaptures(),
  proposals: {},
  latestCapture: null,
  mediaRecorder: null,
  audioChunks: [],
  recognition: null,
  dictating: false,
  recording: false
};

const gun = typeof Gun === 'function' ? Gun(window.__GUN_PEERS__ || DEFAULT_PEERS) : null;
const portalRoot = gun ? gun.get(ROOT_KEY) : null;
const captureRoot = portalRoot ? portalRoot.get(CAPTURE_NODE).get('captures') : null;
const proposalRoot = portalRoot ? portalRoot.get(PROPOSALS_NODE) : null;
const touchLogRoot = portalRoot ? portalRoot.get(TOUCH_LOG_NODE) : null;
const crmRoot = gun ? gun.get(CRM_NODE) : null;
const agentQueueRoot = portalRoot
  ? portalRoot.get('agentOps').get(MANAGED_AGENT_OWNER_ALIAS).get('taskQueue')
  : null;

const els = {
  syncStatus: document.getElementById('syncStatus'),
  lastAction: document.getElementById('lastAction'),
  captureText: document.getElementById('captureText'),
  sourceInput: document.getElementById('sourceInput'),
  captureMode: document.getElementById('captureMode'),
  dictateButton: document.getElementById('dictateButton'),
  recordButton: document.getElementById('recordButton'),
  clearButton: document.getElementById('clearButton'),
  saveCaptureButton: document.getElementById('saveCaptureButton'),
  crmButton: document.getElementById('crmButton'),
  proposalButton: document.getElementById('proposalButton'),
  agentButton: document.getElementById('agentButton'),
  refreshButton: document.getElementById('refreshButton'),
  inferenceList: document.getElementById('inferenceList'),
  recentList: document.getElementById('recentList'),
  proposalList: document.getElementById('proposalList'),
  proposalOpenCount: document.getElementById('proposalOpenCount'),
  proposalSentCount: document.getElementById('proposalSentCount'),
  proposalWonCount: document.getElementById('proposalWonCount'),
  proposalValue: document.getElementById('proposalValue'),
  crmDraftLink: document.getElementById('crmDraftLink'),
  audioPreview: document.getElementById('audioPreview')
};

els.sourceInput.value = window.localStorage.getItem(SOURCE_STORAGE_KEY) || DEFAULT_SOURCE;

function setStatus(status, detail = '') {
  els.syncStatus.textContent = status;
  if (detail) els.lastAction.textContent = detail;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function slug(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'capture';
}

function makeId(prefix, seed = '') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${slug(seed)}-${Date.now().toString(36)}-${random}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function estimateProposalValue(offer = '') {
  const explicit = String(offer).match(/\$([0-9][0-9,]*(?:\.\d{1,2})?)/);
  if (explicit?.[1]) return Number(explicit[1].replace(/,/g, ''));
  if (/custom|interactive|walkthrough|spatial|render/i.test(offer)) return 500;
  if (/builder|\$50/i.test(offer)) return 50;
  if (/\$20|founder|launch/i.test(offer)) return 20;
  if (/\$5|starter|family/i.test(offer)) return 5;
  return 0;
}

function normalizeProposalStage(status) {
  const normalized = slug(status || 'idea');
  return PROPOSAL_STAGES.some(stage => stage.id === normalized) ? normalized : 'idea';
}

function formatMoney(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) return '$0';
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadLocalCaptures() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CAPTURE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Unable to load local memory captures.', error);
    return [];
  }
}

function saveLocalCaptures() {
  try {
    window.localStorage.setItem(CAPTURE_STORAGE_KEY, JSON.stringify(state.captures.slice(0, 40)));
  } catch (error) {
    console.warn('Unable to save local memory captures.', error);
  }
}

function putGun(node, payload) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.put !== 'function') {
      reject(new Error('Gun is unavailable.'));
      return;
    }
    const timer = window.setTimeout(() => resolve({ timedOut: true }), 8000);
    node.put(payload, (ack) => {
      window.clearTimeout(timer);
      if (ack && ack.err) {
        reject(new Error(String(ack.err)));
      } else {
        resolve(ack || {});
      }
    });
  });
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return normalizeText(match[1]);
  }
  return '';
}

function inferCapture(rawText) {
  const text = normalizeText(rawText);
  const lower = text.toLowerCase();
  const referrer = firstMatch(text, [
    /\bthrough\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /\bfrom\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /\bintroduced by\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i
  ]);
  const name = firstMatch(text, [
    /\bmet\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+wants?\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+needs?\b/,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+has\b/
  ]);

  let marketSegment = 'Owner-led service business';
  let fit = 'website';
  let offerAmount = 'Website / tech support path';
  const tags = ['memory-capture'];
  const pains = [];
  const nextSteps = [];

  if (referrer) tags.push(`referral/${slug(referrer)}`);
  if (lower.includes('mark')) tags.push('mark-referral');
  if (lower.includes('alibaba') || lower.includes('reseller') || lower.includes('ecommerce') || lower.includes('product')) {
    marketSegment = 'Ecommerce / product reseller';
    offerAmount = '$5/month onboarding, then product landing page or $20/month support';
    tags.push('ecommerce', 'reseller', 'product-page');
    pains.push('Needs product presentation, trust, order/contact workflow, and a simple first launch path.');
    nextSteps.push('Ask for first product link/photo, business name, target customer, logo/colors, competitor examples, and best contact method.');
  }
  if (lower.includes('party rental') || lower.includes('bounce') || lower.includes('wedding')) {
    marketSegment = 'Local services / event rentals';
    tags.push('local-services', 'event-rentals');
    pains.push('Needs a clearer local service website, quote path, and follow-up loop.');
    nextSteps.push('Ask for business name, service area, best photos, price list, and current Facebook/Instagram page.');
  }
  if (lower.includes('cinema 4d') || lower.includes('render') || lower.includes('lake house') || lower.includes('spatial')) {
    marketSegment = 'Spatial design / visualization';
    fit = 'app';
    offerAmount = 'Prototype tiers: still renders, flythrough, interactive walkthrough';
    tags.push('spatial-design', 'rendering', 'proposal');
    pains.push('Needs a repeatable proposal and portfolio workflow for visualizing spaces before people spend money.');
    nextSteps.push('Gather before photos, measurements, inspiration images, and define the first render package.');
  }
  if (lower.includes('website') || lower.includes('site')) {
    tags.push('website');
    pains.push('Needs a clearer website or landing page.');
  }
  if (lower.includes('overwhelmed') || lower.includes('confused') || lower.includes('nervous')) {
    tags.push('overwhelmed');
    pains.push('Feels overwhelmed and needs a low-friction next step.');
  }
  if (lower.includes('$5') || lower.includes('5/month') || lower.includes('five dollar')) {
    tags.push('starter-tier');
    offerAmount = '$5/month onboarding tier';
  }

  const inferredName = name || (referrer ? `${referrer} referral lead` : 'Memory capture lead');
  const signal = text.length > 220 ? `${text.slice(0, 217)}...` : text;

  return {
    name: inferredName,
    company: lower.includes('parents') ? "Parents' business (unknown)" : '',
    referrer,
    status: 'Warm - Awareness',
    warmth: 'warm',
    urgency: lower.includes('asap') || lower.includes('urgent') ? 'high' : 'medium',
    fit,
    marketSegment,
    primaryPain: pains[0] || 'Potential business need captured from a fast conversation.',
    nextBestAction: nextSteps[0] || 'Capture one anchor, confirm the business need, and set the next follow-up.',
    offerAmount,
    lastSignal: signal,
    tags: Array.from(new Set(tags)).join(', '),
    confidence: text.length > 30 ? 'useful draft' : 'needs more context'
  };
}

function buildCrmDraftUrl(inference) {
  const params = new URLSearchParams({
    draft: '1',
    type: 'person',
    lead: inference.name,
    company: inference.company,
    status: inference.status,
    warmth: inference.warmth,
    fit: inference.fit,
    urgency: inference.urgency,
    segment: inference.marketSegment,
    pain: inference.primaryPain,
    offer: inference.offerAmount,
    signal: inference.lastSignal,
    nextBestAction: inference.nextBestAction,
    source: getSource(),
    tags: inference.tags
  });
  return `../crm/?${params.toString()}`;
}

function renderInference() {
  const inference = inferCapture(els.captureText.value);
  const rows = [
    ['Name / lead', inference.name],
    ['Segment', inference.marketSegment],
    ['Pain', inference.primaryPain],
    ['Next step', inference.nextBestAction],
    ['Offer', inference.offerAmount],
    ['Tags', inference.tags],
    ['Confidence', inference.confidence]
  ];

  els.inferenceList.innerHTML = rows.map(([label, value]) => `
    <div>
      <dt>${safe(label)}</dt>
      <dd>${safe(value || '-')}</dd>
    </div>
  `).join('');
  els.crmDraftLink.href = buildCrmDraftUrl(inference);
}

function getSource() {
  const source = normalizeText(els.sourceInput.value) || DEFAULT_SOURCE;
  window.localStorage.setItem(SOURCE_STORAGE_KEY, source);
  return source;
}

function buildCaptureRecord() {
  const rawText = normalizeText(els.captureText.value);
  if (!rawText) {
    throw new Error('Add a quick note or dictate a memory first.');
  }

  const inference = inferCapture(rawText);
  const now = new Date().toISOString();
  const id = state.latestCapture?.rawText === rawText
    ? state.latestCapture.id
    : makeId('capture', inference.name);

  return {
    id,
    rawText,
    mode: els.captureMode.value || 'conversation',
    source: getSource(),
    inference,
    createdAt: state.latestCapture?.id === id ? state.latestCapture.createdAt : now,
    updatedAt: now,
    crmRecordId: state.latestCapture?.crmRecordId || '',
    proposalId: state.latestCapture?.proposalId || '',
    agentTaskId: state.latestCapture?.agentTaskId || ''
  };
}

async function saveCapture() {
  const record = buildCaptureRecord();
  state.latestCapture = record;
  state.captures = [record, ...state.captures.filter(item => item.id !== record.id)].slice(0, 40);
  saveLocalCaptures();

  try {
    await putGun(captureRoot.get(record.id), record);
    setStatus('Gun synced', `Saved capture ${record.id}.`);
  } catch (error) {
    setStatus('Local copy kept', error.message || 'Gun sync failed.');
  }

  renderRecent();
  renderProposals();
  return record;
}

function buildCrmRecord(capture) {
  const now = new Date().toISOString();
  const inference = capture.inference;
  const id = capture.crmRecordId || makeId('lead-memory', inference.name);
  return {
    id,
    recordType: 'person',
    name: inference.name,
    email: '',
    phone: '',
    company: inference.company,
    role: '',
    tags: inference.tags,
    status: inference.status,
    warmth: inference.warmth,
    fit: inference.fit,
    urgency: inference.urgency,
    marketSegment: inference.marketSegment,
    primaryPain: inference.primaryPain,
    painSeverity: inference.urgency === 'high' ? 'high' : 'medium',
    currentWorkaround: 'Captured from raw memory. Needs confirmation.',
    pilotStatus: 'Watching',
    offerAmount: inference.offerAmount,
    lastSignal: inference.lastSignal,
    nextExperiment: 'Low-energy memory capture follow-up',
    nextBestAction: inference.nextBestAction,
    objection: '',
    lastContacted: now,
    nextFollowUp: '',
    groupId: '',
    linkedGroupIds: '',
    linkedPersonIds: '',
    contactId: '',
    source: capture.source,
    activityCount: 1,
    notes: [
      'Created from Memory Capture.',
      '',
      capture.rawText
    ].join('\n'),
    created: now,
    updated: now
  };
}

function buildTouchLog(capture, crmRecord) {
  const now = new Date().toISOString();
  return {
    id: makeId('touch-memory', crmRecord.name),
    recordId: crmRecord.id,
    contactId: '',
    contactName: crmRecord.name,
    type: 'note',
    channel: capture.mode || 'conversation',
    summary: `Memory capture: ${capture.inference.lastSignal}`,
    outcome: capture.inference.nextBestAction,
    source: 'memory-capture',
    created: now,
    updated: now
  };
}

async function createCrmLead() {
  const capture = await saveCapture();
  const crmRecord = buildCrmRecord(capture);
  const touch = buildTouchLog(capture, crmRecord);

  await putGun(crmRoot.get(crmRecord.id), crmRecord);
  await putGun(touchLogRoot.get(touch.id), touch);

  capture.crmRecordId = crmRecord.id;
  state.latestCapture = capture;
  await putGun(captureRoot.get(capture.id), capture);
  state.captures = [capture, ...state.captures.filter(item => item.id !== capture.id)].slice(0, 40);
  saveLocalCaptures();
  renderRecent();
  setStatus('CRM lead created', crmRecord.name);
}

function buildProposal(capture) {
  const now = new Date().toISOString();
  const inference = capture.inference;
  const id = capture.proposalId || makeId('proposal', inference.name);
  const estimatedValue = estimateProposalValue(inference.offerAmount);
  return {
    id,
    title: `${inference.name} proposal`,
    status: 'idea',
    linkedCrmRecordId: capture.crmRecordId || '',
    sourceCaptureId: capture.id,
    offer: inference.offerAmount,
    scope: inference.primaryPain,
    nextBestAction: inference.nextBestAction,
    price: estimatedValue ? String(estimatedValue) : '',
    estimatedValue,
    sentAt: '',
    followUpAt: formatDateInput(addDays(new Date(), 3)),
    tags: inference.tags,
    notes: capture.rawText,
    createdAt: now,
    updatedAt: now
  };
}

async function createProposal() {
  const capture = await saveCapture();
  const proposal = buildProposal(capture);
  await putGun(proposalRoot.get(proposal.id), proposal);
  state.proposals[proposal.id] = proposal;

  capture.proposalId = proposal.id;
  state.latestCapture = capture;
  await putGun(captureRoot.get(capture.id), capture);
  state.captures = [capture, ...state.captures.filter(item => item.id !== capture.id)].slice(0, 40);
  saveLocalCaptures();
  renderRecent();
  renderProposals();
  setStatus('Proposal tracked', proposal.title);
}

function buildAgentTask(capture) {
  const now = Date.now();
  const id = makeId('memory-task', capture.inference.name);
  const task = [
    'Process this 3dvr Memory Capture into clean CRM/proposal actions.',
    `Capture id: ${capture.id}`,
    `Suggested lead: ${capture.inference.name}`,
    `Source: ${capture.source}`,
    `Mode: ${capture.mode}`,
    capture.crmRecordId ? `CRM record id: ${capture.crmRecordId}` : 'Create or update the CRM record if useful.',
    capture.proposalId ? `Proposal id: ${capture.proposalId}` : 'Create or update a proposal if this is a deal/project.',
    '',
    'Raw capture:',
    capture.rawText
  ].join('\n');

  return {
    id,
    task,
    tenantId: 'portal:memory-capture',
    tenantAlias: window.localStorage.getItem('alias') || window.localStorage.getItem('username') || 'memory-capture',
    tenantPlan: 'free',
    backend: 'codex',
    repo: 'tmsteph/3dvr-portal',
    model: '',
    thinking: '',
    unsafe: false,
    riskClass: 'workspace_write',
    approvalStatus: 'not_required',
    requiredCapabilities: 'codex,crm,gun',
    maxRuntimeMs: 0,
    status: 'queued',
    requestedBy: 'memory-capture',
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    resultSummary: '',
    error: '',
    workerDeviceId: '',
    sourceCaptureId: capture.id
  };
}

async function queueAgentTask() {
  const capture = await saveCapture();
  const task = buildAgentTask(capture);
  const summary = {
    id: task.id,
    status: task.status,
    task: task.task,
    tenantId: task.tenantId,
    tenantAlias: task.tenantAlias,
    tenantPlan: task.tenantPlan,
    riskClass: task.riskClass,
    approvalStatus: task.approvalStatus,
    requiredCapabilities: task.requiredCapabilities,
    updatedAt: task.updatedAt
  };

  await putGun(agentQueueRoot.get('tasks').get(task.id), task);
  await putGun(agentQueueRoot.get('latest').get(task.id), summary);

  capture.agentTaskId = task.id;
  state.latestCapture = capture;
  await putGun(captureRoot.get(capture.id), capture);
  state.captures = [capture, ...state.captures.filter(item => item.id !== capture.id)].slice(0, 40);
  saveLocalCaptures();
  renderRecent();
  setStatus('Agent task queued', task.id);
}

function renderRecent() {
  const captures = state.captures
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 8);

  if (!captures.length) {
    els.recentList.innerHTML = '<p class="empty">No captures yet.</p>';
    return;
  }

  els.recentList.innerHTML = captures.map(capture => `
    <article class="recent-card">
      <strong>${safe(capture.inference?.name || 'Memory capture')}</strong>
      <p>${safe(capture.inference?.lastSignal || capture.rawText || '')}</p>
      <span>${safe(capture.mode || 'conversation')} | ${safe(capture.updatedAt || '')}</span>
    </article>
  `).join('');
}

function renderProposals() {
  const proposals = Object.values(state.proposals || {})
    .filter(Boolean)
    .map(proposal => ({
      ...proposal,
      status: normalizeProposalStage(proposal.status),
      estimatedValue: Number(proposal.estimatedValue || proposal.price || 0) || estimateProposalValue(proposal.offer)
    }))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));

  if (!els.proposalList) return;

  const openCount = proposals.filter(proposal => OPEN_PROPOSAL_STAGES.includes(proposal.status)).length;
  const sentCount = proposals.filter(proposal => proposal.status === 'sent' || proposal.status === 'follow-up').length;
  const wonCount = proposals.filter(proposal => proposal.status === 'won').length;
  const estimatedValue = proposals
    .filter(proposal => proposal.status !== 'lost')
    .reduce((total, proposal) => total + (Number(proposal.estimatedValue) || 0), 0);

  if (els.proposalOpenCount) els.proposalOpenCount.textContent = String(openCount);
  if (els.proposalSentCount) els.proposalSentCount.textContent = String(sentCount);
  if (els.proposalWonCount) els.proposalWonCount.textContent = String(wonCount);
  if (els.proposalValue) els.proposalValue.textContent = formatMoney(estimatedValue);

  if (!proposals.length) {
    els.proposalList.innerHTML = '<p class="empty">No proposals tracked yet.</p>';
    return;
  }

  const byStage = PROPOSAL_STAGES.map(stage => ({
    ...stage,
    proposals: proposals.filter(proposal => proposal.status === stage.id).slice(0, 12)
  }));

  els.proposalList.innerHTML = byStage.map(stage => `
    <section class="proposal-column" aria-label="${safe(stage.label)} proposals">
      <div class="proposal-column__head">
        <strong>${safe(stage.label)}</strong>
        <span>${stage.proposals.length}</span>
      </div>
      <div class="proposal-column__cards">
        ${stage.proposals.length ? stage.proposals.map(renderProposalCard).join('') : '<p class="empty proposal-empty">No proposals.</p>'}
      </div>
    </section>
  `).join('');
}

function renderProposalCard(proposal) {
  const crmHref = proposal.linkedCrmRecordId ? `../crm/?record=${encodeURIComponent(proposal.linkedCrmRecordId)}` : '../crm/';
  const followUp = proposal.followUpAt ? `Follow up ${proposal.followUpAt}` : 'Follow-up date unset';
  const value = Number(proposal.estimatedValue || proposal.price || 0);
  return `
    <article class="proposal-card" data-proposal-id="${safe(proposal.id)}">
      <div class="proposal-card__top">
        <strong>${safe(proposal.title || 'Proposal')}</strong>
        <span>${safe(formatMoney(value))}</span>
      </div>
      <p>${safe(proposal.scope || proposal.nextBestAction || 'Scope needs a quick pass.')}</p>
      <dl class="proposal-meta">
        <div>
          <dt>Offer</dt>
          <dd>${safe(proposal.offer || 'TBD')}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>${safe(proposal.nextBestAction || followUp)}</dd>
        </div>
      </dl>
      <div class="proposal-card__footer">
        <span>${safe(followUp)}</span>
        <a href="${crmHref}">CRM</a>
      </div>
      <div class="proposal-actions" aria-label="Update proposal stage">
        ${proposal.status !== 'draft' ? `<button type="button" data-proposal-stage="draft" data-proposal-id="${safe(proposal.id)}">Draft</button>` : ''}
        ${proposal.status !== 'sent' ? `<button type="button" data-proposal-stage="sent" data-proposal-id="${safe(proposal.id)}">Sent</button>` : ''}
        ${proposal.status !== 'follow-up' ? `<button type="button" data-proposal-stage="follow-up" data-proposal-id="${safe(proposal.id)}">Follow-up</button>` : ''}
        ${proposal.status !== 'won' ? `<button type="button" data-proposal-stage="won" data-proposal-id="${safe(proposal.id)}">Won</button>` : ''}
        ${proposal.status !== 'lost' ? `<button type="button" data-proposal-stage="lost" data-proposal-id="${safe(proposal.id)}">Lost</button>` : ''}
      </div>
    </article>
  `;
}

async function updateProposalStage(id, status) {
  const proposal = state.proposals[id];
  if (!proposal) {
    throw new Error('Proposal not found.');
  }

  const now = new Date().toISOString();
  const normalizedStatus = normalizeProposalStage(status);
  const patch = {
    ...proposal,
    status: normalizedStatus,
    sentAt: normalizedStatus === 'sent' && !proposal.sentAt ? now : proposal.sentAt || '',
    followUpAt: normalizedStatus === 'follow-up' && !proposal.followUpAt
      ? formatDateInput(addDays(new Date(), 2))
      : proposal.followUpAt || '',
    closedAt: normalizedStatus === 'won' || normalizedStatus === 'lost' ? now : proposal.closedAt || '',
    updatedAt: now
  };

  state.proposals[id] = patch;
  renderProposals();
  await putGun(proposalRoot.get(id), patch);
  setStatus('Proposal updated', `${patch.title || 'Proposal'} moved to ${normalizedStatus}.`);
}

function subscribeCaptures() {
  if (!captureRoot || typeof captureRoot.map !== 'function') {
    setStatus('Local mode', 'Gun is unavailable; local captures still work.');
    renderRecent();
    return;
  }

  setStatus('Gun connected', 'Listening for memory captures.');
  captureRoot.map().on((data, key) => {
    if (!key || !data || typeof data !== 'object') return;
    const capture = {
      ...data,
      inference: data.inference && typeof data.inference === 'object' ? data.inference : inferCapture(data.rawText || '')
    };
    state.captures = [capture, ...state.captures.filter(item => item.id !== capture.id)].slice(0, 40);
    saveLocalCaptures();
    renderRecent();
  });
}

function subscribeProposals() {
  if (!proposalRoot || typeof proposalRoot.map !== 'function') {
    renderProposals();
    return;
  }

  proposalRoot.map().on((data, key) => {
    if (!key) return;
    if (!data) {
      delete state.proposals[key];
    } else if (typeof data === 'object') {
      state.proposals[key] = { ...state.proposals[key], ...data, id: data.id || key };
    }
    renderProposals();
  });
}

function setupDictation() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    els.dictateButton.textContent = 'Dictation unavailable';
    els.dictateButton.disabled = true;
    return;
  }

  state.recognition = new SpeechRecognition();
  state.recognition.continuous = true;
  state.recognition.interimResults = true;
  state.recognition.lang = 'en-US';

  let finalTranscript = '';
  state.recognition.onresult = (event) => {
    let interim = '';
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript;
      if (event.results[index].isFinal) finalTranscript += `${transcript} `;
      else interim += transcript;
    }
    const base = normalizeText(els.captureText.value.replace(/\n\nListening:.*/s, ''));
    els.captureText.value = normalizeText(`${base}\n\n${finalTranscript}${interim ? `\n\nListening: ${interim}` : ''}`);
    renderInference();
  };
  state.recognition.onend = () => {
    state.dictating = false;
    els.dictateButton.textContent = 'Start dictation';
    els.captureText.value = els.captureText.value.replace(/\n\nListening:.*/s, '').trim();
    renderInference();
  };
}

async function toggleRecording() {
  if (state.recording && state.mediaRecorder) {
    state.mediaRecorder.stop();
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
    setStatus('Audio unavailable', 'This browser cannot record audio here.');
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  state.audioChunks = [];
  state.mediaRecorder = new MediaRecorder(stream);
  state.mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) state.audioChunks.push(event.data);
  };
  state.mediaRecorder.onstop = () => {
    const blob = new Blob(state.audioChunks, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    els.audioPreview.hidden = false;
    els.audioPreview.innerHTML = `
      <p class="empty">Audio note recorded locally. Add a short text summary before syncing.</p>
      <audio controls src="${url}"></audio>
    `;
    stream.getTracks().forEach(track => track.stop());
    state.recording = false;
    els.recordButton.textContent = 'Record audio note';
    setStatus('Audio recorded', 'Audio stays local; text summary syncs to CRM.');
  };
  state.mediaRecorder.start();
  state.recording = true;
  els.recordButton.textContent = 'Stop recording';
  setStatus('Recording', 'Speak naturally, then add or dictate a short summary.');
}

els.captureText.addEventListener('input', renderInference);
els.sourceInput.addEventListener('input', () => window.localStorage.setItem(SOURCE_STORAGE_KEY, getSource()));
els.clearButton.addEventListener('click', () => {
  els.captureText.value = '';
  state.latestCapture = null;
  els.audioPreview.hidden = true;
  els.audioPreview.innerHTML = '';
  renderInference();
  setStatus('Ready', 'Cleared current capture.');
});
els.saveCaptureButton.addEventListener('click', () => saveCapture().catch(error => setStatus('Save failed', error.message)));
els.crmButton.addEventListener('click', () => createCrmLead().catch(error => setStatus('CRM failed', error.message)));
els.proposalButton.addEventListener('click', () => createProposal().catch(error => setStatus('Proposal failed', error.message)));
els.agentButton.addEventListener('click', () => queueAgentTask().catch(error => setStatus('Agent queue failed', error.message)));
els.refreshButton.addEventListener('click', renderRecent);
els.proposalList?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-proposal-stage]');
  if (!button) return;
  updateProposalStage(button.dataset.proposalId, button.dataset.proposalStage)
    .catch(error => setStatus('Proposal update failed', error.message));
});
els.dictateButton.addEventListener('click', () => {
  if (!state.recognition) return;
  if (state.dictating) {
    state.recognition.stop();
    return;
  }
  state.dictating = true;
  els.dictateButton.textContent = 'Stop dictation';
  state.recognition.start();
});
els.recordButton.addEventListener('click', () => toggleRecording().catch(error => setStatus('Recording failed', error.message)));

setupDictation();
renderInference();
renderRecent();
subscribeCaptures();
subscribeProposals();
