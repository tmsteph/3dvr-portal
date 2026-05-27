import { formatSyncTimestamp } from '../finance/stripe-sync.js';

const REVENUE_STORAGE_KEY = '3dvr.revenueDesk.snapshot.v1';
const PROPOSAL_STORAGE_KEY = '3dvr.revenueDesk.proposals.v1';
const ROOT_KEY = '3dvr-portal';
const REVENUE_NODE = 'revenue-desk';
const PROPOSALS_NODE = 'proposals';
const MEMORY_CAPTURE_NODE = 'memoryCapture';
const TOUCH_LOG_NODE = 'crm-touch-log';
const AGENT_OWNER_ALIAS = '3dvr-managed';
const DEFAULT_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];

const PLAN_PRICES = Object.freeze({
  starter: 5,
  pro: 20,
  builder: 50,
  embedded: 200
});

const OPEN_STAGES = ['idea', 'draft', 'sent', 'follow-up'];
const STAGE_LABELS = Object.freeze({
  idea: 'Idea',
  draft: 'Draft',
  sent: 'Sent',
  'follow-up': 'Follow-up',
  won: 'Won',
  lost: 'Lost / later'
});

const state = {
  snapshot: loadSnapshot(),
  proposals: loadLocalProposals(),
  recentCaptures: {},
  touchLog: {},
  stripeMetrics: {
    available: {},
    pending: {},
    recurringRevenue: {},
    activeSubscribers: 0,
    updatedAt: '',
    loaded: false
  },
  stripeRefreshInFlight: false
};

const gun = typeof Gun === 'function' ? Gun(window.__GUN_PEERS__ || DEFAULT_PEERS) : null;
const portalRoot = gun ? gun.get(ROOT_KEY) : null;
const revenueRoot = portalRoot ? portalRoot.get(REVENUE_NODE) : null;
const proposalRoot = portalRoot ? portalRoot.get(PROPOSALS_NODE) : null;
const captureRoot = portalRoot ? portalRoot.get(MEMORY_CAPTURE_NODE).get('captures') : null;
const touchLogRoot = portalRoot ? portalRoot.get(TOUCH_LOG_NODE) : null;
const stripeMetricsRoot = portalRoot
  ? portalRoot.get('finance').get('stripe').get('metrics').get('latest')
  : null;
const agentQueueRoot = portalRoot
  ? portalRoot.get('agentOps').get(AGENT_OWNER_ALIAS).get('taskQueue')
  : null;

const els = {
  syncStatus: document.getElementById('syncStatus'),
  revenueForm: document.getElementById('revenueForm'),
  customSprintRevenue: document.getElementById('customSprintRevenue'),
  mrrValue: document.getElementById('mrrValue'),
  stripeMrrValue: document.getElementById('stripeMrrValue'),
  stripeSubscriberValue: document.getElementById('stripeSubscriberValue'),
  stripeBalanceValue: document.getElementById('stripeBalanceValue'),
  stripeSyncStatus: document.getElementById('stripeSyncStatus'),
  stripeRefreshButton: document.getElementById('stripeRefreshButton'),
  projectRevenueValue: document.getElementById('projectRevenueValue'),
  monthlyEngineValue: document.getElementById('monthlyEngineValue'),
  milestoneValue: document.getElementById('milestoneValue'),
  nextMoveBody: document.getElementById('nextMoveBody'),
  automationStatus: document.getElementById('automationStatus'),
  dailyBriefList: document.getElementById('dailyBriefList'),
  proposalForm: document.getElementById('proposalForm'),
  proposalDrawer: document.getElementById('proposalDrawer'),
  proposalPerson: document.getElementById('proposalPerson'),
  proposalOffer: document.getElementById('proposalOffer'),
  proposalAmount: document.getElementById('proposalAmount'),
  proposalStage: document.getElementById('proposalStage'),
  proposalFollowUp: document.getElementById('proposalFollowUp'),
  proposalNextStep: document.getElementById('proposalNextStep'),
  proposalBoard: document.getElementById('proposalBoard'),
  openProposalCount: document.getElementById('openProposalCount'),
  sentProposalCount: document.getElementById('sentProposalCount'),
  wonProposalCount: document.getElementById('wonProposalCount'),
  openProposalValue: document.getElementById('openProposalValue'),
  prefillFromCaptureButton: document.getElementById('prefillFromCaptureButton'),
  agentBriefButtons: Array.from(document.querySelectorAll('[data-agent-brief-button]'))
};

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeCount(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeMoney(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function slug(value) {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 54) || 'item';
}

function makeId(prefix, seed = '') {
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${slug(seed)}-${Date.now().toString(36)}-${random}`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMoney(value) {
  const amount = normalizeMoney(value);
  return `$${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function normalizeStripeTotals(rawTotals) {
  if (!rawTotals || typeof rawTotals !== 'object') {
    return {};
  }

  return Object.entries(rawTotals).reduce((output, [currency, amount]) => {
    if (currency === '_' || typeof amount === 'function') return output;
    const normalizedCurrency = String(currency || '').trim().toUpperCase();
    const numeric = Number(amount);
    if (normalizedCurrency && Number.isFinite(numeric)) {
      output[normalizedCurrency] = numeric;
    }
    return output;
  }, {});
}

function formatStripeTotals(rawTotals) {
  const totals = normalizeStripeTotals(rawTotals);
  const entries = Object.entries(totals).filter(([, amount]) => Number.isFinite(amount));
  if (!entries.length) return { label: '—', amount: 0, currency: 'USD' };

  const [currency, amount] = entries.find(([code]) => code === 'USD') || entries[0];
  let formatter;
  try {
    formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2
    });
  } catch (_error) {
    formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    });
  }

  return {
    label: formatter.format(amount / 100),
    amount,
    currency
  };
}

