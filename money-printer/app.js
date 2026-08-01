import {
  AUTONOMY_ZONES,
  BOT_GROUPS,
  DEFAULT_MISSION,
  EXPERIMENT_STATUSES,
  TOOL_DEFINITIONS,
  buildMetrics,
  createMoneyMachineState,
  createPromptOutput,
  ensureMoneyIdeas,
  generateMoneyIdeas,
  generateTinyMvpPlan,
  generateValidationTest,
  generateFounderCommandBrief,
  killOrScaleExperiment,
  normalizeMission,
  promoteIdeaInState,
  refreshMoneyPrinterState,
  runBotLoop,
  updateExperimentStatusInState
} from '../src/money-printer/moneyPrinterCore.js';
import { readConnectorStatuses } from '../src/money-printer/moneyPrinterConnectors.js';
import { createMoneyPrinterStorage } from '../src/money-printer/moneyPrinterStorage.js';
import {
  createMessageReviewItem,
  seedTrustReviewQueue
} from '../src/money-printer/messageReview.js';
import {
  createOpportunityEngineSync,
  mergeOpportunityEngineStates
} from '../src/money-printer/opportunityEngineSync.js';
import {
  ingestOpportunity,
  readOpportunityEngineState,
  sortOpportunityClusters,
  updateOpportunity,
  writeOpportunityEngineState
} from '../src/money-printer/opportunityEngine.js';

const elements = {
  form: document.getElementById('missionForm'),
  missionInput: document.getElementById('missionInput'),
  missionStatus: document.getElementById('missionStatus'),
  opportunityCaptureForm: document.getElementById('opportunityCaptureForm'),
  opportunityCapturePanel: document.getElementById('opportunityCapturePanel'),
  opportunityCaptureStatus: document.getElementById('opportunityCaptureStatus'),
  opportunityFilter: document.getElementById('opportunityFilter'),
  opportunityInbox: document.getElementById('opportunityInbox'),
  opportunitySyncStatus: document.getElementById('opportunitySyncStatus'),
  opportunitySummary: document.getElementById('opportunitySummary'),
  metricsGrid: document.getElementById('metricsGrid'),
  messageReviewQueue: document.getElementById('messageReviewQueue'),
  runtimeStatusGrid: document.getElementById('runtimeStatusGrid'),
  nextBestMoneyAction: document.getElementById('nextBestMoneyAction'),
  businessConfigPreview: document.getElementById('businessConfigPreview'),
  founderBrief: document.getElementById('founderBrief'),
  engineStatus: document.getElementById('engineStatus'),
  ideaGrid: document.getElementById('ideaGrid'),
  validationOutput: document.getElementById('validationOutput'),
  mvpOutput: document.getElementById('mvpOutput'),
  killScaleOutput: document.getElementById('killScaleOutput'),
  experimentGrid: document.getElementById('experimentGrid'),
  botDashboard: document.getElementById('botDashboard'),
  autonomyGrid: document.getElementById('autonomyGrid'),
  toolGrid: document.getElementById('toolGrid')
};

const moneyPrinterStorage = createMoneyPrinterStorage();
const MESSAGE_REVIEW_STORAGE_KEY = '3dvr.moneyPrinter.messageReviewQueue.v1';
let connectorStatuses = [];
let state = moneyPrinterStorage.hydrate();
let messageReviewQueue = loadMessageReviewQueue();
let opportunityEngineState = readOpportunityEngineState();
let opportunityEngineSync = null;
let opportunitySyncWrites = Promise.resolve();

function saveState() {
  if (!moneyPrinterStorage.write(state)) {
    setStatus('Local browser storage is unavailable, so this session will not persist after refresh.');
  }
}

function loadMessageReviewQueue() {
  try {
    const raw = window.localStorage.getItem(MESSAGE_REVIEW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) {
      return parsed.map(item => createMessageReviewItem(item));
    }
  } catch (_error) {
    // Fall back to seeded review examples.
  }
  return seedTrustReviewQueue();
}

function saveMessageReviewQueue() {
  try {
    window.localStorage.setItem(MESSAGE_REVIEW_STORAGE_KEY, JSON.stringify(messageReviewQueue));
  } catch (_error) {
    setStatus('Message review queue could not be saved locally.');
  }
}

function refreshDerived(nextState = state) {
  return refreshMoneyPrinterState(nextState);
}

function setStatus(message) {
  elements.missionStatus.textContent = message;
}

function replaceChildren(target, children) {
  target.replaceChildren(...children.filter(Boolean));
}

function textElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  node.textContent = text;
  return node;
}

function button(label, attributes = {}) {
  const node = document.createElement('button');
  node.className = attributes.className || 'mp-button';
  node.type = 'button';
  node.textContent = label;
  Object.entries(attributes).forEach(([key, value]) => {
    if (key !== 'className' && value !== undefined && value !== null) {
      node.setAttribute(key, value);
    }
  });
  return node;
}

function list(items = []) {
  const ul = document.createElement('ul');
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.append(li);
  });
  return ul;
}

