import {
  DEFAULT_WEEKLY_PLAN,
  estimateRecurringRevenue,
  normalizeStripeMetricsRecord,
  normalizeUsageTierRecord,
  normalizeWeeklyPlan,
  summarizeLinkedBilling,
} from './scoreboard-data.js';

const LOCAL_SCOREBOARD_KEY = 'sales-scoreboard.v1';
const LOCAL_TRAINING_STATE_KEY = 'training.v1';
const GUN_QUEUE_NODE_PATH = ['3dvr-portal', 'sales-training', 'today-queue'];
const TOUCH_LOG_NODE_PATH = ['3dvr-portal', 'crm-touch-log'];
const BILLING_USAGE_TIER_NODE_PATH = ['3dvr-portal', 'billing', 'usageTier'];
const STRIPE_METRICS_NODE_PATH = ['3dvr-portal', 'finance', 'stripe', 'metrics', 'latest'];
const SCOREBOARD_NODE_PATH = ['3dvr-portal', 'sales-scoreboard', 'weekly'];

const weekLabel = document.getElementById('weekLabel');
const roadmapStage = document.getElementById('roadmapStage');
const roadmapStageNote = document.getElementById('roadmapStageNote');
const priorityNote = document.getElementById('priorityNote');
const liveDataStatus = document.getElementById('liveDataStatus');
const planSyncStatus = document.getElementById('planSyncStatus');
const focusList = document.getElementById('focusList');
const weeklyPlanForm = document.getElementById('weeklyPlanForm');
const savePlanButton = document.getElementById('savePlanButton');
const builderMrrValue = document.getElementById('builderMrrValue');
const embeddedMrrValue = document.getElementById('embeddedMrrValue');
const stripeSubscriberValue = document.getElementById('stripeSubscriberValue');
const cashCollectedValue = document.getElementById('cashCollectedValue');

const metricElements = Array.from(document.querySelectorAll('[data-live-metric]')).reduce((map, element) => {
  map[element.dataset.liveMetric] = element;
  return map;
}, {});

const goalProgressElements = Array.from(document.querySelectorAll('[data-goal-progress]')).reduce((map, element) => {
  map[element.dataset.goalProgress] = element;
  return map;
}, {});

const WEEK_RANGE = getCurrentWeekRange();
const WEEK_KEY = formatDateKey(WEEK_RANGE.start);

let profitabilityGun = null;
let queueNode = null;
let touchLogNode = null;
let billingUsageTierNode = null;
let stripeMetricsNode = null;
let weeklyLedgerNode = null;
let queueItems = [];
let queueSignature = '[]';
let weeklyPlan = normalizeWeeklyPlan(readLocalWeeklyPlan());
let weeklyPlanSnapshot = JSON.stringify(weeklyPlan);
let touchLogIndex = Object.create(null);
let billingUsageTierIndex = Object.create(null);
let stripeMetricsState = normalizeStripeMetricsRecord();
let queueLoaded = false;
let touchLogLoaded = false;

// Shared node shapes:
// - gun.get('3dvr-portal').get('sales-training').get('today-queue') => { itemsJson, updatedAt }
// - gun.get('3dvr-portal').get('crm-touch-log').get(logId) => { timestamp, touchType, segment, ... }
// - gun.get('3dvr-portal').get('billing').get('usageTier').get(<pub|alias>) => { tier, plan, alias, updatedAt, source }
// - gun.get('3dvr-portal').get('finance').get('stripe').get('metrics').get('latest') => { activeSubscribers, updatedAt }
// - gun.get('3dvr-portal').get('sales-scoreboard').get('weekly').get(weekKey) => manual weekly ledger

function createProfitabilityGun() {
  if (typeof window === 'undefined' || typeof window.Gun !== 'function') {
    return null;
  }

  const peers = window.__GUN_PEERS__ || [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun',
  ];

  try {
    return window.Gun({ peers });
  } catch (error) {
    console.warn('Profitability desk Gun init failed', error);
    try {
      return window.Gun({ peers, radisk: false, localStorage: false });
    } catch (fallbackError) {
      console.warn('Profitability desk Gun fallback failed', fallbackError);
      return null;
    }
  }
}

