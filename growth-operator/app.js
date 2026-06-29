const STORAGE_KEY = '3dvr.growthOperator.items.v1';
const TOKEN_STORAGE_KEY = '3dvr.growthOperator.operatorEmailToken.v1';
const ROOT_KEY = '3dvr-portal';
const OPERATOR_NODE = 'growthOperator';
const AGENT_OWNER_ALIAS = '3dvr-managed';
const DEFAULT_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];

const AUDIENCE_LEAD_SOURCES = Object.freeze([
  {
    key: 'forge-revenue-sprint',
    offer: '$300 Forge Revenue Sprint',
    nextStep: 'Review the messy brief and draft the first paid-offer reply.'
  },
  {
    key: 'lead-rescue-sprint',
    offer: '$300 Lead Rescue Sprint',
    nextStep: 'Review the lead leak and draft a short rescue-sprint reply.'
  },
  {
    key: 'client-onboarding-sprint',
    offer: '$300 Client Onboarding Sprint',
    nextStep: 'Review the onboarding break and draft a fit-check reply.'
  },
  {
    key: 'offer-audit',
    offer: '48-Hour Offer Audit',
    nextStep: 'Review the offer and draft the smallest paid audit next step.'
  },
  {
    key: 'ai-leverage',
    offer: 'AI leverage sprint',
    nextStep: 'Review the workflow pain and draft a simple leverage sprint reply.'
  },
  {
    key: 'freedom-from-work',
    offer: 'Project-shaping sprint',
    nextStep: 'Review the stuck-at-work context and draft a low-pressure project reply.'
  }
]);

const LANE_LABELS = Object.freeze({
  lead: 'Lead',
  support: 'Support',
  delivery: 'Delivery'
});

const STAGE_LABELS = Object.freeze({
  new: 'New',
  drafted: 'Drafted',
  approved: 'Approved',
  sent: 'Sent',
  working: 'Working',
  done: 'Done'
});

const state = {
  items: loadItems(),
  sendingId: '',
  queueing: false
};

const gun = typeof Gun === 'function' ? Gun(window.__GUN_PEERS__ || DEFAULT_PEERS) : null;
const portalRoot = gun ? gun.get(ROOT_KEY) : null;
const operatorRoot = portalRoot ? portalRoot.get(OPERATOR_NODE) : null;
const itemsRoot = operatorRoot ? operatorRoot.get('items') : null;
const audienceRoot = gun ? gun.get('3dvr-audience-tests').get('v1') : null;
const agentQueueRoot = portalRoot
  ? portalRoot.get('agentOps').get(AGENT_OWNER_ALIAS).get('taskQueue')
  : null;