function orderedList(items = []) {
  const ol = document.createElement('ol');
  items.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    ol.append(li);
  });
  return ol;
}

function titleFromKey(value = '') {
  return String(value)
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, char => char.toUpperCase())
    .trim();
}

function safeText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(value) {
  const numeric = Number(value || 0);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number.isFinite(numeric) ? numeric : 0);
}

function moneyRange(minimum, maximum) {
  const min = Number(minimum || 0);
  const max = Number(maximum || min);
  if (!min && !max) return 'Unknown';
  return min === max ? money(min) : `${money(min)}–${money(max)}`;
}

function saveOpportunityEngineState() {
  if (!writeOpportunityEngineState(opportunityEngineState)) {
    elements.opportunityCaptureStatus.textContent = 'Browser storage is unavailable; this opportunity will not survive a refresh.';
  }
  if (opportunityEngineSync?.available) {
    elements.opportunitySyncStatus.textContent = 'Syncing securely…';
    const snapshot = opportunityEngineState;
    opportunitySyncWrites = opportunitySyncWrites
      .catch(() => undefined)
      .then(() => opportunityEngineSync.write(snapshot))
      .then(() => {
        elements.opportunitySyncStatus.textContent = 'Synced securely';
      })
      .catch(() => {
        elements.opportunitySyncStatus.textContent = 'Saved locally · sync retry needed';
      });
  }
}

function waitForGunAuthentication(user, timeoutMs = 2200) {
  if (user?.is?.pub) return Promise.resolve(true);
  try {
    user?.recall?.({ sessionStorage: true, localStorage: true });
  } catch (_error) {
    return Promise.resolve(false);
  }
  return new Promise(resolve => {
    const startedAt = Date.now();
    const check = () => {
      if (user?.is?.pub) return resolve(true);
      if (Date.now() - startedAt >= timeoutMs) return resolve(false);
      setTimeout(check, 80);
    };
    check();
  });
}

async function initializeOpportunitySync() {
  if (typeof window.Gun !== 'function') {
    elements.opportunitySyncStatus.textContent = 'Saved on this device';
    return;
  }
  const gun = window.Gun(window.__GUN_PEERS__ || ['wss://gun-relay-3dvr.fly.dev/gun']);
  const user = gun.user();
  const authenticated = await waitForGunAuthentication(user);
  opportunityEngineSync = createOpportunityEngineSync({ user, SEA: window.SEA || window.Gun.SEA });
  if (!authenticated || !opportunityEngineSync.available) {
    elements.opportunitySyncStatus.textContent = 'Saved on this device · sign in to sync';
    return;
  }
  elements.opportunitySyncStatus.textContent = 'Checking secure sync…';
  try {
    const remoteState = await opportunityEngineSync.read();
    if (remoteState) {
      opportunityEngineState = mergeOpportunityEngineStates(opportunityEngineState, remoteState);
      writeOpportunityEngineState(opportunityEngineState);
      renderOpportunityInbox();
    }
    await opportunityEngineSync.write(opportunityEngineState);
    elements.opportunitySyncStatus.textContent = 'Synced securely';
  } catch (_error) {
    elements.opportunitySyncStatus.textContent = 'Saved locally · sync retry needed';
  }
}

function opportunityPrimarySignal(opportunity = {}) {
  return Array.isArray(opportunity.signals) ? opportunity.signals[0] || {} : {};
}