function getStripeMrrDollars() {
  const totals = formatStripeTotals(state.stripeMetrics.recurringRevenue);
  return totals.amount > 0 ? Math.round(totals.amount / 100) : 0;
}

function getLatestCapture() {
  return Object.values(state.recentCaptures)
    .filter(capture => capture && typeof capture === 'object')
    .sort((a, b) => {
      const left = Date.parse(String(a.updatedAt || a.createdAt || '')) || 0;
      const right = Date.parse(String(b.updatedAt || b.createdAt || '')) || 0;
      return right - left;
    })[0] || null;
}

function estimateProposalValueFromOffer(offer) {
  const text = normalizeText(offer).toLowerCase();
  if (text.includes('200')) return 200;
  if (text.includes('50')) return 50;
  if (text.includes('20')) return 20;
  if (text.includes('5')) return 5;
  return 0;
}

function loadJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (error) {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('Revenue Desk local save failed.', error);
  }
}

function loadSnapshot() {
  const fallback = {
    planCounts: { starter: 0, pro: 0, builder: 0, embedded: 0 },
    customSprintRevenue: 0,
    updatedAt: ''
  };
  const stored = loadJson(REVENUE_STORAGE_KEY, fallback);
  return {
    planCounts: {
      starter: normalizeCount(stored?.planCounts?.starter),
      pro: normalizeCount(stored?.planCounts?.pro),
      builder: normalizeCount(stored?.planCounts?.builder),
      embedded: normalizeCount(stored?.planCounts?.embedded)
    },
    customSprintRevenue: normalizeMoney(stored?.customSprintRevenue),
    updatedAt: normalizeText(stored?.updatedAt)
  };
}

function loadLocalProposals() {
  const stored = loadJson(PROPOSAL_STORAGE_KEY, []);
  if (!Array.isArray(stored)) return {};
  return stored.reduce((output, proposal) => {
    const clean = normalizeProposal(proposal);
    if (clean?.id) output[clean.id] = clean;
    return output;
  }, {});
}

function persistLocalProposals() {
  saveJson(PROPOSAL_STORAGE_KEY, getProposals().slice(0, 100));
}

function calculateMrr(snapshot = state.snapshot) {
  return Object.entries(PLAN_PRICES).reduce((total, [plan, price]) => {
    return total + normalizeCount(snapshot.planCounts?.[plan]) * price;
  }, 0);
}