const els = {
  syncStatus: document.getElementById('syncStatus'),
  form: document.getElementById('operatorForm'),
  itemName: document.getElementById('itemName'),
  itemEmail: document.getElementById('itemEmail'),
  itemLane: document.getElementById('itemLane'),
  itemOffer: document.getElementById('itemOffer'),
  itemContext: document.getElementById('itemContext'),
  operatorEmailToken: document.getElementById('operatorEmailToken'),
  findLeadsButton: document.getElementById('findLeadsButton'),
  supportTriageButton: document.getElementById('supportTriageButton'),
  deliveryPassButton: document.getElementById('deliveryPassButton'),
  draftAllButton: document.getElementById('draftAllButton'),
  queue: document.getElementById('operatorQueue'),
  leadQueueCount: document.getElementById('leadQueueCount'),
  readyEmailCount: document.getElementById('readyEmailCount'),
  supportQueueCount: document.getElementById('supportQueueCount'),
  deliveryQueueCount: document.getElementById('deliveryQueueCount'),
  mobileActions: Array.from(document.querySelectorAll('[data-mobile-action]'))
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function slug(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'item';
}

function makeId(prefix, seed = '') {
  return `${prefix}-${slug(seed)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Growth Operator local save failed.', error);
  }
}

function readStorageText(key) {
  try {
    return normalizeText(window.localStorage.getItem(key));
  } catch (_error) {
    return '';
  }
}

function loadItems() {
  const stored = loadJson(STORAGE_KEY, []);
  if (!Array.isArray(stored)) return {};
  return stored.reduce((output, item) => {
    const clean = normalizeItem(item);
    if (clean?.id) output[clean.id] = clean;
    return output;
  }, {});
}

function persistLocalItems() {
  saveJson(STORAGE_KEY, getItems().slice(0, 100));
}

function normalizeLane(value) {
  const lane = normalizeText(value).toLowerCase();
  return LANE_LABELS[lane] ? lane : 'lead';
}

function normalizeStage(value) {
  const stage = normalizeText(value).toLowerCase();
  return STAGE_LABELS[stage] ? stage : 'new';
}

function normalizeItem(value) {
  if (!value || typeof value !== 'object') return null;
  const name = normalizeText(value.name || value.business || value.title);
  const id = normalizeText(value.id);
  if (!id || !name) return null;
  return {
    id,
    name,
    email: normalizeEmail(value.email),
    lane: normalizeLane(value.lane || value.type),
    stage: normalizeStage(value.stage),
    offer: normalizeText(value.offer),
    context: normalizeText(value.context || value.notes || value.summary),
    draft: normalizeText(value.draft),
    nextStep: normalizeText(value.nextStep),
    source: normalizeText(value.source) || 'growth-operator',
    approvedAt: normalizeText(value.approvedAt),
    sentAt: normalizeText(value.sentAt),
    createdAt: normalizeText(value.createdAt),
    updatedAt: normalizeText(value.updatedAt)
  };
}

function getItems() {
  return Object.values(state.items)
    .map(normalizeItem)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
}

function updateStatus(message) {
  if (els.syncStatus) {
    els.syncStatus.textContent = message;
  }
}

function putGun(node, payload) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.put !== 'function') {
      reject(new Error('Gun is unavailable.'));
      return;
    }
    const timer = window.setTimeout(() => resolve({ timedOut: true }), 6000);
    node.put(payload, (ack) => {
      window.clearTimeout(timer);
      if (ack?.err) {
        reject(new Error(String(ack.err)));
      } else {
        resolve(ack || {});
      }
    });
  });
}

function cleanGunRecord(record) {
  if (!record || typeof record !== 'object') return null;
  const { _, ...clean } = record;
  return clean;
}

function firstName(value) {
  return normalizeText(value).split(/\s+/)[0] || 'there';
}

function planFromOffer(offer) {
  const text = normalizeText(offer).toLowerCase();
  if (text.includes('200') || text.includes('embedded') || text.includes('enterprise')) return 'embedded';
  if (text.includes('50') || text.includes('builder')) return 'builder';
  if (text.includes('20') || text.includes('launch') || text.includes('founder')) return 'pro';
  if (text.includes('5') || text.includes('starter') || text.includes('friend')) return 'starter';
  return '';
}

function billingPlanUrl(offer) {
  const plan = planFromOffer(offer);
  return plan ? `${window.location.origin}/billing/?plan=${encodeURIComponent(plan)}` : '';
}

function buildDraft(item) {
  const name = firstName(item.name);
  if (item.lane === 'support') {
    return [
      `Hey ${name}, I saw this and I am checking it now.`,
      '',
      item.context || 'I am going to confirm what changed, what account or workflow it affects, and the next fix.',
      '',
      'I will keep the next step clear so this does not get lost.'
    ].join('\n');
  }

  if (item.lane === 'delivery') {
    return [
      `Hey ${name}, quick delivery update from 3dvr.tech.`,
      '',
      item.context || 'I am turning this into the next visible result and will keep the scope small enough to finish.',
      '',
      'The next useful update will be a link, screenshot, or checklist item you can react to.'
    ].join('\n');
  }

  const billingUrl = billingPlanUrl(item.offer);
  return [
    `Hey ${name}, quick 3dvr.tech thought.`,
    '',
    item.context || 'I think there is a simple way to help with your site, tech setup, or follow-up flow without making it complicated.',
    item.offer ? `The smallest useful lane looks like ${item.offer}.` : 'The first step can stay small.',
    '',
    billingUrl ? `Start here if you want to make it official: ${billingUrl}` : 'Want me to send the simplest next step?'
  ].filter(Boolean).join('\n');
}

function audienceLeadId(sourceKey, lead) {
  const sourceId = normalizeText(lead?.id) || `${normalizeEmail(lead?.email)}-${normalizeText(lead?.createdAt)}`;
  return `audience-${sourceKey}-${slug(sourceId)}`;
}

function normalizeAudienceLead(source, lead) {
  if (!source || !lead || typeof lead !== 'object') return null;
  const name = normalizeText(lead.name || lead.company || lead.business);
  const email = normalizeEmail(lead.email);
  if (!name || !email) return null;

  const promptLabel = normalizeText(lead.promptLabel) || 'Fit-check note';
  const prompt = normalizeText(lead.prompt);
  const audienceLabel = normalizeText(lead.audienceLabel) || source.key;
  const sourceLabel = normalizeText(lead.source) || 'Audience fit check';
  const createdAt = normalizeText(lead.createdAt) || new Date().toISOString();
  const context = [
    `${audienceLabel} fit-check from ${sourceLabel}.`,
    prompt ? `${promptLabel}: ${prompt}` : '',
    normalizeText(lead.referrer) ? `Referrer: ${normalizeText(lead.referrer)}` : ''
  ].filter(Boolean).join('\n\n');

  const item = {
    id: audienceLeadId(source.key, lead),
    name,
    email,
    lane: 'lead',
    stage: 'drafted',
    offer: source.offer,
    context,
    draft: '',
    nextStep: source.nextStep,
    source: `audience:${source.key}`,
    approvedAt: '',
    sentAt: '',
    createdAt,
    updatedAt: new Date().toISOString()
  };
  item.draft = buildDraft(item);
  return normalizeItem(item);
}

function buildItemFromForm() {
  const name = normalizeText(els.itemName.value);
  if (!name) {
    throw new Error('Add a name or business first.');
  }

  const now = new Date().toISOString();
  const lane = normalizeLane(els.itemLane.value);
  const item = {
    id: makeId('growth', name),
    name,
    email: normalizeEmail(els.itemEmail.value),
    lane,
    stage: 'new',
    offer: normalizeText(els.itemOffer.value),
    context: normalizeText(els.itemContext.value),
    draft: '',
    nextStep: lane === 'lead' ? 'Draft one specific outreach note.' : 'Clarify the next customer-visible step.',
    source: 'growth-operator',
    approvedAt: '',
    sentAt: '',
    createdAt: now,
    updatedAt: now
  };
  item.draft = buildDraft(item);
  item.stage = lane === 'lead' ? 'drafted' : 'working';
  return item;
}

async function saveItem(item, statusMessage = '') {
  const clean = normalizeItem(item);
  if (!clean) return;
  state.items[clean.id] = clean;
  persistLocalItems();
  render();

  try {
    await putGun(itemsRoot.get(clean.id), clean);
    updateStatus(statusMessage || `Saved ${clean.name} to 3dvr-portal/growthOperator/items.`);
  } catch (error) {
    updateStatus(`${statusMessage || `Saved ${clean.name} locally.`} ${error.message || 'Gun sync failed.'}`);
  }
}

async function addItem(event) {
  event.preventDefault();
  let item;
  try {
    item = buildItemFromForm();
  } catch (error) {
    updateStatus(error.message);
    return;
  }

  await saveItem(item, `Added ${item.name} to the ${LANE_LABELS[item.lane]} lane.`);
  els.form.reset();
}

function buildAgentTask(kind, item = null) {
  const now = new Date().toISOString();
  const taskId = makeId(`growth-${kind}`, item?.name || kind);
  const taskLines = [
    `Run the 3DVR Growth Operator task: ${kind}.`,
    '',
    'Use these source paths first:',
    '- 3dvr-portal/growthOperator/items',
    '- 3dvr-portal/money-ai/opportunities',
    '- 3dvr-portal/proposals',
    '- 3dvr-portal/memoryCapture/captures',
    '- 3dvr-crm',
    '- 3dvr-portal/emailOperator/operators',
    '- 3dvr-portal/finance/stripe/metrics/latest',
    '',
    'Rules:',
    '- Do not mass email.',
    '- Prefer warm, relevant, publicly contactable leads.',
    '- Prepare short personal drafts and wait for approval before sending.',
    '- If doing support or delivery, create the next visible customer result.',
    '',
    item ? `Target item: ${JSON.stringify(item)}` : '',
    '',
    'Return practical output: records to add, drafts to review, support issues, delivery tasks, and one recommended next action.'
  ];

  if (kind === 'find-leads') {
    taskLines.push('Find 10 likely-fit 3dvr.tech leads from public sources, existing CRM gaps, market research, and referral context.');
  }
  if (kind === 'draft-outreach') {
    taskLines.push('Draft the next approved outreach note for each lead with an email or clear contact path.');
  }
  if (kind === 'support-triage') {
    taskLines.push('Review customer service issues, billing confusion, account problems, and unanswered replies. Draft replies, do not send.');
  }
  if (kind === 'delivery-pass') {
    taskLines.push('Review paid or promising customers and create delivery steps that produce visible progress this week.');
  }

  return {
    id: taskId,
    task: taskLines.filter(Boolean).join('\n'),
    tenantId: 'portal:growth-operator',
    tenantAlias: readStorageText('alias') || readStorageText('username') || 'growth-operator',
    tenantPlan: 'builder',
    backend: 'codex',
    repo: 'tmsteph/3dvr-portal',
    model: '',
    thinking: 'high',
    unsafe: false,
    riskClass: 'workspace_write',
    approvalStatus: 'not_required',
    requiredCapabilities: 'codex,crm,email,gun,stripe',
    maxRuntimeMs: 0,
    status: 'queued',
    requestedBy: 'growth-operator',
    createdAt: now,
    updatedAt: now,
    resultSummary: '',
    error: '',
    workerDeviceId: ''
  };
}

async function queueAgentTask(kind, item = null) {
  if (state.queueing) return;
  state.queueing = true;
  const task = buildAgentTask(kind, item);
  try {
    await putGun(agentQueueRoot.get(task.id), task);
    await putGun(agentQueueRoot.get('latest'), { id: task.id, kind, updatedAt: task.updatedAt });
    updateStatus(`Queued agent task: ${kind}.`);
  } catch (error) {
    updateStatus(`Agent task not queued. ${error.message || 'Gun sync failed.'}`);
  } finally {
    state.queueing = false;
  }
}

async function updateItem(id, patch) {
  const existing = normalizeItem(state.items[id]);
  if (!existing) return;
  const updated = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await saveItem(updated);
}

async function draftAll() {
  const targets = getItems().filter(item => item.lane === 'lead' && item.stage !== 'sent' && item.stage !== 'done');
  for (const item of targets) {
    await updateItem(item.id, {
      draft: buildDraft(item),
      stage: item.stage === 'approved' ? 'approved' : 'drafted'
    });
  }
  await queueAgentTask('draft-outreach');
}

function readOperatorToken() {
  return normalizeText(els.operatorEmailToken?.value) || readStorageText(TOKEN_STORAGE_KEY);
}

function persistOperatorToken() {
  try {
    const token = normalizeText(els.operatorEmailToken?.value);
    if (token) {
      window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch (_error) {
    // Ignore private mode storage failures.
  }
}

async function sendApprovedEmail(item) {
  if (!item.email) {
    updateStatus(`Add an email before sending to ${item.name}.`);
    return;
  }
  if (item.stage !== 'approved') {
    updateStatus(`Approve ${item.name}'s draft before sending.`);
    return;
  }

  const token = readOperatorToken();
  if (!token) {
    updateStatus('Add the operator email token before using direct send.');
    return;
  }

  state.sendingId = item.id;
  render();
  try {
    const response = await fetch('/api/calendar/reminder-email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        mode: 'lead-outreach',
        to: [item.email],
        subject: `3dvr.tech next step for ${item.name}`,
        headline: 'Quick note from 3DVR',
        text: item.draft || buildDraft(item),
        senderName: 'Thomas @ 3DVR',
        senderEmail: '3dvr.tech@gmail.com'
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || `Email route responded with ${response.status}`);
    }
    await updateItem(item.id, {
      stage: 'sent',
      sentAt: new Date().toISOString(),
      nextStep: 'Watch for reply and log the next real response.'
    });
    updateStatus(`Sent approved email to ${item.name}.`);
  } catch (error) {
    updateStatus(`Email not sent. ${error.message || 'Check mail configuration.'}`);
  } finally {
    state.sendingId = '';
    render();
  }
}