function renderOpportunityInbox() {
  if (!elements.opportunityInbox) return;
  const filter = elements.opportunityFilter?.value || 'active';
  const all = sortOpportunityClusters(opportunityEngineState.opportunities);
  const visible = all.filter(opportunity => {
    if (filter === 'all') return true;
    if (filter === 'passed') return ['passed', 'expired'].includes(opportunity.status);
    return !['passed', 'expired', 'won'].includes(opportunity.status);
  });

  const activeCount = all.filter(opportunity => !['passed', 'expired', 'won'].includes(opportunity.status)).length;
  elements.opportunitySummary.textContent = activeCount
    ? `${activeCount} active ${activeCount === 1 ? 'opportunity' : 'opportunities'}, ranked by actionability.`
    : 'No qualified opportunities yet. Forward a real request to begin.';

  if (!visible.length) {
    replaceChildren(elements.opportunityInbox, [
      textElement('p', 'empty-state', filter === 'active'
        ? 'No active opportunities. Add a real request above; Money Printer will preserve the evidence and next action.'
        : 'No opportunities match this filter.')
    ]);
    return;
  }

  const cards = visible.map(opportunity => {
    const signal = opportunityPrimarySignal(opportunity);
    const marginMin = Math.max(0, Number(signal.estimatedValueMin || 0) - Number(signal.estimatedCostMax || 0));
    const card = document.createElement('article');
    card.className = 'opportunity-card';
    card.dataset.status = opportunity.status;

    const top = document.createElement('div');
    top.className = 'opportunity-card__top';
    const heading = document.createElement('div');
    heading.append(
      textElement('span', 'mp-card-label', opportunity.status.replace(/-/g, ' ')),
      textElement('h3', '', opportunity.title)
    );
    const score = textElement('strong', 'opportunity-score', `${opportunity.actionabilityScore}`);
    score.title = 'Actionability score';
    top.append(heading, score);

    const economics = document.createElement('div');
    economics.className = 'opportunity-economics';
    [
      ['Value', moneyRange(signal.estimatedValueMin, signal.estimatedValueMax)],
      ['Cost', moneyRange(signal.estimatedCostMin, signal.estimatedCostMax)],
      ['Margin floor', signal.estimatedValueMin ? money(marginMin) : 'Unknown'],
      ['Confidence', `${signal.confidence}%`]
    ].forEach(([label, value]) => {
      const item = document.createElement('div');
      item.append(textElement('span', '', label), textElement('strong', '', value));
      economics.append(item);
    });

    const evidence = document.createElement('blockquote');
    evidence.className = 'opportunity-evidence';
    evidence.textContent = signal.buyerWords || 'No buyer wording saved.';

    const details = document.createElement('dl');
    details.className = 'opportunity-details';
    [
      ['Location', signal.location],
      ['Urgency', titleFromKey(signal.urgency)],
      ['Source', `${signal.sourceLabel} · ${signal.acquisitionMode}`],
      ['Permission', `${signal.policyStatus} · ${signal.contactPermission}`]
    ].forEach(([label, value]) => {
      const row = document.createElement('div');
      row.append(textElement('dt', '', label), textElement('dd', '', value));
      details.append(row);
    });

    const response = document.createElement('div');
    response.className = 'opportunity-response';
    response.append(
      textElement('span', 'mp-card-label', 'Suggested response'),
      textElement('p', '', opportunity.suggestedResponse || 'Draft a helpful response before review.'),
      textElement('span', 'mp-card-label', 'Next action'),
      textElement('strong', '', opportunity.nextAction)
    );

    const actions = document.createElement('div');
    actions.className = 'opportunity-actions';
    if (!['passed', 'expired', 'won'].includes(opportunity.status)) {
      actions.append(
        button('Review response', {
          className: 'mp-button mp-button--primary',
          'data-opportunity-action': 'review',
          'data-opportunity-id': opportunity.id
        }),
        button('Pass', {
          'data-opportunity-action': 'pass',
          'data-opportunity-id': opportunity.id
        })
      );
    }
    card.append(top, economics, evidence, details, response, actions);
    return card;
  });
  replaceChildren(elements.opportunityInbox, cards);
}

function addOpportunityToReviewQueue(opportunity) {
  const signal = opportunityPrimarySignal(opportunity);
  const reviewKey = `opportunity:${opportunity.id}`;
  const existing = messageReviewQueue.find(item => item.leadId === reviewKey);
  if (existing) return false;
  messageReviewQueue = [createMessageReviewItem({
    id: `review-${opportunity.id}`,
    leadId: reviewKey,
    leadName: opportunity.title,
    whyGenerated: `Opportunity Inbox evidence: ${signal.buyerWords || opportunity.title}`,
    offer: opportunity.title,
    offerConnection: `Connects to the evidence-backed Opportunity Inbox item: ${opportunity.title}.`,
    subject: `About ${opportunity.title}`,
    body: opportunity.suggestedResponse || '',
    riskLevel: 'YELLOW',
    riskExplanation: 'This is a first contact or reply prepared from manually forwarded evidence. Human review and sending are required.',
    safeguards: [
      `Source: ${signal.sourceLabel} (${signal.acquisitionMode})`,
      `Permission: ${signal.policyStatus}; ${signal.contactPermission}`,
      'No automatic send is enabled from Opportunity Inbox.'
    ],
    canAutoSend: false,
    status: 'review-required'
  }), ...messageReviewQueue];
  saveMessageReviewQueue();
  return true;
}