function getNodeFromPath(root, path) {
  return path.reduce((node, part) => node.get(part), root);
}

function getCurrentWeekRange(reference = new Date()) {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  const day = start.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  start.setDate(start.getDate() + diff);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function readLocalScoreboardState() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_SCOREBOARD_KEY) || '{}');
  } catch (error) {
    console.warn('Unable to read local profitability state', error);
    return {};
  }
}

function persistLocalWeeklyPlan(plan) {
  try {
    const nextState = readLocalScoreboardState();
    nextState[WEEK_KEY] = normalizeWeeklyPlan(plan);
    window.localStorage.setItem(LOCAL_SCOREBOARD_KEY, JSON.stringify(nextState));
  } catch (error) {
    console.warn('Unable to persist local profitability state', error);
  }
}

function readLocalWeeklyPlan() {
  const state = readLocalScoreboardState();
  return state[WEEK_KEY] || {};
}

function readLocalTrainingQueue() {
  try {
    const state = JSON.parse(window.localStorage.getItem(LOCAL_TRAINING_STATE_KEY) || '{}');
    return normalizeQueue(Array.isArray(state.reachoutQueue) ? state.reachoutQueue : []);
  } catch (error) {
    console.warn('Unable to read local training queue', error);
    return [];
  }
}

function normalizeQueueEntry(item = {}) {
  return {
    id: String(item.id || '').trim(),
    lead: String(item.lead || '').trim(),
    message: String(item.message || '').trim(),
    next: String(item.next || '').trim(),
    done: Boolean(item.done),
  };
}

function normalizeQueue(list = []) {
  return Array.isArray(list)
    ? list.map(normalizeQueueEntry).filter(item => item.lead && item.message && item.next)
    : [];
}

function parseQueueFromGun(data = {}) {
  if (!data || typeof data !== 'object') {
    return [];
  }

  const rawJson = typeof data.itemsJson === 'string' ? data.itemsJson.trim() : '';
  if (rawJson) {
    try {
      return normalizeQueue(JSON.parse(rawJson));
    } catch (error) {
      console.warn('Profitability desk queue parse failed', error);
    }
  }

  return normalizeQueue(Array.isArray(data.items) ? data.items : []);
}

function normalizeTouchLogEntry(data, id) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const clean = {};
  Object.entries(data).forEach(([key, value]) => {
    if (key === '_' || typeof value === 'function') {
      return;
    }
    clean[key] = value;
  });

  return {
    ...clean,
    id: String(id || data.id || '').trim(),
    timestamp: String(data.timestamp || data.time || data.lastContacted || '').trim(),
    touchType: String(data.touchType || 'outreach-sent').trim(),
  };
}

function isWithinCurrentWeek(timestamp) {
  const value = new Date(timestamp);
  if (Number.isNaN(value.getTime())) {
    return false;
  }
  return value >= WEEK_RANGE.start && value < WEEK_RANGE.end;
}

function getLiveMetrics(plan = weeklyPlan) {
  const touches = Object.values(touchLogIndex).filter(entry => isWithinCurrentWeek(entry.timestamp));
  const linkedCounts = summarizeLinkedBilling(billingUsageTierIndex);
  const outreach = touches.filter(entry => entry.touchType === 'outreach-sent').length;
  const replies = touches.filter(entry => entry.touchType === 'reply-received').length;
  const wins = touches.filter(entry => entry.touchType === 'closed-won').length;
  const queueOpen = queueItems.filter(item => !item.done).length;
  const estimatedMrr = estimateRecurringRevenue(linkedCounts);

  return {
    outreach,
    replies,
    wins,
    queueOpen,
    deposits: plan.depositCount,
    stripeSubscribers: stripeMetricsState.activeSubscribers,
    linkedPaidCustomers: linkedCounts.linkedPaidCustomers,
    builderCustomers: linkedCounts.builderCustomers,
    embeddedCustomers: linkedCounts.embeddedCustomers,
    mrr: estimatedMrr,
    cashCollected: plan.weeklyCashCollected,
  };
}