function renderMetrics() {
  const items = getItems();
  els.leadQueueCount.textContent = String(items.filter(item => item.lane === 'lead' && item.stage !== 'done').length);
  els.readyEmailCount.textContent = String(items.filter(item => item.stage === 'approved').length);
  els.supportQueueCount.textContent = String(items.filter(item => item.lane === 'support' && item.stage !== 'done').length);
  els.deliveryQueueCount.textContent = String(items.filter(item => item.lane === 'delivery' && item.stage !== 'done').length);
}

function renderQueue() {
  const items = getItems();
  if (!items.length) {
    els.queue.innerHTML = '<p class="empty">No operator items yet.</p>';
    return;
  }

  els.queue.innerHTML = items.map(item => {
    const isSending = state.sendingId === item.id;
    return `
      <article class="queue-item" data-item-id="${safe(item.id)}" data-lane="${safe(item.lane)}">
        <div class="queue-top">
          <div>
            <small>${safe(LANE_LABELS[item.lane])} / ${safe(STAGE_LABELS[item.stage])}</small>
            <strong>${safe(item.name)}</strong>
            <p>${safe(item.context || item.nextStep || 'No context yet.')}</p>
          </div>
          <div class="queue-meta">
            ${item.email ? `<span>${safe(item.email)}</span>` : '<span>No email</span>'}
            ${item.offer ? `<span>${safe(item.offer)}</span>` : ''}
          </div>
        </div>
        <div class="draft-box">${safe(item.draft || buildDraft(item))}</div>
        <div class="item-actions">
          <button type="button" data-action="draft" data-item-id="${safe(item.id)}">Draft</button>
          <button type="button" data-action="approve" data-item-id="${safe(item.id)}">Approve</button>
          <button type="button" data-action="send" data-item-id="${safe(item.id)}" ${isSending ? 'disabled' : ''}>${isSending ? 'Sending...' : 'Send approved'}</button>
          <button type="button" data-action="queue-agent" data-item-id="${safe(item.id)}">Queue agent</button>
          <button type="button" data-action="done" data-item-id="${safe(item.id)}">Done</button>
        </div>
      </article>
    `;
  }).join('');
}