function handleOpportunityAction(action, opportunityId) {
  const opportunity = opportunityEngineState.opportunities.find(item => item.id === opportunityId);
  if (!opportunity) return;
  if (action === 'review') {
    const added = addOpportunityToReviewQueue(opportunity);
    opportunityEngineState = updateOpportunity(opportunityEngineState, opportunityId, { status: 'reviewing' });
    saveOpportunityEngineState();
    renderOpportunityInbox();
    renderMessageReviewQueue();
    setStatus(added ? 'Response added to the human review queue. Nothing was sent.' : 'This response is already in the human review queue.');
    document.getElementById('reviewQueueTitle')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  if (action === 'pass') {
    opportunityEngineState = updateOpportunity(opportunityEngineState, opportunityId, { status: 'passed' });
    saveOpportunityEngineState();
    renderOpportunityInbox();
    elements.opportunityCaptureStatus.textContent = 'Opportunity passed and preserved for learning.';
  }
}

function renderMetrics() {
  const metrics = buildMetrics(state);
  const metricCards = [
    ['Ideas', metrics.ideasGenerated],
    ['Active tests', metrics.experimentsActive],
    ['Replies', metrics.replies],
    ['Revenue', money(metrics.revenueTracked)]
  ].map(([label, value]) => {
    const card = document.createElement('article');
    card.className = 'metric-card';
    card.append(
      textElement('span', 'metric-card__label', label),
      textElement('strong', 'metric-card__value', String(value))
    );
    return card;
  });

  replaceChildren(elements.metricsGrid, metricCards);
  elements.nextBestMoneyAction.textContent = metrics.nextBestMoneyAction;
}

function riskTone(riskLevel = '') {
  if (riskLevel === 'GREEN') return 'green';
  if (riskLevel === 'RED') return 'red';
  return 'yellow';
}

function actionLabel(action, item = {}) {
  return {
    'approve-send': item.canAutoSend ? 'Approve & Send' : 'Approve draft',
    edit: 'Edit',
    skip: 'Skip',
    'ban-lead': 'Ban Lead',
    'save-later': 'Save for Later'
  }[action] || action;
}

function renderMessageReviewQueue() {
  if (!elements.messageReviewQueue) return;
  const items = [...messageReviewQueue].sort((left, right) => {
    const order = { RED: 0, YELLOW: 1, GREEN: 2 };
    const byRisk = (order[left.riskLevel] ?? 3) - (order[right.riskLevel] ?? 3);
    if (byRisk) return byRisk;
    return String(right.updatedAt || '').localeCompare(String(left.updatedAt || ''));
  });

  if (!items.length) {
    elements.messageReviewQueue.innerHTML = '<p class="empty-state">No messages are queued for review.</p>';
    return;
  }

  elements.messageReviewQueue.innerHTML = items.map(item => {
    const recommendedAction = item.riskLevel === 'GREEN'
      ? 'Looks safe, but review the words first.'
      : item.riskLevel === 'YELLOW'
        ? 'Read carefully before sending.'
        : 'Do not send until this is rewritten.';
    return `
    <article class="message-review-card" data-risk="${safeText(riskTone(item.riskLevel))}">
      <div class="message-review-card__top">
        <div>
          <span class="mp-card-label">${safeText(item.status)}</span>
          <h3>${safeText(item.leadName)}</h3>
        </div>
        <strong class="risk-badge" data-risk="${safeText(riskTone(item.riskLevel))}">${safeText(item.riskLevel)}</strong>
      </div>
      <p class="review-next-step">${safeText(recommendedAction)}</p>
      <dl class="review-explainer">
        <div>
          <dt>Why this exists</dt>
          <dd>${safeText(item.whyGenerated)}</dd>
        </div>
        <div>
          <dt>Offer</dt>
          <dd>${safeText(item.offerConnection || item.offer)}</dd>
        </div>
        <div>
          <dt>Risk reason</dt>
          <dd>${safeText(item.riskExplanation)}</dd>
        </div>
      </dl>
      <div class="message-draft">
        <label>
          <span>Subject</span>
          <input data-review-field="subject" data-review-id="${safeText(item.id)}" value="${safeText(item.subject)}" />
        </label>
        <label>
          <span>Message</span>
          <textarea data-review-field="body" data-review-id="${safeText(item.id)}" rows="8">${safeText(item.body)}</textarea>
        </label>
      </div>
      <details class="safeguard-details">
        <summary>Show safeguards</summary>
        <ul class="safeguard-list">
          ${(item.safeguards || []).map(note => `<li>${safeText(note)}</li>`).join('')}
        </ul>
      </details>
      <div class="review-actions">
        ${item.actions.map(action => `
          <button class="mp-button ${action === 'approve-send' ? 'mp-button--primary' : ''}" type="button" data-review-action="${safeText(action)}" data-review-id="${safeText(item.id)}">
            ${safeText(actionLabel(action, item))}
          </button>
        `).join('')}
      </div>
    </article>
  `;
  }).join('');
}

function renderRuntimeStatus() {
  const github = connectorStatuses.find(status => status.id === 'github');
  const vercel = connectorStatuses.find(status => status.id === 'vercel');
  const cards = [
    ['Page mode', 'Safe browser view', 'This page does not expose secrets or send outreach.'],
    ['Server loop', 'Runs on DigitalOcean', 'Every 6 hours it can propose tiny safe PRs.'],
    ['GitHub', github?.status || 'Server-only', 'PR creation and GREEN auto-merge run from the server.'],
    ['Vercel', vercel?.status || 'Server-only', 'Deploys follow the normal GitHub/Vercel path.'],
    ['Email reports', 'Needs HTTPS email fix', 'Gmail SMTP is blocked from the droplet right now.'],
    ['Human gate', 'Still required', 'Cold outreach, billing, auth, and risky work stay manual.']
  ].map(([label, value, detail]) => {
    const card = document.createElement('article');
    card.className = 'runtime-status-card';
    card.append(
      textElement('span', 'metric-card__label', label),
      textElement('strong', 'runtime-status-card__value', value),
      textElement('p', '', detail)
    );
    return card;
  });

  replaceChildren(elements.runtimeStatusGrid, cards);
}

function renderBusinessConfig() {
  elements.businessConfigPreview.textContent = JSON.stringify(state.businessConfig, null, 2);
}

function renderFounderBrief() {
  const brief = state.founderBrief || generateFounderCommandBrief(state);
  const nodes = Object.entries(brief).map(([key, value]) => {
    const item = document.createElement('dl');
    item.className = 'brief-item';
    item.append(textElement('dt', '', titleFromKey(key)));

    const dd = document.createElement('dd');
    if (Array.isArray(value)) {
      dd.append(orderedList(value));
    } else {
      dd.textContent = String(value || 'Not available yet.');
    }
    item.append(dd);
    return item;
  });
  replaceChildren(elements.founderBrief, nodes);
}

function ensureIdeas() {
  state = ensureMoneyIdeas(state);
}

function renderIdeas() {
  if (!state.ideas.length) {
    replaceChildren(elements.ideaGrid, [
      textElement('p', 'empty-state', 'Generate 5 business ideas to fill the opportunity engine.')
    ]);
    return;
  }

  const cards = state.ideas.map(idea => {
    const card = document.createElement('article');
    card.className = 'idea-card';

    const top = document.createElement('div');
    top.className = 'idea-card__top';
    const heading = document.createElement('div');
    heading.append(
      textElement('span', 'mp-card-label', idea.recommendation.toUpperCase()),
      textElement('h3', '', idea.business_name)
    );
    const score = textElement('span', 'score-pill', `${idea.total_score} / 100`);
    score.dataset.recommendation = idea.recommendation;
    top.append(heading, score);

    const details = document.createElement('div');
    details.className = 'idea-card__details';
    details.append(
      textElement('p', '', `Customer: ${idea.target_customer}`),
      textElement('p', '', `Pain: ${idea.customer_pain}`),
      textElement('p', '', `Offer: ${idea.offer}`),
      textElement('p', '', `Why now: ${idea.why_now}`),
      textElement('p', '', `Revenue path: ${idea.revenue_path}`),
      textElement('p', '', `First test this week: ${idea.first_test_this_week}`)
    );

    const scoreGrid = document.createElement('div');
    scoreGrid.className = 'idea-score-grid';
    [
      ['Difficulty', idea.difficulty_score],
      ['Speed to cash', idea.speed_to_cash_score],
      ['Founder fit', idea.founder_fit_score]
    ].forEach(([label, value]) => {
      const stat = document.createElement('div');
      stat.className = 'mini-stat';
      stat.append(textElement('span', '', label), textElement('strong', '', `${value} / 5`));
      scoreGrid.append(stat);
    });

    const tools = document.createElement('div');
    tools.append(textElement('span', 'mp-card-label', 'Tools needed'), list(idea.tools_needed));

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.append(
      button('Create Validation Test', {
        'data-validation-id': idea.id
      }),
      button('Promote to Experiment', {
        className: 'mp-button mp-button--primary',
        'data-promote-id': idea.id
      })
    );

    card.append(top, details, scoreGrid, tools, actions);
    return card;
  });

  replaceChildren(elements.ideaGrid, cards);
}

function renderObjectOutput(target, emptyText, output) {
  if (!output) {
    replaceChildren(target, [textElement('p', 'empty-state', emptyText)]);
    return;
  }

  const nodes = [];
  if (output.title) {
    nodes.push(textElement('h3', '', output.title));
  }

  Object.entries(output)
    .filter(([key]) => key !== 'title')
    .forEach(([key, value]) => {
      const row = document.createElement('div');
      row.className = 'engine-output__row';
      row.append(textElement('span', 'mp-card-label', titleFromKey(key)));
      if (Array.isArray(value)) {
        row.append(list(value));
      } else {
        row.append(textElement('p', '', String(value)));
      }
      nodes.push(row);
    });

  replaceChildren(target, nodes);
}

function renderEngineOutputs() {
  renderObjectOutput(
    elements.validationOutput,
    'Create or view a validation test after choosing an idea.',
    state.validationTest
  );
  renderObjectOutput(
    elements.mvpOutput,
    'Build a tiny MVP plan for the highest-scoring idea.',
    state.tinyMvpPlan
  );
  renderObjectOutput(
    elements.killScaleOutput,
    'Run Kill or Scale after the portfolio has at least one experiment.',
    state.killOrScaleDecision
  );
}

function renderExperiments() {
  const experiments = state.experiments || [];
  if (!experiments.length) {
    replaceChildren(elements.experimentGrid, [
      textElement('p', 'empty-state', 'Promote an idea to create the first active business experiment.')
    ]);
    return;
  }

  const cards = experiments.map(experiment => {
    const traction = experiment.traction || {};
    const card = document.createElement('article');
    card.className = 'experiment-card';

    const top = document.createElement('div');
    top.className = 'experiment-card__top';
    const heading = document.createElement('div');
    heading.append(textElement('span', 'mp-card-label', 'Experiment'), textElement('h3', '', experiment.name));
    const pill = textElement('span', 'status-pill', experiment.status || 'Idea');
    pill.dataset.status = experiment.status || 'Idea';
    top.append(heading, pill);

    const details = document.createElement('div');
    details.className = 'experiment-card__details';
    details.append(
      textElement('p', '', `Customer: ${experiment.customer}`),
      textElement('p', '', `Pain: ${experiment.pain}`),
      textElement('p', '', `Offer: ${experiment.offer}`),
      textElement('p', '', `Price test: ${experiment.price_test}`),
      textElement('p', '', `Validation test: ${experiment.validation_test}`),
      textElement('p', '', `Next action: ${experiment.next_action}`)
    );

    const tractionGrid = document.createElement('div');
    tractionGrid.className = 'traction-grid';
    [
      ['Leads', traction.leads_found || 0],
      ['Drafted', traction.messages_drafted || 0],
      ['Sent', traction.messages_sent || 0],
      ['Replies', traction.replies || 0],
      ['Calls', traction.calls_booked || 0],
      ['Revenue', money(traction.revenue || 0)]
    ].forEach(([label, value]) => {
      const stat = document.createElement('div');
      stat.className = 'mini-stat';
      stat.append(textElement('span', '', label), textElement('strong', '', String(value)));
      tractionGrid.append(stat);
    });

    const statusRow = document.createElement('div');
    statusRow.className = 'experiment-card__status-row';
    const label = textElement('label', 'mp-field', '');
    const labelText = textElement('span', 'mp-card-label', 'Status');
    const select = document.createElement('select');
    select.className = 'mp-select';
    select.dataset.experimentStatus = experiment.id;
    EXPERIMENT_STATUSES.forEach(status => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status;
      option.selected = status === experiment.status;
      select.append(option);
    });
    label.append(labelText, select);
    statusRow.append(label);

    card.append(top, details, tractionGrid, statusRow);
    return card;
  });

  replaceChildren(elements.experimentGrid, cards);
}

