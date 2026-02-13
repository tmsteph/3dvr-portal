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

  ads.slice(0, 6).forEach(ad => {
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
  return numeric;
}

const form = document.getElementById('money-loop-form');
const formStatus = document.getElementById('money-loop-status');
const topOpportunity = document.getElementById('top-opportunity');
const topOpportunityMeta = document.getElementById('top-opportunity-meta');
const opportunityList = document.getElementById('opportunity-list');
const adList = document.getElementById('ad-list');
const checklistList = document.getElementById('checklist-list');
const syncStatus = document.getElementById('gun-sync-status');
const warningsList = document.getElementById('warnings-list');

const scoreSystem = window.ScoreSystem || null;
const gunContext = ensureGunContext(createMoneyGun, scoreSystem, 'money-ai');
const sources = buildMoneyAutomationSources(gunContext.gun);

if (gunContext.isStub) {
  setStatus(syncStatus, 'Gun relay offline. Runs will display locally but not sync.', 'warn');
} else {
  setStatus(syncStatus, 'Gun relay connected. Runs will sync to 3dvr-portal/money-ai.', 'ok');
}

if (form) {
  form.addEventListener('submit', async event => {
    event.preventDefault();

    const marketInput = form.querySelector('#market-focus');
    const keywordInput = form.querySelector('#market-keywords');
    const budgetInput = form.querySelector('#weekly-budget');
    const keyInput = form.querySelector('#openai-key');

    const payload = {
      market: marketInput ? marketInput.value : '',
      keywords: splitCsv(keywordInput ? keywordInput.value : ''),
      channels: selectedChannels(form),
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
      const best = report.topOpportunity || {};

      topOpportunity.textContent = best.title || 'No opportunity identified yet';
      topOpportunityMeta.textContent = best.problem
        ? `${best.problem} • ${best.suggestedPrice || 'pricing TBD'}`
        : 'Adjust your market keywords and run again.';

      renderOpportunityList(opportunityList, report.opportunities || []);
      renderAdList(adList, report.adDrafts || []);
      renderChecklist(checklistList, report.executionChecklist || []);

      warningsList.innerHTML = '';
      (report.warnings || []).forEach(warning => {
        const item = document.createElement('li');
        item.textContent = warning;
        warningsList.append(item);
      });

      const actor = ensureActorIdentity(scoreSystem);
      const syncSummary = await persistMoneyLoopRun({
        sources,
        report,
        actor
      });

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