function render() {
  renderMetrics();
  renderQueue();
}

function subscribeGun() {
  if (!itemsRoot) {
    updateStatus('Gun unavailable. Growth Operator is using local storage only.');
    return;
  }

  itemsRoot.map().on((item) => {
    const clean = normalizeItem(cleanGunRecord(item));
    if (!clean?.id) return;
    state.items[clean.id] = clean;
    persistLocalItems();
    render();
  });

  updateStatus('Gun sync: connected to 3dvr-portal/growthOperator/items.');
}

function subscribeAudienceLeads() {
  if (!audienceRoot || !itemsRoot) {
    return;
  }

  AUDIENCE_LEAD_SOURCES.forEach(source => {
    audienceRoot.get(source.key).get('signups').map().on(async (record) => {
      const lead = normalizeAudienceLead(source, cleanGunRecord(record));
      if (!lead?.id) return;

      const existing = normalizeItem(state.items[lead.id]);
      if (existing) return;

      state.items[lead.id] = lead;
      persistLocalItems();
      render();

      try {
        await putGun(itemsRoot.get(lead.id), lead);
        updateStatus(`Imported ${lead.name} from ${source.offer} fit-checks.`);
      } catch (error) {
        updateStatus(`Imported ${lead.name} locally. ${error.message || 'Gun sync failed.'}`);
      }
    });
  });
}