function updateMetric(name, value) {
  const element = metricElements[name];
  if (!element) {
    return;
  }
  element.textContent = name === 'mrr' ? formatCurrency(value) : String(value);
}

function updateGoalProgress(name, current, goal) {
  const element = goalProgressElements[name];
  if (!element) {
    return;
  }
  element.textContent = `${current} / ${goal}`;
}

function getRoadmapStage(metrics, plan = weeklyPlan) {
  if (metrics.mrr >= 3000) {
    return {
      title: 'Durable core',
      note: 'Recurring revenue is in the target band. Bias toward retention, delivery quality, and repeatable outbound.',
    };
  }
  if (metrics.mrr >= 1000) {
    return {
      title: 'Cash-positive momentum',
      note: 'Recurring revenue is meaningful. Keep Builder and Embedded retention tight while continuing outbound.',
    };
  }
  if (metrics.linkedPaidCustomers > 0 || plan.depositCount > 0) {
    return {
      title: 'Proof',
      note: 'You have paying motion. Keep turning one-time wins and Founder work into Builder or Embedded retention.',
    };
  }
  return {
    title: 'Starting',
    note: 'Log the first paid lane honestly, then push the next close.',
  };
}

function buildFocusItems(metrics, plan) {
  const items = [];
  const outreachGap = Math.max(0, plan.outreachGoal - metrics.outreach);
  const replyGap = Math.max(0, plan.replyGoal - metrics.replies);
  const closeGap = Math.max(0, plan.closeGoal - metrics.wins);
  const depositGap = Math.max(0, plan.depositGoal - plan.depositCount);
  const unlinkedPaidGap = Math.max(0, metrics.stripeSubscribers - metrics.linkedPaidCustomers);

  if (unlinkedPaidGap > 0) {
    items.push({
      title: `Link ${unlinkedPaidGap} active Stripe subscriber${unlinkedPaidGap === 1 ? '' : 's'}`,
      body: 'Finance shows more active subscribers than portal-linked paid accounts. Recover older billing records before the next upgrade push.',
    });
  }

  if (outreachGap > 0) {
    items.push({
      title: `Send ${outreachGap} more outreach touches`,
      body: 'The touch log is behind the goal. Work the queued leads before pulling a new segment.',
    });
  } else {
    items.push({
      title: 'Outreach goal is on pace',
      body: 'Do not let the queue go stale. Push the next follow-up while the week is still warm.',
    });
  }

  if (replyGap > 0) {
    items.push({
      title: `Create ${replyGap} more reply conversations`,
      body: 'Use CRM and follow-up notes to turn sent touches into real back-and-forth, not just volume.',
    });
  }

  if (closeGap > 0) {
    items.push({
      title: 'Make the paid ask concrete',
      body: 'Put Builder, Embedded, or a scoped deposit in front of a real buyer this week. Do not leave the deal in a vague stage.',
    });
  }

  if (depositGap > 0) {
    items.push({
      title: `Close ${depositGap} more deposit${depositGap === 1 ? '' : 's'}`,
      body: 'Use the custom billing lane when a monthly plan is too early but the scope is real.',
    });
  }

  if (!plan.productMove) {
    items.push({
      title: 'Define one product move',
      body: 'Choose the smallest change that helps win or serve a paying customer this week.',
    });
  }

  if (!plan.revenueMove) {
    items.push({
      title: 'Define one revenue move',
      body: 'A week without a revenue move is drift. Pick the lead, ask, or close path now.',
    });
  }

  if (!plan.systemMove) {
    items.push({
      title: 'Define one system move',
      body: 'Capture the workflow that is working so it stops living only in your head.',
    });
  }

  if (plan.blocker) {
    items.push({
      title: 'Name the blocker directly',
      body: plan.blocker,
    });
  }

  return items.slice(0, 5);
}

