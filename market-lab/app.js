const STORAGE_KEY = '3dvr.marketLab.experiments.v1';
const SOURCE_STORAGE_KEY = '3dvr.marketLab.currentSource.v1';
const DEFAULT_SOURCE = 'direct';

const DEFAULT_EXPERIMENTS = [
  {
    id: 'launch-your-idea',
    name: 'Launch Your Idea',
    message: 'We help people finally launch their ideas.',
    audience: 'entrepreneurs, creators, side hustlers',
    cta: 'Book a free brainstorming call.',
    headline: 'Finally launch the idea you keep carrying around.',
    explanation: 'Turn a rough idea into a first page, offer, or working next step with direct 3DVR help.',
    status: 'Testing',
    clicks: 0,
    replies: 0,
    callsBooked: 0,
    signups: 0,
    clicksBySource: {},
    notes: ''
  },
  {
    id: 'personal-tech-department',
    name: 'Personal Tech Department',
    message: 'Your personal tech department for $20/month.',
    audience: 'small businesses, older adults, busy professionals',
    cta: 'Get tech support.',
    headline: 'A calm personal tech department for everyday problems.',
    explanation: 'Get practical help with sites, accounts, devices, software, and small systems without hiring a full team.',
    status: 'Testing',
    clicks: 0,
    replies: 0,
    callsBooked: 0,
    signups: 0,
    clicksBySource: {},
    notes: ''
  },
  {
    id: 'open-future-computing',
    name: 'Open Future Computing',
    message: 'Open-source computing for real humans.',
    audience: 'Linux/open-source people, makers, digital nomads',
    cta: 'Join the builder community.',
    headline: 'Open-source computing should feel human.',
    explanation: 'Build toward local-first tools, humane interfaces, Linux-friendly workflows, and portable digital independence.',
    status: 'Testing',
    clicks: 0,
    replies: 0,
    callsBooked: 0,
    signups: 0,
    clicksBySource: {},
    notes: ''
  }
];

const METRICS = [
  { key: 'clicks', label: 'Clicks', weight: 1 },
  { key: 'replies', label: 'Replies', weight: 3 },
  { key: 'callsBooked', label: 'Calls booked', weight: 5 },
  { key: 'signups', label: 'Signups', weight: 10 }
];

const storage = {
  load() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefaults();
      return mergeStoredData(JSON.parse(raw));
    } catch (error) {
      console.warn('Market Lab could not load local data; using defaults.', error);
      return cloneDefaults();
    }
  },
  save(experiments) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(experiments));
    } catch (error) {
      console.warn('Market Lab could not save local data.', error);
    }

    // Later: write the same normalized payload to Gun.js, Supabase, or a portal API here.
    // Suggested path: 3dvr-portal/market-lab/experiments/{experimentId}
  },
  reset() {
    window.localStorage.removeItem(STORAGE_KEY);
  }
};

let experiments = storage.load();

const mockupGrid = document.getElementById('mockupGrid');
const dashboard = document.getElementById('experimentDashboard');
const leadingExperimentName = document.getElementById('leadingExperimentName');
const leadingExperimentDetail = document.getElementById('leadingExperimentDetail');
const resetButton = document.getElementById('resetExperiments');
const sourceInput = document.getElementById('sourceInput');
const applySourceButton = document.getElementById('applySource');

let currentSource = loadCurrentSource();
sourceInput.value = currentSource;

function cloneDefaults() {
  return DEFAULT_EXPERIMENTS.map((experiment) => ({
    ...experiment,
    clicksBySource: { ...experiment.clicksBySource }
  }));
}

function mergeStoredData(stored) {
  if (!Array.isArray(stored)) return cloneDefaults();

  return DEFAULT_EXPERIMENTS.map((base) => {
    const match = stored.find((item) => item && item.id === base.id);
    if (!match) return { ...base };

    return {
      ...base,
      status: normalizeText(match.status) || base.status,
      clicks: normalizeCount(match.clicks),
      replies: normalizeCount(match.replies),
      callsBooked: normalizeCount(match.callsBooked),
      signups: normalizeCount(match.signups),
      clicksBySource: normalizeSourceMap(match.clicksBySource),
      notes: normalizeText(match.notes)
    };
  });
}

function normalizeText(value) {
  return typeof value === 'string' ? value : '';
}

function normalizeCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function normalizeSourceLabel(value) {
  const normalized = normalizeText(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || DEFAULT_SOURCE;
}

function normalizeSourceMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.entries(value).reduce((map, [source, count]) => {
    const key = normalizeSourceLabel(source);
    map[key] = (map[key] || 0) + normalizeCount(count);
    return map;
  }, {});
}

function loadCurrentSource() {
  const params = new URLSearchParams(window.location.search);
  const querySource = params.get('source') || params.get('utm_source') || params.get('ref');
  const storedSource = window.localStorage.getItem(SOURCE_STORAGE_KEY);
  return normalizeSourceLabel(querySource || storedSource || DEFAULT_SOURCE);
}

function saveCurrentSource(value) {
  currentSource = normalizeSourceLabel(value);
  sourceInput.value = currentSource;
  window.localStorage.setItem(SOURCE_STORAGE_KEY, currentSource);
}

function scoreExperiment(experiment) {
  return experiment.clicks
    + experiment.replies * 3
    + experiment.callsBooked * 5
    + experiment.signups * 10;
}

function saveAndRender() {
  storage.save(experiments);
  render();
}

function updateExperiment(id, updater) {
  experiments = experiments.map((experiment) => {
    if (experiment.id !== id) return experiment;
    return updater({ ...experiment });
  });
  saveAndRender();
}