function renderBotOutput(output) {
  const wrapper = document.createElement('div');
  wrapper.className = output.prompt ? 'prompt-output' : 'bot-output';
  wrapper.append(textElement('h4', '', output.title || 'Bot output'));
  if (output.summary) {
    wrapper.append(textElement('p', '', output.summary));
  }
  if (Array.isArray(output.lines) && output.lines.length) {
    wrapper.append(list(output.lines));
  }
  return wrapper;
}

function renderBots() {
  const groups = BOT_GROUPS.map(group => {
    const groupNode = document.createElement('section');
    groupNode.className = 'bot-group';
    groupNode.append(textElement('h3', '', group.name));

    const grid = document.createElement('div');
    grid.className = 'bot-grid';
    group.bots.forEach(bot => {
      const card = document.createElement('article');
      card.className = 'bot-card';

      const top = document.createElement('div');
      top.className = 'bot-card__top';
      const heading = document.createElement('div');
      heading.append(textElement('span', 'mp-card-label', bot.status), textElement('h3', '', bot.name));
      const autonomy = textElement('span', 'autonomy-pill', bot.autonomy);
      autonomy.dataset.zone = bot.autonomy;
      top.append(heading, autonomy);

      const meta = document.createElement('div');
      meta.className = 'bot-card__meta';
      meta.append(
        textElement('p', '', bot.purpose),
        textElement('p', '', `Tools needed: ${bot.toolsNeeded.join(', ')}`)
      );

      const actions = document.createElement('div');
      actions.className = 'bot-card__actions';
      actions.append(
        button('Run Loop', {
          className: 'mp-button mp-button--primary',
          'data-run-bot': bot.id
        }),
        button('View Prompt', {
          className: 'mp-button mp-button--ghost',
          'data-view-prompt': bot.id
        })
      );

      card.append(top, meta, actions);
      if (state.botOutputs?.[bot.id]) {
        card.append(renderBotOutput(state.botOutputs[bot.id]));
      }
      grid.append(card);
    });

    groupNode.append(grid);
    return groupNode;
  });

  replaceChildren(elements.botDashboard, groups);
}