function renderFocusItems(items) {
  if (!focusList) {
    return;
  }

  if (!items.length) {
    focusList.innerHTML = `
      <article class="rounded-2xl border border-white/5 bg-slate-950/80 p-4">
        <p class="text-sm text-slate-300">No immediate gaps. Keep the week pointed at delivery and retention.</p>
      </article>
    `;
    return;
  }

  focusList.innerHTML = items.map(item => `
    <article class="rounded-2xl border border-white/5 bg-slate-950/80 p-4">
      <p class="text-sm font-semibold text-slate-100">${escapeHtml(item.title)}</p>
      <p class="mt-2 text-sm text-slate-300">${escapeHtml(item.body)}</p>
    </article>
  `).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPlanForm(plan = weeklyPlan) {
  if (!weeklyPlanForm) {
    return;
  }

  weeklyPlanForm.outreachGoal.value = String(plan.outreachGoal);
  weeklyPlanForm.replyGoal.value = String(plan.replyGoal);
  weeklyPlanForm.closeGoal.value = String(plan.closeGoal);
  weeklyPlanForm.depositGoal.value = String(plan.depositGoal);
  weeklyPlanForm.depositCount.value = String(plan.depositCount);
  weeklyPlanForm.weeklyCashCollected.value = String(plan.weeklyCashCollected);
  weeklyPlanForm.productMove.value = plan.productMove;
  weeklyPlanForm.revenueMove.value = plan.revenueMove;
  weeklyPlanForm.systemMove.value = plan.systemMove;
  weeklyPlanForm.blocker.value = plan.blocker;
}

function collectPlanFromForm() {
  if (!weeklyPlanForm) {
    return weeklyPlan;
  }

  return normalizeWeeklyPlan({
    outreachGoal: weeklyPlanForm.outreachGoal.value,
    replyGoal: weeklyPlanForm.replyGoal.value,
    closeGoal: weeklyPlanForm.closeGoal.value,
    depositGoal: weeklyPlanForm.depositGoal.value,
    depositCount: weeklyPlanForm.depositCount.value,
    weeklyCashCollected: weeklyPlanForm.weeklyCashCollected.value,
    productMove: weeklyPlanForm.productMove.value,
    revenueMove: weeklyPlanForm.revenueMove.value,
    systemMove: weeklyPlanForm.systemMove.value,
    blocker: weeklyPlanForm.blocker.value,
  });
}

function renderWeek() {
  if (!weekLabel) {
    return;
  }

  const label = `${WEEK_RANGE.start.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })} to ${new Date(WEEK_RANGE.end.getTime() - 1).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  })}`;

  weekLabel.textContent = `Week of ${label}`;
}

function renderDataStatus() {
  if (!liveDataStatus) {
    return;
  }

  const queueState = queueNode ? 'shared queue live' : 'queue local only';
  const touchState = touchLogNode ? 'touch log live' : 'touch log unavailable';
  const billingState = billingUsageTierNode ? 'billing sync live' : 'billing sync unavailable';
  const stripeState = stripeMetricsNode ? 'stripe metrics live' : 'stripe metrics unavailable';
  liveDataStatus.textContent = `${queueState} • ${touchState} • ${billingState} • ${stripeState} • week key ${WEEK_KEY}`;
}

function renderPlanStatus(message) {
  if (planSyncStatus) {
    planSyncStatus.textContent = message;
  }
}

function renderAll() {
  const metrics = getLiveMetrics();
  const stage = getRoadmapStage(metrics, weeklyPlan);

  updateMetric('stripeSubscribers', metrics.stripeSubscribers);
  updateMetric('outreach', metrics.outreach);
  updateMetric('replies', metrics.replies);
  updateMetric('wins', metrics.wins);
  updateMetric('queueOpen', metrics.queueOpen);
  updateMetric('deposits', metrics.deposits);
  updateMetric('builderCustomers', metrics.builderCustomers);
  updateMetric('embeddedCustomers', metrics.embeddedCustomers);
  updateMetric('mrr', metrics.mrr);

  updateGoalProgress('outreach', metrics.outreach, weeklyPlan.outreachGoal);
  updateGoalProgress('replies', metrics.replies, weeklyPlan.replyGoal);
  updateGoalProgress('wins', metrics.wins, weeklyPlan.closeGoal);
  updateGoalProgress('deposits', weeklyPlan.depositCount, weeklyPlan.depositGoal);

  if (roadmapStage) {
    roadmapStage.textContent = stage.title;
  }
  if (roadmapStageNote) {
    roadmapStageNote.textContent = stage.note;
  }
  if (builderMrrValue) {
    builderMrrValue.textContent = formatCurrency(metrics.builderCustomers * 50);
  }
  if (embeddedMrrValue) {
    embeddedMrrValue.textContent = formatCurrency(metrics.embeddedCustomers * 200);
  }
  if (stripeSubscriberValue) {
    stripeSubscriberValue.textContent = String(metrics.stripeSubscribers);
  }
  if (cashCollectedValue) {
    cashCollectedValue.textContent = formatCurrency(weeklyPlan.weeklyCashCollected);
  }

  renderFocusItems(buildFocusItems(metrics, weeklyPlan));

  if (priorityNote) {
    if (metrics.stripeSubscribers > metrics.linkedPaidCustomers) {
      priorityNote.textContent = `Stripe shows ${metrics.stripeSubscribers} active subscriber${metrics.stripeSubscribers === 1 ? '' : 's'}, but only ${metrics.linkedPaidCustomers} paid account${metrics.linkedPaidCustomers === 1 ? '' : 's'} are linked inside portal billing. Recover that gap first.`;
    } else if (metrics.outreach < weeklyPlan.outreachGoal) {
      priorityNote.textContent = `Outreach is behind the weekly goal. Work ${weeklyPlan.outreachGoal - metrics.outreach} more touches before you widen the funnel.`;
    } else if (metrics.wins < weeklyPlan.closeGoal) {
      priorityNote.textContent = 'Touches are moving. Push the Builder, Embedded, or scoped deposit ask now.';
    } else if (metrics.queueOpen > 0) {
      priorityNote.textContent = `The week is warm. Clear ${metrics.queueOpen} queued item${metrics.queueOpen === 1 ? '' : 's'} before pulling more leads.`;
    } else {
      priorityNote.textContent = 'The week is on pace. Protect retention, delivery quality, and the next paid conversation.';
    }
  }

  renderDataStatus();
}

function hydrateQueueFromLocal() {
  queueItems = readLocalTrainingQueue();
  queueSignature = JSON.stringify(queueItems);
  queueLoaded = true;
  renderAll();
}

function hydrateQueueFromGun() {
  if (!queueNode) {
    return;
  }

  const applyRemoteQueue = (data) => {
    if (!data || !data.updatedAt) {
      return;
    }
    const nextQueue = parseQueueFromGun(data);
    const nextSignature = JSON.stringify(nextQueue);
    if (nextSignature === queueSignature) {
      return;
    }
    queueItems = nextQueue;
    queueSignature = nextSignature;
    queueLoaded = true;
    renderAll();
  };

  queueNode.once(applyRemoteQueue);
  queueNode.on(applyRemoteQueue);
}

function hydrateTouchLog() {
  if (!touchLogNode) {
    return;
  }

  touchLogNode.map().on((data, id) => {
    const entry = normalizeTouchLogEntry(data, id);
    if (!entry || !entry.id) {
      return;
    }
    touchLogIndex[entry.id] = entry;
    touchLogLoaded = true;
    renderAll();
  });
}

function hydrateBillingUsageTiers() {
  if (!billingUsageTierNode) {
    return;
  }

  billingUsageTierNode.map().on((data, id) => {
    const recordId = String(id || '').trim();
    if (!recordId) {
      return;
    }

    if (!data) {
      delete billingUsageTierIndex[recordId];
      renderAll();
      return;
    }

    const record = normalizeUsageTierRecord(data, recordId);
    if (!record) {
      return;
    }

    billingUsageTierIndex[recordId] = record;
    renderAll();
  });
}

function hydrateStripeMetrics() {
  if (!stripeMetricsNode) {
    return;
  }

  const applyMetrics = (data) => {
    const metrics = normalizeStripeMetricsRecord(data);
    stripeMetricsState = {
      ...stripeMetricsState,
      ...metrics,
    };
    renderAll();
  };

  stripeMetricsNode.once(applyMetrics);
  stripeMetricsNode.on(applyMetrics);
}

function hydrateWeeklyLedger() {
  if (!weeklyLedgerNode) {
    return;
  }

  const applyRemotePlan = (data) => {
    if (!data || !data.updatedAt) {
      return;
    }
    const nextPlan = normalizeWeeklyPlan(data);
    const nextSnapshot = JSON.stringify(nextPlan);
    if (nextSnapshot === weeklyPlanSnapshot) {
      return;
    }
    weeklyPlan = nextPlan;
    weeklyPlanSnapshot = nextSnapshot;
    persistLocalWeeklyPlan(weeklyPlan);
    renderPlanForm(weeklyPlan);
    renderPlanStatus('Shared weekly ledger refreshed from Gun.');
    renderAll();
  };

  weeklyLedgerNode.once(applyRemotePlan);
  weeklyLedgerNode.on(applyRemotePlan);
}

function saveWeeklyPlan() {
  weeklyPlan = collectPlanFromForm();
  weeklyPlanSnapshot = JSON.stringify(weeklyPlan);
  persistLocalWeeklyPlan(weeklyPlan);
  renderAll();

  if (!weeklyLedgerNode) {
    renderPlanStatus('Saved locally. Gun is unavailable, so this weekly ledger stays on this device for now.');
    return;
  }

  renderPlanStatus('Syncing the weekly ledger with Gun…');
  weeklyLedgerNode.put({
    ...weeklyPlan,
    weekKey: WEEK_KEY,
    updatedAt: new Date().toISOString(),
  }, ack => {
    if (ack && ack.err) {
      console.warn('Weekly profitability sync failed', ack.err);
      renderPlanStatus('Weekly ledger sync failed. Local copy kept on this device.');
      return;
    }
    renderPlanStatus(`Shared weekly ledger saved for ${WEEK_KEY}.`);
  });
}

function init() {
  renderWeek();
  renderPlanForm(weeklyPlan);
  renderAll();

  profitabilityGun = createProfitabilityGun();
  if (profitabilityGun) {
    queueNode = getNodeFromPath(profitabilityGun, GUN_QUEUE_NODE_PATH);
    touchLogNode = getNodeFromPath(profitabilityGun, TOUCH_LOG_NODE_PATH);
    billingUsageTierNode = getNodeFromPath(profitabilityGun, BILLING_USAGE_TIER_NODE_PATH);
    stripeMetricsNode = getNodeFromPath(profitabilityGun, STRIPE_METRICS_NODE_PATH);
    weeklyLedgerNode = getNodeFromPath(profitabilityGun, [...SCOREBOARD_NODE_PATH, WEEK_KEY]);
  }

  hydrateQueueFromLocal();
  hydrateQueueFromGun();
  hydrateTouchLog();
  hydrateBillingUsageTiers();
  hydrateStripeMetrics();
  hydrateWeeklyLedger();

  if (!queueNode || !touchLogNode || !billingUsageTierNode || !stripeMetricsNode) {
    liveDataStatus.textContent = 'Gun is unavailable. Queue data may stay local-only and shared sales metrics may be incomplete in this browser.';
  } else if (!queueLoaded && !touchLogLoaded) {
    liveDataStatus.textContent = 'Shared queue, touch log, billing sync, and finance metrics connected. Waiting for the current week to load…';
  }

  weeklyPlanForm?.addEventListener('input', () => {
    weeklyPlan = collectPlanFromForm();
    weeklyPlanSnapshot = JSON.stringify(weeklyPlan);
    persistLocalWeeklyPlan(weeklyPlan);
    renderPlanStatus('Local draft updated. Save to sync the shared weekly ledger.');
    renderAll();
  });

  savePlanButton?.addEventListener('click', saveWeeklyPlan);
}

init();