function bindEvents() {
  els.form?.addEventListener('submit', addItem);
  els.operatorEmailToken?.addEventListener('input', persistOperatorToken);
  els.findLeadsButton?.addEventListener('click', () => queueAgentTask('find-leads'));
  els.supportTriageButton?.addEventListener('click', () => queueAgentTask('support-triage'));
  els.deliveryPassButton?.addEventListener('click', () => queueAgentTask('delivery-pass'));
  els.draftAllButton?.addEventListener('click', draftAll);
  els.mobileActions.forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.mobileAction;
      if (action === 'find-leads') queueAgentTask('find-leads');
      if (action === 'draft-all') draftAll();
      if (action === 'support') queueAgentTask('support-triage');
      if (action === 'delivery') queueAgentTask('delivery-pass');
    });
  });

  els.queue?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action][data-item-id]');
    if (!button) return;
    const item = normalizeItem(state.items[button.dataset.itemId]);
    if (!item) return;
    const action = button.dataset.action;
    if (action === 'draft') {
      await updateItem(item.id, { draft: buildDraft(item), stage: item.stage === 'approved' ? 'approved' : 'drafted' });
    }
    if (action === 'approve') {
      await updateItem(item.id, { draft: item.draft || buildDraft(item), stage: 'approved', approvedAt: new Date().toISOString() });
    }
    if (action === 'send') {
      await sendApprovedEmail(item);
    }
    if (action === 'queue-agent') {
      await queueAgentTask(item.lane === 'support' ? 'support-triage' : item.lane === 'delivery' ? 'delivery-pass' : 'draft-outreach', item);
    }
    if (action === 'done') {
      await updateItem(item.id, { stage: 'done', nextStep: 'Done for now.' });
    }
  });
}

function init() {
  const storedToken = readStorageText(TOKEN_STORAGE_KEY);
  if (els.operatorEmailToken && storedToken) {
    els.operatorEmailToken.value = storedToken;
  }
  bindEvents();
  render();
  subscribeGun();
  subscribeAudienceLeads();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}