function renderAutonomyZones() {
  const cards = AUTONOMY_ZONES.map(zone => {
    const card = document.createElement('article');
    card.className = 'zone-card';
    card.dataset.tone = zone.tone;

    const top = document.createElement('div');
    top.className = 'zone-card__top';
    const heading = document.createElement('div');
    heading.append(textElement('span', 'mp-card-label', zone.zone), textElement('h3', '', `${zone.zone} — ${zone.label}`));
    const pill = textElement('span', 'status-pill', zone.label);
    top.append(heading, pill);

    card.append(top, textElement('p', '', zone.description), list(zone.examples));
    return card;
  });
  replaceChildren(elements.autonomyGrid, cards);
}

function renderTools() {
  const statusById = new Map(connectorStatuses.map(status => [status.id, status]));
  const cards = TOOL_DEFINITIONS.map(tool => {
    const status = statusById.get(tool.id);
    const card = document.createElement('article');
    card.className = 'tool-card';

    const top = document.createElement('div');
    top.className = 'tool-card__top';
    const heading = document.createElement('div');
    heading.append(textElement('span', 'mp-card-label', 'Connector'), textElement('h3', '', tool.name));
    const pill = textElement('span', 'status-pill', status?.status || tool.status);
    top.append(heading, pill);

    const env = document.createElement('div');
    env.className = 'tool-card__env';
    tool.envVars.forEach(envVar => {
      env.append(textElement('span', 'env-chip', envVar));
    });

    card.append(
      top,
      textElement('p', '', status?.message || 'Mock status only. Add env vars and server-side connector code later.'),
      textElement('span', 'tool-card__env-label', 'Needed environment variables'),
      env,
      textElement('span', 'tool-card__env-label', 'Once connected the bots could'),
      list(tool.capabilities)
    );
    return card;
  });
  replaceChildren(elements.toolGrid, cards);
}