function getMilestone(totalMonthlyRevenue) {
  if (totalMonthlyRevenue >= 6000) return 'Productized studio';
  if (totalMonthlyRevenue >= 1325) return 'Real monthly engine';
  if (totalMonthlyRevenue >= 550) return 'Side-business profitability';
  if (totalMonthlyRevenue >= 100) return 'First reliable signal';
  return 'First signal';
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
      if (ack && ack.err) {
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

function normalizeProposal(value) {
  if (!value || typeof value !== 'object') return null;
  const id = normalizeText(value.id);
  if (!id) return null;
  const stage = normalizeText(value.status || value.stage || 'idea');
  const amount = normalizeMoney(value.estimatedValue || value.price || value.amount);
  return {
    id,
    title: normalizeText(value.title) || `${normalizeText(value.person || value.name) || 'Proposal'} proposal`,
    person: normalizeText(value.person || value.name || value.title),
    status: STAGE_LABELS[stage] ? stage : 'idea',
    offer: normalizeText(value.offer),
    scope: normalizeText(value.scope),
    nextBestAction: normalizeText(value.nextBestAction || value.nextStep),
    price: amount ? String(amount) : '',
    estimatedValue: amount,
    followUpAt: normalizeText(value.followUpAt || value.followUpDate),
    source: normalizeText(value.source) || 'revenue-desk',
    notes: normalizeText(value.notes),
    createdAt: normalizeText(value.createdAt),
    updatedAt: normalizeText(value.updatedAt)
  };
}

function getProposals() {
  return Object.values(state.proposals)
    .map(normalizeProposal)
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function isDue(dateString) {
  const date = normalizeText(dateString);
  return Boolean(date) && date <= todayDate();
}

function hydrateForm() {
  for (const [plan, count] of Object.entries(state.snapshot.planCounts)) {
    const input = document.querySelector(`[data-plan-input="${plan}"]`);
    if (input) input.value = String(count || '');
  }
  els.customSprintRevenue.value = state.snapshot.customSprintRevenue ? String(state.snapshot.customSprintRevenue) : '';
  els.proposalFollowUp.value = addDays(3);
}

async function saveRevenueSnapshot(event) {
  event?.preventDefault();
  const snapshot = {
    planCounts: {
      starter: normalizeCount(document.querySelector('[data-plan-input="starter"]')?.value),
      pro: normalizeCount(document.querySelector('[data-plan-input="pro"]')?.value),
      builder: normalizeCount(document.querySelector('[data-plan-input="builder"]')?.value),
      embedded: normalizeCount(document.querySelector('[data-plan-input="embedded"]')?.value)
    },
    customSprintRevenue: normalizeMoney(els.customSprintRevenue.value),
    updatedAt: new Date().toISOString()
  };

  state.snapshot = snapshot;
  saveJson(REVENUE_STORAGE_KEY, snapshot);
  render();

  try {
    await putGun(revenueRoot.get('state'), snapshot);
    updateStatus('Gun synced: saved revenue snapshot to 3dvr-portal/revenue-desk/state.');
  } catch (error) {
    updateStatus(`Local snapshot saved. ${error.message || 'Gun sync failed.'}`);
  }
}

function buildProposalFromForm() {
  const person = normalizeText(els.proposalPerson.value);
  if (!person) {
    throw new Error('Add the person or business before creating a proposal.');
  }

  const now = new Date().toISOString();
  const amount = normalizeMoney(els.proposalAmount.value);
  return {
    id: makeId('proposal', person),
    title: `${person} proposal`,
    person,
    status: normalizeText(els.proposalStage.value) || 'idea',
    offer: normalizeText(els.proposalOffer.value) || 'Offer needs shape',
    scope: 'Created from Revenue Desk.',
    nextBestAction: normalizeText(els.proposalNextStep.value) || 'Ask one tiny next question.',
    price: amount ? String(amount) : '',
    estimatedValue: amount,
    followUpAt: normalizeText(els.proposalFollowUp.value) || addDays(3),
    source: 'revenue-desk',
    notes: '',
    createdAt: now,
    updatedAt: now
  };
}

async function addProposal(event) {
  event.preventDefault();
  let proposal;
  try {
    proposal = buildProposalFromForm();
  } catch (error) {
    updateStatus(error.message);
    return;
  }

  state.proposals[proposal.id] = proposal;
  persistLocalProposals();
  render();

  try {
    await putGun(proposalRoot.get(proposal.id), proposal);
    updateStatus(`Gun synced: added proposal for ${proposal.person}.`);
  } catch (error) {
    updateStatus(`Proposal saved locally. ${error.message || 'Gun sync failed.'}`);
  }

  els.proposalForm.reset();
  els.proposalFollowUp.value = addDays(3);
}

async function updateProposalStage(id, stage) {
  const proposal = normalizeProposal(state.proposals[id]);
  if (!proposal || !STAGE_LABELS[stage]) return;

  const updated = {
    ...proposal,
    status: stage,
    updatedAt: new Date().toISOString(),
    closedAt: stage === 'won' || stage === 'lost' ? new Date().toISOString() : ''
  };

  state.proposals[id] = updated;
  persistLocalProposals();
  render();

  try {
    await putGun(proposalRoot.get(id), updated);
    updateStatus(`Gun synced: ${proposal.person || proposal.title} moved to ${STAGE_LABELS[stage]}.`);
  } catch (error) {
    updateStatus(`Stage saved locally. ${error.message || 'Gun sync failed.'}`);
  }
}

function buildAgentDailyBriefTask() {
  const mrr = calculateMrr();
  const openProposals = getProposals().filter(proposal => OPEN_STAGES.includes(proposal.status));
  const dueProposals = openProposals.filter(proposal => isDue(proposal.followUpAt));
  const taskLines = [
    'Create a practical 3DVR daily revenue brief.',
    '',
    'Use the portal state first: CRM, crm-touch-log, memoryCapture, proposals, sales scoreboard, and revenue-desk.',
    'Also check private 3dvr-ops if available to compare people next steps.',
    '',
    `Current manual MRR: ${formatMoney(mrr)}`,
    `Custom sprint revenue this period: ${formatMoney(state.snapshot.customSprintRevenue)}`,
    `Open proposals: ${openProposals.length}`,
    `Due proposals: ${dueProposals.length}`,
    '',
    'Return:',
    '- top 5 people to follow up with',
    '- one message draft per person',
    '- proposals that need action',
    '- one revenue move for today',
    '- anything that should be hidden or paused'
  ];

  const id = makeId('revenue-brief', todayDate());
  return {
    id,
    task: taskLines.join('\n'),
    tenantId: 'portal:revenue-desk',
    tenantAlias: window.localStorage.getItem('alias') || window.localStorage.getItem('username') || 'revenue-desk',
    tenantPlan: 'builder',
    backend: 'codex',
    repo: 'tmsteph/3dvr-portal',
    model: '',
    thinking: 'high',
    unsafe: false,
    riskClass: 'workspace_write',
    approvalStatus: 'not_required',
    requiredCapabilities: 'codex,crm,gun',
    maxRuntimeMs: 0,
    status: 'queued',
    requestedBy: 'revenue-desk',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resultSummary: '',
    error: '',
    workerDeviceId: ''
  };
}

async function queueAgentDailyBrief() {
  const task = buildAgentDailyBriefTask();
  try {
    await putGun(agentQueueRoot.get(task.id), task);
    await putGun(agentQueueRoot.get('latest'), { id: task.id, updatedAt: task.updatedAt });
    updateStatus(`Agent daily brief queued: ${task.id}`);
  } catch (error) {
    updateStatus(`Agent brief not queued. ${error.message || 'Gun sync failed.'}`);
  }
}

function renderMetrics() {
  const mrr = calculateMrr();
  const stripeMrr = getStripeMrrDollars();
  const liveMrr = stripeMrr || mrr;
  const projectRevenue = normalizeMoney(state.snapshot.customSprintRevenue);
  const total = liveMrr + projectRevenue;
  const stripeBalance = formatStripeTotals(state.stripeMetrics.available);
  const stripeMrrTotals = formatStripeTotals(state.stripeMetrics.recurringRevenue);
  els.mrrValue.textContent = formatMoney(mrr);
  els.stripeMrrValue.textContent = state.stripeMetrics.loaded ? stripeMrrTotals.label : '—';
  els.stripeSubscriberValue.textContent = state.stripeMetrics.loaded
    ? normalizeCount(state.stripeMetrics.activeSubscribers).toLocaleString()
    : '—';
  els.stripeBalanceValue.textContent = state.stripeMetrics.loaded ? stripeBalance.label : '—';
  els.projectRevenueValue.textContent = formatMoney(projectRevenue);
  els.monthlyEngineValue.textContent = formatMoney(total);
  els.milestoneValue.textContent = getMilestone(total);

  if (els.stripeSyncStatus) {
    els.stripeSyncStatus.innerHTML = state.stripeMetrics.loaded
      ? `Stripe data synced from finance metrics ${safe(formatSyncTimestamp(state.stripeMetrics.updatedAt))}.`
      : 'Stripe data loads from <code>3dvr-portal/finance/stripe/metrics/latest</code>.';
  }
}

function renderNextMove() {
  if (!els.nextMoveBody) return;

  const proposals = getProposals();
  const open = proposals.filter(proposal => OPEN_STAGES.includes(proposal.status));
  const due = open.filter(proposal => isDue(proposal.followUpAt));
  const latestCapture = getLatestCapture();

  if (due.length) {
    const proposal = due[0];
    els.nextMoveBody.textContent = `${proposal.person || proposal.title}: ${proposal.nextBestAction || 'Send one tiny follow-up.'}`;
    return;
  }

  if (latestCapture?.inference?.nextBestAction) {
    els.nextMoveBody.textContent = `${latestCapture.inference.name || 'Latest capture'}: ${latestCapture.inference.nextBestAction}`;
    return;
  }

  if (open.length) {
    const proposal = open[0];
    els.nextMoveBody.textContent = `${proposal.person || proposal.title}: ${proposal.nextBestAction || 'Ask one tiny next question.'}`;
    return;
  }

  els.nextMoveBody.textContent = 'Capture the next real conversation, then let the desk turn it into a follow-up or proposal.';
}

function renderDailyBrief() {
  const proposals = getProposals();
  const open = proposals.filter(proposal => OPEN_STAGES.includes(proposal.status));
  const due = open.filter(proposal => isDue(proposal.followUpAt));
  const mrr = calculateMrr();
  const items = [];

  if (due.length) {
    items.push({
      tone: 'urgent',
      title: `${due.length} proposal${due.length === 1 ? '' : 's'} need follow-up`,
      body: due.slice(0, 3).map(proposal => proposal.person || proposal.title).join(', ')
    });
  }

  if (open.length) {
    const top = open[0];
    items.push({
      tone: 'money',
      title: 'Move the highest-value open proposal',
      body: `${top.person || top.title}: ${top.nextBestAction || 'Ask one tiny next question.'}`
    });
  }

  if (mrr < 100) {
    items.push({
      tone: 'money',
      title: 'Milestone 1 needs more paid signal',
      body: 'Ask one warm-network person to choose the $5 or $20 lane today.'
    });
  } else {
    items.push({
      tone: 'money',
      title: `Current MRR is ${formatMoney(mrr)}`,
      body: 'Protect retention by shipping one visible customer result this week.'
    });
  }

  if (!Object.keys(state.recentCaptures).length) {
    items.push({
      tone: 'normal',
      title: 'Capture the next real conversation',
      body: 'Open Memory Capture after the next work, friend, or customer conversation.'
    });
  }

  els.dailyBriefList.innerHTML = items.map(item => `
    <article class="brief-item" data-tone="${safe(item.tone)}">
      <strong>${safe(item.title)}</strong>
      <p>${safe(item.body)}</p>
    </article>
  `).join('');
}

function renderProposals() {
  const proposals = getProposals();
  const open = proposals.filter(proposal => OPEN_STAGES.includes(proposal.status));
  const sent = proposals.filter(proposal => proposal.status === 'sent' || proposal.status === 'follow-up');
  const won = proposals.filter(proposal => proposal.status === 'won');
  const openValue = open.reduce((total, proposal) => total + normalizeMoney(proposal.estimatedValue), 0);

  els.openProposalCount.textContent = String(open.length);
  els.sentProposalCount.textContent = String(sent.length);
  els.wonProposalCount.textContent = String(won.length);
  els.openProposalValue.textContent = formatMoney(openValue);

  if (!proposals.length) {
    els.proposalBoard.innerHTML = '<p class="empty">No proposals yet. Add the first warm lead or create one from Memory Capture.</p>';
    return;
  }

  els.proposalBoard.innerHTML = proposals.slice(0, 40).map(proposal => {
    const stageButtons = Object.keys(STAGE_LABELS)
      .filter(stage => stage !== proposal.status)
      .map(stage => `<button type="button" data-proposal-id="${safe(proposal.id)}" data-proposal-stage="${safe(stage)}">${safe(STAGE_LABELS[stage])}</button>`)
      .join('');

    return `
      <article class="proposal-card" data-proposal-id="${safe(proposal.id)}">
        <div>
          <small>${safe(STAGE_LABELS[proposal.status] || proposal.status)}</small>
          <strong>${safe(proposal.person || proposal.title)}</strong>
          <p>${safe(proposal.nextBestAction || 'Ask one tiny next question.')}</p>
        </div>
        <dl class="proposal-meta">
          <div><dt>Offer</dt><dd>${safe(proposal.offer || 'TBD')}</dd></div>
          <div><dt>Value</dt><dd>${safe(formatMoney(proposal.estimatedValue))}</dd></div>
          <div><dt>Follow-up</dt><dd>${safe(proposal.followUpAt || 'Unset')}</dd></div>
          <div><dt>Source</dt><dd>${safe(proposal.source || 'revenue-desk')}</dd></div>
        </dl>
        <div class="proposal-actions">${stageButtons}</div>
      </article>
    `;
  }).join('');
}

function render() {
  renderMetrics();
  renderProposals();
  renderDailyBrief();
  renderNextMove();
}

function applyStripeMetricsPatch(patch) {
  if (!patch || typeof patch !== 'object') return;

  const available = normalizeStripeTotals(patch.available);
  const pending = normalizeStripeTotals(patch.pending);
  const recurringRevenue = normalizeStripeTotals(patch.recurringRevenue);
  const activeSubscribers = Number(patch.activeSubscribers);

  if (Object.keys(available).length) state.stripeMetrics.available = available;
  if (Object.keys(pending).length) state.stripeMetrics.pending = pending;
  if (Object.keys(recurringRevenue).length) state.stripeMetrics.recurringRevenue = recurringRevenue;
  if (Number.isFinite(activeSubscribers)) state.stripeMetrics.activeSubscribers = activeSubscribers;
  if (patch.updatedAt) state.stripeMetrics.updatedAt = normalizeText(patch.updatedAt);
  state.stripeMetrics.loaded = true;
  render();
}

async function refreshStripeTotals() {
  if (state.stripeRefreshInFlight) return;
  state.stripeRefreshInFlight = true;
  if (els.stripeRefreshButton) {
    els.stripeRefreshButton.disabled = true;
    els.stripeRefreshButton.textContent = 'Refreshing...';
  }
  if (els.stripeSyncStatus) {
    els.stripeSyncStatus.textContent = 'Refreshing live Stripe totals from the finance API...';
  }

  try {
    const response = await fetch('/api/stripe/metrics');
    if (!response.ok) {
      throw new Error(`Stripe API responded with ${response.status}`);
    }

    const payload = await response.json();
    const metrics = {
      available: payload.available || {},
      pending: payload.pending || {},
      recurringRevenue: payload.recurringRevenue || {},
      activeSubscribers: normalizeCount(payload.activeSubscribers),
      updatedAt: new Date().toISOString()
    };

    applyStripeMetricsPatch(metrics);

    if (stripeMetricsRoot && typeof stripeMetricsRoot.put === 'function') {
      await putGun(stripeMetricsRoot, {
        activeSubscribers: metrics.activeSubscribers,
        updatedAt: metrics.updatedAt
      });
      await putGun(stripeMetricsRoot.get('available'), metrics.available);
      await putGun(stripeMetricsRoot.get('pending'), metrics.pending);
      await putGun(stripeMetricsRoot.get('recurringRevenue'), metrics.recurringRevenue);
    }

    if (els.stripeSyncStatus) {
      els.stripeSyncStatus.textContent = `Stripe totals refreshed ${formatSyncTimestamp(metrics.updatedAt)}.`;
    }
  } catch (error) {
    if (els.stripeSyncStatus) {
      els.stripeSyncStatus.textContent = `Stripe totals not refreshed. ${error.message || 'Check finance API access.'}`;
    }
  } finally {
    state.stripeRefreshInFlight = false;
    if (els.stripeRefreshButton) {
      els.stripeRefreshButton.disabled = false;
      els.stripeRefreshButton.textContent = 'Refresh Stripe totals';
    }
  }
}

function prefillProposalFromLatestCapture() {
  const capture = getLatestCapture();
  if (!capture?.inference) {
    if (els.automationStatus) {
      els.automationStatus.textContent = 'No Memory Capture record is available yet. Log a conversation first.';
    }
    return;
  }

  const inference = capture.inference;
  const offer = normalizeText(inference.offerAmount) || 'Offer needs shape';
  els.proposalPerson.value = normalizeText(inference.name) || 'Memory capture lead';
  els.proposalOffer.value = offer;
  els.proposalAmount.value = String(estimateProposalValueFromOffer(offer) || '');
  els.proposalStage.value = 'idea';
  els.proposalFollowUp.value = addDays(3);
  els.proposalNextStep.value = normalizeText(inference.nextBestAction) || 'Ask one tiny next question.';

  if (els.proposalDrawer) {
    els.proposalDrawer.open = true;
  }
  if (els.automationStatus) {
    els.automationStatus.textContent = `Prefilled proposal from latest capture: ${els.proposalPerson.value}.`;
  }
}

function subscribeGun() {
  if (!revenueRoot || !proposalRoot) {
    updateStatus('Gun unavailable. Revenue Desk is using local storage only.');
    return;
  }

  revenueRoot.get('state').once((snapshot) => {
    const clean = cleanGunRecord(snapshot);
    if (!clean?.updatedAt) return;
    if (!state.snapshot.updatedAt || clean.updatedAt > state.snapshot.updatedAt) {
      state.snapshot = loadSnapshotFromRemote(clean);
      saveJson(REVENUE_STORAGE_KEY, state.snapshot);
      hydrateForm();
      render();
      updateStatus('Gun synced: loaded revenue snapshot.');
    }
  });

  proposalRoot.map().on((proposal) => {
    const clean = normalizeProposal(cleanGunRecord(proposal));
    if (!clean?.id) return;
    state.proposals[clean.id] = clean;
    persistLocalProposals();
    render();
  });

  captureRoot?.map().on((capture) => {
    const clean = cleanGunRecord(capture);
    if (!clean?.id) return;
    state.recentCaptures[clean.id] = clean;
    renderDailyBrief();
    renderNextMove();
  });

  touchLogRoot?.map().on((touch) => {
    const clean = cleanGunRecord(touch);
    if (!clean?.id) return;
    state.touchLog[clean.id] = clean;
  });

  stripeMetricsRoot?.on((metrics) => {
    applyStripeMetricsPatch(cleanGunRecord(metrics));
  });

  stripeMetricsRoot?.get('available')?.on((available) => {
    applyStripeMetricsPatch({ available: cleanGunRecord(available) });
  });

  stripeMetricsRoot?.get('pending')?.on((pending) => {
    applyStripeMetricsPatch({ pending: cleanGunRecord(pending) });
  });

  stripeMetricsRoot?.get('recurringRevenue')?.on((recurringRevenue) => {
    applyStripeMetricsPatch({ recurringRevenue: cleanGunRecord(recurringRevenue) });
  });

  updateStatus('Gun sync: connected to revenue, proposals, captures, and touch log nodes.');
}

function loadSnapshotFromRemote(clean) {
  return {
    planCounts: {
      starter: normalizeCount(clean?.planCounts?.starter),
      pro: normalizeCount(clean?.planCounts?.pro),
      builder: normalizeCount(clean?.planCounts?.builder),
      embedded: normalizeCount(clean?.planCounts?.embedded)
    },
    customSprintRevenue: normalizeMoney(clean?.customSprintRevenue),
    updatedAt: normalizeText(clean?.updatedAt)
  };
}

function bindEvents() {
  els.revenueForm?.addEventListener('submit', saveRevenueSnapshot);
  els.proposalForm?.addEventListener('submit', addProposal);
  els.prefillFromCaptureButton?.addEventListener('click', prefillProposalFromLatestCapture);
  els.stripeRefreshButton?.addEventListener('click', refreshStripeTotals);
  els.agentBriefButtons.forEach(button => {
    button.addEventListener('click', queueAgentDailyBrief);
  });
  els.proposalBoard?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-proposal-stage][data-proposal-id]');
    if (!button) return;
    updateProposalStage(button.dataset.proposalId, button.dataset.proposalStage);
  });
}

function init() {
  hydrateForm();
  bindEvents();
  render();
  subscribeGun();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', init);
}
