import {
  buildMoneyAutomationSources,
  ensureActorIdentity,
  ensureGunContext,
  persistMoneyLoopRun
} from './gun-sync.js';

function createMoneyGun() {
  if (typeof window === 'undefined' || typeof window.Gun !== 'function') {
    return null;
  }

  const peers = window.__GUN_PEERS__ || [
    'wss://relay.3dvr.tech/gun',
    'wss://gun-relay-3dvr.fly.dev/gun'
  ];

  try {
    return window.Gun({ peers });
  } catch (error) {
    console.warn('Money AI Gun init failed', error);
    try {
      return window.Gun({ peers, radisk: false, localStorage: false });
    } catch (fallbackError) {
      console.warn('Money AI Gun fallback failed', fallbackError);
      return null;
    }
  }
}

function splitCsv(value = '') {
  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function selectedChannels(form) {
  const checkboxes = Array.from(form.querySelectorAll('input[name="channel"]'));
  return checkboxes
    .filter(item => item.checked)
    .map(item => item.value)
    .filter(Boolean);
}

function renderOpportunityList(container, opportunities = []) {
  container.innerHTML = '';

  opportunities.forEach(opportunity => {
    const item = document.createElement('article');
    item.className = 'result-card';

    const title = document.createElement('h3');
    title.className = 'result-card__title';
    title.textContent = `${opportunity.title} (${opportunity.score})`;

    const meta = document.createElement('p');
    meta.className = 'result-card__meta';
    meta.textContent = `${opportunity.audience} • ${opportunity.suggestedPrice}`;

    const body = document.createElement('p');
    body.className = 'result-card__body';
    body.textContent = opportunity.solution;

    item.append(title, meta, body);
    container.append(item);
  });
}

function renderAdList(container, ads = []) {
  container.innerHTML = '';

  ads.slice(0, 8).forEach(ad => {
    const item = document.createElement('article');
    item.className = 'ad-card';

    const headline = document.createElement('h3');
    headline.className = 'ad-card__title';
    headline.textContent = `[${ad.channel}] ${ad.headline}`;

    const body = document.createElement('p');
    body.className = 'ad-card__body';
    body.textContent = ad.body;

    const cta = document.createElement('p');
    cta.className = 'ad-card__cta';
    cta.textContent = `CTA: ${ad.cta}`;

    item.append(headline, body, cta);
    container.append(item);
  });
}

function renderChecklist(container, checklist = []) {
  container.innerHTML = '';
  checklist.forEach(item => {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    container.append(listItem);
  });
}

function renderWarnings(container, warnings = []) {
  container.innerHTML = '';
  warnings.forEach(warning => {
    const item = document.createElement('li');
    item.textContent = warning;
    container.append(item);
  });
}

function setStatus(element, message, tone = 'neutral') {
  if (!element) {
    return;
  }
  element.textContent = message;
  element.dataset.tone = tone;
}

function parseBudget(value) {
  const numeric = Number(String(value || '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 150;
  }
  return Math.round(numeric * 100) / 100;
}

function checkboxValue(id, fallback = false) {
  const element = document.getElementById(id);
  if (!element || element.type !== 'checkbox') {
    return fallback;
  }
  return Boolean(element.checked);
}

function summarizeMarketSelection(result = {}) {
  const selected = result?.marketSelection?.selected;
  if (selected?.market) {
    return `Market selected: ${selected.market} (score ${selected.score})`;
  }
  return `Market selected: ${result.market || 'not available'} (configured input)`;
}

function summarizePublish(result = {}) {
  const publish = result.publish || {};
  const github = publish.github || {};
  const vercel = publish.vercel || {};

  const parts = [];

  if (github.published) {
    parts.push(`GitHub published: ${github.path}`);
  } else if (github.reason) {
    parts.push(`GitHub: ${github.reason}`);
  }

  if (vercel.deployed) {
    parts.push(`Vercel deployed: ${vercel.url || 'deployment created'}`);
  } else if (vercel.reason) {
    parts.push(`Vercel: ${vercel.reason}`);
  }

  if (publish.destinationUrl) {
    parts.push(`Destination: ${publish.destinationUrl}`);
  }

  return parts.join(' • ') || 'Publish status unavailable.';
}

function summarizePromotion(result = {}) {
  const promotion = result.promotion || {};

  if (promotion.dispatched) {
    return `Promotion dispatched (${promotion.tasks?.length || 0} tasks) to ${promotion.destinationUrl}`;
  }

  if (promotion.reason) {
    return `Promotion: ${promotion.reason}`;
  }

  return 'Promotion status unavailable.';
}

function toPersistencePayload(result, fallbackChannels = []) {
  const signalCount = Number(result.signalsAnalyzed) || 0;
  return {
    runId: result.runId,
    generatedAt: result.generatedAt,
    input: {
      market: result.market || result.input?.market || '',
      budget: result.budget || result.input?.budget || 0,
      channels: result.input?.channels || fallbackChannels
    },
    warnings: result.warnings || [],
    signals: Array.from({ length: signalCount }, () => null),
    topOpportunity: result.topOpportunity || null,
    opportunities: result.opportunities || [],
    adDrafts: result.adDrafts || []
  };
}

const form = document.getElementById('money-loop-form');
const formStatus = document.getElementById('money-loop-status');
const autopilotRunButton = document.getElementById('autopilot-run');
const autopilotStatus = document.getElementById('autopilot-status');
const autopilotTokenInput = document.getElementById('autopilot-token');

const topOpportunity = document.getElementById('top-opportunity');
const topOpportunityMeta = document.getElementById('top-opportunity-meta');
const opportunityList = document.getElementById('opportunity-list');
const adList = document.getElementById('ad-list');
const checklistList = document.getElementById('checklist-list');
const warningsList = document.getElementById('warnings-list');
const marketSummary = document.getElementById('autopilot-market-summary');
const publishSummary = document.getElementById('publish-summary');
const promotionSummary = document.getElementById('promotion-summary');
const syncStatus = document.getElementById('gun-sync-status');

const scoreSystem = window.ScoreSystem || null;
const gunContext = ensureGunContext(createMoneyGun, scoreSystem, 'money-ai');
const sources = buildMoneyAutomationSources(gunContext.gun);

if (gunContext.isStub) {
  setStatus(syncStatus, 'Gun relay offline. Runs will display locally but not sync.', 'warn');
} else {
  setStatus(syncStatus, 'Gun relay connected. Runs will sync to 3dvr-portal/money-ai.', 'ok');
}

async function persistRun(result, fallbackChannels = []) {
  const actor = ensureActorIdentity(scoreSystem);
  const payload = toPersistencePayload(result, fallbackChannels);
  return persistMoneyLoopRun({
    sources,
    report: payload,
    actor
  });
}

function renderRunResult(result) {
  const best = result.topOpportunity || {};

  topOpportunity.textContent = best.title || 'No opportunity identified yet';
  topOpportunityMeta.textContent = best.problem
    ? `${best.problem} • ${best.suggestedPrice || 'pricing TBD'}`
    : 'Adjust configuration and run again.';

  renderOpportunityList(opportunityList, result.opportunities || []);
  renderAdList(adList, result.adDrafts || []);
  renderChecklist(checklistList, result.executionChecklist || []);
  renderWarnings(warningsList, result.warnings || []);

  setStatus(marketSummary, summarizeMarketSelection(result), 'neutral');
  setStatus(publishSummary, summarizePublish(result), 'neutral');
  setStatus(promotionSummary, summarizePromotion(result), 'neutral');
}

if (form) {
  form.addEventListener('submit', async event => {
    event.preventDefault();

    const marketInput = form.querySelector('#market-focus');
    const keywordInput = form.querySelector('#market-keywords');
    const budgetInput = form.querySelector('#weekly-budget');
    const keyInput = form.querySelector('#openai-key');

    const channels = selectedChannels(form);
    const payload = {
      market: marketInput ? marketInput.value : '',
      keywords: splitCsv(keywordInput ? keywordInput.value : ''),
      channels,
      budget: parseBudget(budgetInput ? budgetInput.value : ''),
      openAiApiKey: keyInput && keyInput.value.trim() ? keyInput.value.trim() : undefined
    };

    setStatus(formStatus, 'Running demand research + planning loop...', 'pending');

    try {
      const response = await fetch('/api/money/loop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Money loop API responded with ${response.status}`);
      }

      const report = await response.json();
      renderRunResult(report);

      const syncSummary = await persistRun(report, channels);
      setStatus(
        syncStatus,
        `Synced run ${syncSummary.runId}: ${syncSummary.opportunitiesSaved} opportunities, ${syncSummary.adsSaved} ads.`,
        'ok'
      );

      setStatus(formStatus, `Run complete: ${report.signals.length} signals analyzed.`, 'ok');
    } catch (error) {
      setStatus(formStatus, error?.message || 'Money loop failed.', 'error');
      setStatus(syncStatus, 'Sync skipped because the run failed.', 'warn');
    }
  });
}

if (autopilotRunButton) {
  autopilotRunButton.addEventListener('click', async () => {
    const token = String(autopilotTokenInput?.value || '').trim();
    if (!token) {
      setStatus(autopilotStatus, 'Enter the autopilot token to run secure background mode.', 'warn');
      return;
    }

    const marketInput = form?.querySelector('#market-focus');
    const keywordInput = form?.querySelector('#market-keywords');
    const budgetInput = form?.querySelector('#weekly-budget');
    const channels = form ? selectedChannels(form) : [];

    const params = new URLSearchParams({
      mode: 'autopilot',
      dryRun: checkboxValue('autopilot-dry-run') ? 'true' : 'false',
      autoDiscover: checkboxValue('autopilot-auto-discover', true) ? 'true' : 'false',
      publish: checkboxValue('autopilot-publish', true) ? 'true' : 'false',
      vercelDeploy: checkboxValue('autopilot-vercel') ? 'true' : 'false',
      promotion: checkboxValue('autopilot-promotion') ? 'true' : 'false',
      market: String(marketInput?.value || ''),
      keywords: String(keywordInput?.value || ''),
      channels: channels.join(','),
      budget: String(parseBudget(budgetInput?.value || ''))
    });

    setStatus(autopilotStatus, 'Running full autopilot: discovery, publish, and promotion...', 'pending');

    try {
      const response = await fetch(`/api/money/loop?${params.toString()}`, {
        method: 'GET',
        headers: {
          'X-Autopilot-Token': token
        }
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || `Autopilot API responded with ${response.status}`);
      }

      renderRunResult(payload);
      const syncSummary = await persistRun(payload, channels);
      setStatus(
        syncStatus,
        `Synced run ${syncSummary.runId}: ${syncSummary.opportunitiesSaved} opportunities, ${syncSummary.adsSaved} ads.`,
        'ok'
      );
      setStatus(
        autopilotStatus,
        `Autopilot complete: ${payload.signalsAnalyzed} signals analyzed, destination ${payload.publish?.destinationUrl || 'not published'}.`,
        'ok'
      );
    } catch (error) {
      setStatus(autopilotStatus, error?.message || 'Autopilot failed.', 'error');
      setStatus(syncStatus, 'Sync skipped because the autopilot run failed.', 'warn');
    }
  });
}