function render() {
  renderOpportunityInbox();
  renderMetrics();
  renderMessageReviewQueue();
  renderRuntimeStatus();
  renderBusinessConfig();
  renderFounderBrief();
  renderIdeas();
  renderEngineOutputs();
  renderExperiments();
  renderBots();
  renderAutonomyZones();
  renderTools();
}

function updateReviewItem(id, patch) {
  messageReviewQueue = messageReviewQueue.map(item => (
    item.id === id
      ? createMessageReviewItem({ ...item, ...patch, updatedAt: new Date().toISOString() })
      : item
  ));
  saveMessageReviewQueue();
  renderMessageReviewQueue();
}

function handleReviewAction(action, id) {
  const item = messageReviewQueue.find(entry => entry.id === id);
  if (!item) return;
  if (action === 'approve-send') {
    updateReviewItem(id, {
      status: item.canAutoSend ? 'approved-auto-send-ready' : 'approved-human-send-required',
      whyGenerated: `${item.whyGenerated} Human approved this draft.`
    });
    setStatus(item.canAutoSend
      ? 'GREEN message approved. It can use the pre-approved send path.'
      : 'Message approved. Human send remains required for this risk level.');
    return;
  }
  if (action === 'edit') {
    updateReviewItem(id, { status: 'editing' });
    setStatus('Draft opened for editing. Risk will be recalculated as you change it.');
    return;
  }
  if (action === 'skip') {
    updateReviewItem(id, { status: 'skipped' });
    setStatus('Message skipped. Lead is preserved for later context.');
    return;
  }
  if (action === 'ban-lead') {
    updateReviewItem(id, { status: 'banned', riskLevel: 'RED' });
    setStatus('Lead banned from this review queue.');
    return;
  }
  if (action === 'save-later') {
    updateReviewItem(id, { status: 'saved-later' });
    setStatus('Message saved for later review.');
  }
}

function commit(message) {
  state = refreshDerived(state);
  saveState();
  render();
  if (message) {
    setStatus(message);
  }
}

function runGenerateMachine() {
  state = createMoneyMachineState(state, elements.missionInput.value);
  saveState();
  render();
  setStatus('Next move ready. Check the Current state section and review any queued drafts before sending.');
}

function promoteIdea(ideaId) {
  const result = promoteIdeaInState(state, ideaId);
  state = result.state;
  if (!result.idea) {
    setStatus('Generate ideas before promoting an experiment.');
    return;
  }

  if (!result.existed) {
    commit(`${result.idea.business_name} promoted to the experiment portfolio.`);
    return;
  }

  setStatus(`${result.idea.business_name} is already in the experiment portfolio.`);
}

function handleEngineAction(action) {
  if (action === 'generate-ideas') {
    const mission = normalizeMission(elements.missionInput.value);
    state = refreshDerived({
      ...state,
      mission,
      ideas: generateMoneyIdeas(mission)
    });
    commit('Generated 5 useful business ideas from the current mission.');
    return;
  }

  if (action === 'score-ideas') {
    ensureIdeas();
    commit('Ideas scored by urgent pain, reachable buyer, simple offer, low build cost, distribution, speed, fit, and software-later potential.');
    return;
  }

  if (action === 'create-validation') {
    ensureIdeas();
    state = refreshDerived({
      ...state,
      validationTest: generateValidationTest(state.ideas[0])
    });
    commit(`Validation test created for ${state.ideas[0].business_name}.`);
    return;
  }

  if (action === 'build-mvp') {
    ensureIdeas();
    state = refreshDerived({
      ...state,
      tinyMvpPlan: generateTinyMvpPlan(state.ideas[0])
    });
    commit(`Tiny MVP plan created for ${state.ideas[0].business_name}.`);
    return;
  }

  if (action === 'kill-scale') {
    state = refreshDerived({
      ...state,
      killOrScaleDecision: killOrScaleExperiment(state)
    });
    commit(`Kill-or-scale decision: ${state.killOrScaleDecision.verdict} ${state.killOrScaleDecision.target}.`);
    return;
  }

  if (action === 'promote-top') {
    ensureIdeas();
    promoteIdea(state.ideas[0]?.id);
  }
}