function incrementMetric(id, key) {
  updateExperiment(id, (experiment) => ({
    ...experiment,
    [key]: normalizeCount(experiment[key]) + 1,
    clicksBySource: key === 'clicks'
      ? {
          ...experiment.clicksBySource,
          [currentSource]: normalizeCount(experiment.clicksBySource?.[currentSource]) + 1
        }
      : experiment.clicksBySource
  }));

  // Later: send real analytics and CRM events here.
  // Example payload: { experimentId: id, event: key, source: currentSource, createdAt: Date.now() }
}

function updateNotes(id, value) {
  updateExperiment(id, (experiment) => ({
    ...experiment,
    notes: value
  }));

  // Later: sync notes into CRM conversation history or a shared campaign planning table here.
}

function getLeader() {
  return [...experiments].sort((a, b) => scoreExperiment(b) - scoreExperiment(a))[0];
}

function renderLeader() {
  const leader = getLeader();
  const score = leader ? scoreExperiment(leader) : 0;
  leadingExperimentName.textContent = leader ? leader.name : 'No experiments yet';
  leadingExperimentDetail.textContent = leader
    ? `${score} signal points. Formula: clicks + replies*3 + calls booked*5 + signups*10.`
    : 'Add experiment signals to pick a leader.';
}

function renderMockups() {
  mockupGrid.innerHTML = experiments.map((experiment) => `
    <article class="mockup-card">
      <div>
        <p class="eyebrow">${escapeHtml(experiment.name)}</p>
        <h3>${escapeHtml(experiment.headline)}</h3>
      </div>
      <p>${escapeHtml(experiment.explanation)}</p>
      <button class="cta-button" type="button" data-cta-click="${escapeHtml(experiment.id)}">
        ${escapeHtml(experiment.cta)} <span class="source-button-label">(${escapeHtml(currentSource)})</span>
      </button>
    </article>
  `).join('');
}

function renderDashboard() {
  dashboard.innerHTML = experiments.map((experiment) => {
    const score = scoreExperiment(experiment);
    const sourcePills = renderSourcePills(experiment.clicksBySource);
    const metrics = METRICS.map((metric) => `
      <div class="metric">
        <span>${escapeHtml(metric.label)}</span>
        <strong>${experiment[metric.key]}</strong>
        <button class="metric-button" type="button" data-metric-id="${escapeHtml(experiment.id)}" data-metric-key="${metric.key}">
          +1 ${escapeHtml(metric.label)}
        </button>
      </div>
    `).join('');

    return `
      <article class="experiment-card">
        <div class="status-row">
          <h3>${escapeHtml(experiment.name)}</h3>
          <span class="status-badge">${escapeHtml(experiment.status)}</span>
        </div>
        <div class="experiment-meta">
          <div class="meta-line"><b>Audience</b><span>${escapeHtml(experiment.audience)}</span></div>
          <div class="meta-line"><b>Message</b><span>${escapeHtml(experiment.message)}</span></div>
          <div class="meta-line"><b>Offer / CTA</b><span>${escapeHtml(experiment.cta)}</span></div>
          <div class="score">Winner score: ${score}</div>
        </div>
        <div class="metrics">${metrics}</div>
        <div class="source-list">
          <b>CTA clicks by source</b>
          <div class="source-pills">${sourcePills}</div>
        </div>
        <div class="notes-wrap">
          <label for="notes-${escapeHtml(experiment.id)}">Notes</label>
          <textarea id="notes-${escapeHtml(experiment.id)}" data-notes-id="${escapeHtml(experiment.id)}" placeholder="What happened when this angle met reality?">${escapeHtml(experiment.notes)}</textarea>
        </div>
      </article>
    `;
  }).join('');
}

function render() {
  renderLeader();
  renderMockups();
  renderDashboard();
}

function renderSourcePills(clicksBySource = {}) {
  const entries = Object.entries(clicksBySource)
    .filter(([, count]) => normalizeCount(count) > 0)
    .sort((a, b) => normalizeCount(b[1]) - normalizeCount(a[1]));

  if (!entries.length) {
    return '<span class="source-pill">No source clicks yet</span>';
  }

  return entries.map(([source, count]) => `
    <span class="source-pill">${escapeHtml(source)}: ${normalizeCount(count)}</span>
  `).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

document.addEventListener('click', (event) => {
  const ctaButton = event.target.closest('[data-cta-click]');
  if (ctaButton) {
    incrementMetric(ctaButton.dataset.ctaClick, 'clicks');

    // Later: replace this with a real form, booking flow, or CRM handoff.
    return;
  }

  const metricButton = event.target.closest('[data-metric-id][data-metric-key]');
  if (metricButton) {
    incrementMetric(metricButton.dataset.metricId, metricButton.dataset.metricKey);
  }
});

document.addEventListener('change', (event) => {
  const notesField = event.target.closest('[data-notes-id]');
  if (notesField) {
    updateNotes(notesField.dataset.notesId, notesField.value);
  }
});

document.addEventListener('input', (event) => {
  const notesField = event.target.closest('[data-notes-id]');
  if (notesField) {
    const id = notesField.dataset.notesId;
    const draft = notesField.value;
    experiments = experiments.map((experiment) => (
      experiment.id === id ? { ...experiment, notes: draft } : experiment
    ));
    storage.save(experiments);
    renderLeader();
  }
});

resetButton.addEventListener('click', () => {
  storage.reset();
  experiments = cloneDefaults();
  render();
});

applySourceButton.addEventListener('click', () => {
  saveCurrentSource(sourceInput.value);
  render();
});

sourceInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    saveCurrentSource(sourceInput.value);
    render();
  }
});

render();