elements.form.addEventListener('submit', event => {
  event.preventDefault();
  runGenerateMachine();
});

elements.opportunityCaptureForm?.addEventListener('submit', event => {
  event.preventDefault();
  const formData = new FormData(elements.opportunityCaptureForm);
  const now = new Date();
  const acquisitionMode = String(formData.get('acquisitionMode') || 'manual-forward');
  const sourcePolicy = acquisitionMode === 'first-party-form'
    ? { sourceLabel: '3DVR form submission', policyStatus: 'first-party' }
    : acquisitionMode === 'email-reply'
      ? { sourceLabel: 'Email reply', policyStatus: 'first-party' }
      : { sourceLabel: 'Manual forward', policyStatus: 'human-provided' };
  const ingestion = ingestOpportunity(opportunityEngineState, {
    need: formData.get('need'),
    buyerWords: formData.get('buyerWords'),
    location: formData.get('location'),
    urgency: formData.get('urgency'),
    estimatedValueMin: formData.get('estimatedValueMin'),
    estimatedValueMax: formData.get('estimatedValueMin'),
    estimatedCostMax: formData.get('estimatedCostMax'),
    estimatedCostMin: formData.get('estimatedCostMax'),
    suggestedResponse: formData.get('suggestedResponse'),
    nextAction: formData.get('nextAction'),
    ...sourcePolicy,
    externalId: formData.get('externalId'),
    acquisitionMode,
    contactPermission: 'review-required',
    confidence: 60,
    createdAt: now.toISOString()
  }, now);
  if (!ingestion.created) {
    elements.opportunityCaptureStatus.textContent = 'Already in the inbox. The duplicate was not added.';
    return;
  }
  opportunityEngineState = ingestion.state;
  saveOpportunityEngineState();
  elements.opportunityCaptureForm.reset();
  elements.opportunityCapturePanel.open = false;
  elements.opportunityCaptureStatus.textContent = 'Opportunity saved with its evidence. No contact was made.';
  renderOpportunityInbox();
});

elements.opportunityFilter?.addEventListener('change', renderOpportunityInbox);

elements.missionInput.addEventListener('input', () => {
  state.mission = elements.missionInput.value;
  saveState();
});

document.addEventListener('click', event => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    handleEngineAction(actionButton.dataset.action);
    return;
  }

  const validationButton = event.target.closest('[data-validation-id]');
  if (validationButton) {
    const idea = state.ideas.find(item => item.id === validationButton.dataset.validationId);
    state = refreshDerived({
      ...state,
      validationTest: generateValidationTest(idea)
    });
    commit(`Validation test created for ${idea?.business_name || 'selected idea'}.`);
    return;
  }

  const promoteButton = event.target.closest('[data-promote-id]');
  if (promoteButton) {
    promoteIdea(promoteButton.dataset.promoteId);
    return;
  }

  const runBotButton = event.target.closest('[data-run-bot]');
  if (runBotButton) {
    const botId = runBotButton.dataset.runBot;
    state.botOutputs = {
      ...state.botOutputs,
      [botId]: runBotLoop(botId, state)
    };
    commit('Bot loop completed in mock mode and updated the dashboard.');
    return;
  }

  const promptButton = event.target.closest('[data-view-prompt]');
  if (promptButton) {
    const botId = promptButton.dataset.viewPrompt;
    state.botOutputs = {
      ...state.botOutputs,
      [botId]: createPromptOutput(botId)
    };
    commit('Prompt template shown for the selected bot.');
    return;
  }

  const reviewButton = event.target.closest('[data-review-action]');
  if (reviewButton) {
    handleReviewAction(reviewButton.dataset.reviewAction, reviewButton.dataset.reviewId);
    return;
  }

  const opportunityButton = event.target.closest('[data-opportunity-action]');
  if (opportunityButton) {
    handleOpportunityAction(opportunityButton.dataset.opportunityAction, opportunityButton.dataset.opportunityId);
  }
});

document.addEventListener('change', event => {
  const reviewField = event.target.closest('[data-review-field]');
  if (reviewField) {
    updateReviewItem(reviewField.dataset.reviewId, {
      [reviewField.dataset.reviewField]: reviewField.value,
      status: 'edited-review-required'
    });
    return;
  }

  const select = event.target.closest('[data-experiment-status]');
  if (!select) {
    return;
  }

  const experimentId = select.dataset.experimentStatus;
  state = updateExperimentStatusInState(state, experimentId, select.value);
  commit(`Experiment status changed to ${select.value}. Metrics and brief updated.`);
});

async function boot() {
  elements.missionInput.value = state.mission || DEFAULT_MISSION;
  if (elements.opportunityCapturePanel) {
    elements.opportunityCapturePanel.open = opportunityEngineState.opportunities.length === 0;
  }
  render();
  initializeOpportunitySync();
  try {
    connectorStatuses = await readConnectorStatuses();
    renderTools();
  } catch {
    connectorStatuses = [];
    renderTools();
  }
}

boot();
