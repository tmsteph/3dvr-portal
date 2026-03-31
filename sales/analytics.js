const GUN_PEERS = window.__GUN_PEERS__ || [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun',
];
const EXPERIMENT_CONFIG_PATH = ['3dvr-portal', 'growth', 'experiments', 'homepage-hero', 'config'];
const EXPERIMENT_EVENT_PATH = ['3dvr-portal', 'growth', 'experiments', 'homepage-hero', 'events'];
const FEEDBACK_EVENT_PATH = ['3dvr-portal', 'growth', 'feedback', 'homepage-hero'];
const MIN_COMPARISON_VIEWS = 5;
const AUTO_PROMOTION_GAP = 0.05;
const VARIANTS = Object.freeze({
  clarity: Object.freeze({ key: 'clarity', label: 'Clarity-first copy' }),
  traction: Object.freeze({ key: 'traction', label: 'Traction-first copy' }),
});

const refs = {
  growthLabStatus: document.getElementById('growthLabStatus'),
  growthCurrentWinner: document.getElementById('growthCurrentWinner'),
  growthWinnerReason: document.getElementById('growthWinnerReason'),
  growthAutoMode: document.getElementById('growthAutoMode'),
  growthConfigStatus: document.getElementById('growthConfigStatus'),
  growthTotalViews: document.getElementById('growthTotalViews'),
  growthTotalClicks: document.getElementById('growthTotalClicks'),
  growthTotalFeedback: document.getElementById('growthTotalFeedback'),
  growthLastSignal: document.getElementById('growthLastSignal'),
  clarityViews: document.getElementById('clarityViews'),
  clarityClicks: document.getElementById('clarityClicks'),
  clarityClickRate: document.getElementById('clarityClickRate'),
  clarityFeedback: document.getElementById('clarityFeedback'),
  claritySummary: document.getElementById('claritySummary'),
  tractionViews: document.getElementById('tractionViews'),
  tractionClicks: document.getElementById('tractionClicks'),
  tractionClickRate: document.getElementById('tractionClickRate'),
  tractionFeedback: document.getElementById('tractionFeedback'),
  tractionSummary: document.getElementById('tractionSummary'),
  growthFeedbackList: document.getElementById('growthFeedbackList'),
  growthEventList: document.getElementById('growthEventList'),
  setWinnerClarity: document.getElementById('setWinnerClarity'),
  setWinnerTraction: document.getElementById('setWinnerTraction'),
  clearWinner: document.getElementById('clearWinner'),
  toggleAutoMode: document.getElementById('toggleAutoMode'),
};

const state = {
  config: {
    autoMode: true,
    winner: '',
    winnerReason: '',
    clarityWeight: 50,
    tractionWeight: 50,
    updatedAt: '',
  },
  events: Object.create(null),
  feedback: Object.create(null),
  lastAutoSignature: '',
};

function getNode(root, path) {
  return path.reduce((node, key) => (node && typeof node.get === 'function' ? node.get(key) : null), root);
}

function createGun() {
  if (typeof window.Gun !== 'function') {
    return null;
  }

  try {
    return window.Gun({ peers: GUN_PEERS });
  } catch (error) {
    console.warn('Growth lab Gun init failed', error);
    try {
      return window.Gun({ peers: GUN_PEERS, radisk: false, localStorage: false });
    } catch (fallbackError) {
      console.warn('Growth lab Gun fallback failed', fallbackError);
      return null;
    }
  }
}

function normalizeConfig(data = {}) {
  return {
    autoMode: typeof data.autoMode === 'boolean' ? data.autoMode : true,
    winner: VARIANTS[String(data.winner || '').trim()] ? String(data.winner).trim() : '',
    winnerReason: String(data.winnerReason || '').trim(),
    clarityWeight: Math.max(1, Number.parseInt(data.clarityWeight, 10) || 50),
    tractionWeight: Math.max(1, Number.parseInt(data.tractionWeight, 10) || 50),
    updatedAt: String(data.updatedAt || '').trim(),
  };
}

function normalizeEvent(data = {}, id = '') {
  return {
    id: String(id || data.id || '').trim(),
    visitorId: String(data.visitorId || '').trim(),
    page: String(data.page || '').trim(),
    eventType: String(data.eventType || '').trim(),
    cta: String(data.cta || '').trim(),
    variant: VARIANTS[String(data.variant || '').trim()] ? String(data.variant).trim() : '',
    timestamp: String(data.timestamp || '').trim(),
    source: String(data.source || '').trim(),
  };
}

function normalizeFeedback(data = {}, id = '') {
  return {
    id: String(id || data.id || '').trim(),
    visitorId: String(data.visitorId || '').trim(),
    page: String(data.page || '').trim(),
    sentiment: String(data.sentiment || '').trim(),
    variant: VARIANTS[String(data.variant || '').trim()] ? String(data.variant).trim() : '',
    prompt: String(data.prompt || '').trim(),
    timestamp: String(data.timestamp || '').trim(),
    source: String(data.source || '').trim(),
  };
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown time';
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function percent(value) {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${Math.round(value * 100)}%`;
}

function shortVisitor(visitorId) {
  return visitorId ? visitorId.slice(0, 8) : 'guest';
}

function computeStats() {
  const stats = {
    clarity: { views: 0, clicks: 0, clear: 0, unclear: 0 },
    traction: { views: 0, clicks: 0, clear: 0, unclear: 0 },
  };

  Object.values(state.events).forEach(entry => {
    if (!entry.variant || !stats[entry.variant] || entry.page !== 'homepage') {
      return;
    }
    if (entry.eventType === 'view') {
      stats[entry.variant].views += 1;
    }
    if (entry.eventType === 'cta-click') {
      stats[entry.variant].clicks += 1;
    }
  });

  Object.values(state.feedback).forEach(entry => {
    if (!entry.variant || !stats[entry.variant] || entry.page !== 'homepage') {
      return;
    }
    if (entry.sentiment === 'clear') {
      stats[entry.variant].clear += 1;
    }
    if (entry.sentiment === 'unclear') {
      stats[entry.variant].unclear += 1;
    }
  });

  return stats;
}

function computeVariantScore(stat) {
  const clickRate = stat.views ? stat.clicks / stat.views : 0;
  const feedbackTotal = stat.clear + stat.unclear;
  const clarityRate = feedbackTotal ? stat.clear / feedbackTotal : 0;
  return (clickRate * 0.7) + (clarityRate * 0.3);
}

function pickRecommendedWinner(stats) {
  const entries = Object.entries(stats)
    .map(([key, stat]) => ({
      key,
      stat,
      clickRate: stat.views ? stat.clicks / stat.views : 0,
      clarityRate: (stat.clear + stat.unclear) ? stat.clear / (stat.clear + stat.unclear) : 0,
      score: computeVariantScore(stat),
    }))
    .filter(entry => entry.stat.views >= MIN_COMPARISON_VIEWS);

  if (entries.length < 2) {
    return null;
  }

  entries.sort((left, right) => right.score - left.score);
  const [best, second] = entries;
  if (!best || !second || (best.score - second.score) < AUTO_PROMOTION_GAP) {
    return null;
  }

  return {
    key: best.key,
    reason: `Auto-promoted ${best.key} from stronger click and clarity signals.`,
    signature: `${best.key}:${best.score.toFixed(4)}:${second.score.toFixed(4)}:${best.stat.views}:${second.stat.views}`,
  };
}

function renderList(container, items, formatter, emptyMessage) {
  if (!container) {
    return;
  }

  if (!items.length) {
    container.innerHTML = `
      <div class="rounded-xl border border-dashed border-white/10 bg-slate-950/80 px-4 py-5 text-sm text-slate-400">
        ${emptyMessage}
      </div>
    `;
    return;
  }

  container.innerHTML = items.map(formatter).join('');
}

function render() {
  const stats = computeStats();
  const totalViews = stats.clarity.views + stats.traction.views;
  const totalClicks = stats.clarity.clicks + stats.traction.clicks;
  const totalFeedback = stats.clarity.clear + stats.clarity.unclear + stats.traction.clear + stats.traction.unclear;
  const latestSignal = [...Object.values(state.events), ...Object.values(state.feedback)]
    .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')))[0];

  if (refs.growthLabStatus) {
    refs.growthLabStatus.textContent = state.config.updatedAt
      ? `Watching live data • config updated ${formatTimestamp(state.config.updatedAt)}`
      : 'Watching live data';
  }
  if (refs.growthCurrentWinner) {
    refs.growthCurrentWinner.textContent = state.config.winner ? VARIANTS[state.config.winner].label : 'None';
  }
  if (refs.growthWinnerReason) {
    refs.growthWinnerReason.textContent = state.config.winnerReason || 'Traffic is still split between variants.';
  }
  if (refs.growthAutoMode) {
    refs.growthAutoMode.textContent = state.config.autoMode ? 'Auto' : 'Manual';
  }
  if (refs.growthTotalViews) refs.growthTotalViews.textContent = String(totalViews);
  if (refs.growthTotalClicks) refs.growthTotalClicks.textContent = String(totalClicks);
  if (refs.growthTotalFeedback) refs.growthTotalFeedback.textContent = String(totalFeedback);
  if (refs.growthLastSignal) {
    refs.growthLastSignal.textContent = latestSignal
      ? `${latestSignal.variant || 'unknown'} • ${latestSignal.eventType || latestSignal.sentiment} • ${formatTimestamp(latestSignal.timestamp)}`
      : 'No signals yet';
  }

  const clarityClickRate = stats.clarity.views ? stats.clarity.clicks / stats.clarity.views : 0;
  const tractionClickRate = stats.traction.views ? stats.traction.clicks / stats.traction.views : 0;
  if (refs.clarityViews) refs.clarityViews.textContent = String(stats.clarity.views);
  if (refs.clarityClicks) refs.clarityClicks.textContent = String(stats.clarity.clicks);
  if (refs.clarityClickRate) refs.clarityClickRate.textContent = percent(clarityClickRate);
  if (refs.clarityFeedback) refs.clarityFeedback.textContent = `${stats.clarity.clear} clear / ${stats.clarity.unclear} vague`;
  if (refs.claritySummary) {
    refs.claritySummary.textContent = stats.clarity.views
      ? `Clarity version clicked ${percent(clarityClickRate)} of the time.`
      : 'No clarity-first data yet.';
  }

  if (refs.tractionViews) refs.tractionViews.textContent = String(stats.traction.views);
  if (refs.tractionClicks) refs.tractionClicks.textContent = String(stats.traction.clicks);
  if (refs.tractionClickRate) refs.tractionClickRate.textContent = percent(tractionClickRate);
  if (refs.tractionFeedback) refs.tractionFeedback.textContent = `${stats.traction.clear} clear / ${stats.traction.unclear} vague`;
  if (refs.tractionSummary) {
    refs.tractionSummary.textContent = stats.traction.views
      ? `Traction version clicked ${percent(tractionClickRate)} of the time.`
      : 'No traction-first data yet.';
  }

  const feedbackEntries = Object.values(state.feedback)
    .filter(entry => entry.page === 'homepage' && entry.variant)
    .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')))
    .slice(0, 8);
  renderList(
    refs.growthFeedbackList,
    feedbackEntries,
    entry => `
      <article class="rounded-xl border border-white/5 bg-slate-950/80 p-4 text-sm text-slate-300">
        <div class="flex items-center justify-between gap-3">
          <strong class="text-slate-100">${VARIANTS[entry.variant]?.label || entry.variant}</strong>
          <span class="text-xs text-slate-500">${formatTimestamp(entry.timestamp)}</span>
        </div>
        <p class="mt-2 text-xs uppercase tracking-[0.24em] ${entry.sentiment === 'clear' ? 'text-cyan-300' : 'text-amber-300'}">${entry.sentiment}</p>
        <p class="mt-2 text-xs text-slate-500">Visitor ${shortVisitor(entry.visitorId)} • ${entry.source || 'unknown source'}</p>
      </article>
    `,
    'No feedback entries yet.'
  );

  const eventEntries = Object.values(state.events)
    .filter(entry => entry.page === 'homepage' && entry.variant)
    .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')))
    .slice(0, 8);
  renderList(
    refs.growthEventList,
    eventEntries,
    entry => `
      <article class="rounded-xl border border-white/5 bg-slate-950/80 p-4 text-sm text-slate-300">
        <div class="flex items-center justify-between gap-3">
          <strong class="text-slate-100">${VARIANTS[entry.variant]?.label || entry.variant}</strong>
          <span class="text-xs text-slate-500">${formatTimestamp(entry.timestamp)}</span>
        </div>
        <p class="mt-2 text-xs uppercase tracking-[0.24em] text-cyan-300">${entry.eventType}</p>
        <p class="mt-2 text-xs text-slate-500">${entry.cta ? `CTA: ${entry.cta}` : 'Hero exposure'} • Visitor ${shortVisitor(entry.visitorId)}</p>
      </article>
    `,
    'No homepage events yet.'
  );

  const recommended = pickRecommendedWinner(stats);
  if (refs.growthConfigStatus && !state.config.winnerReason) {
    refs.growthConfigStatus.textContent = recommended
      ? `Recommended winner: ${recommended.key}.`
      : 'Waiting for enough split traffic to recommend a winner.';
  }
}

function writeConfig(configNode, patch, message) {
  if (!configNode || typeof configNode.put !== 'function') {
    return;
  }
  state.config = {
    ...state.config,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  configNode.put(state.config);
  if (refs.growthConfigStatus) {
    refs.growthConfigStatus.textContent = message;
  }
}

function maybeAutoPromote(configNode) {
  const recommended = pickRecommendedWinner(computeStats());
  if (!state.config.autoMode || !recommended) {
    state.lastAutoSignature = '';
    return;
  }
  if (state.config.winner === recommended.key && state.config.winnerReason === recommended.reason) {
    return;
  }
  if (state.lastAutoSignature === recommended.signature) {
    return;
  }
  state.lastAutoSignature = recommended.signature;
  writeConfig(configNode, {
    winner: recommended.key,
    winnerReason: recommended.reason,
  }, `Auto-promoted ${recommended.key}.`);
}

function bindActions(configNode) {
  refs.setWinnerClarity?.addEventListener('click', () => {
    writeConfig(configNode, {
      autoMode: false,
      winner: 'clarity',
      winnerReason: 'Manual promote from Growth Lab.',
    }, 'Clarity variant promoted manually.');
  });

  refs.setWinnerTraction?.addEventListener('click', () => {
    writeConfig(configNode, {
      autoMode: false,
      winner: 'traction',
      winnerReason: 'Manual promote from Growth Lab.',
    }, 'Traction variant promoted manually.');
  });

  refs.clearWinner?.addEventListener('click', () => {
    writeConfig(configNode, {
      winner: '',
      winnerReason: '',
    }, 'Live winner cleared. Traffic will split again.');
  });

  refs.toggleAutoMode?.addEventListener('click', () => {
    const nextMode = !state.config.autoMode;
    writeConfig(configNode, {
      autoMode: nextMode,
    }, nextMode ? 'Auto mode enabled.' : 'Auto mode disabled.');
  });
}

function init() {
  const gun = createGun();
  if (!gun) {
    if (refs.growthLabStatus) {
      refs.growthLabStatus.textContent = 'Gun unavailable. Growth Lab is read-only until the relay is reachable.';
    }
    return;
  }

  const configNode = getNode(gun, EXPERIMENT_CONFIG_PATH);
  const eventsNode = getNode(gun, EXPERIMENT_EVENT_PATH);
  const feedbackNode = getNode(gun, FEEDBACK_EVENT_PATH);

  bindActions(configNode);

  configNode?.on(data => {
    state.config = normalizeConfig(data);
    render();
    maybeAutoPromote(configNode);
  });

  eventsNode?.map().on((data, id) => {
    const entry = normalizeEvent(data, id);
    if (!entry.id || !entry.variant || !entry.eventType) {
      return;
    }
    state.events[entry.id] = entry;
    render();
    maybeAutoPromote(configNode);
  });

  feedbackNode?.map().on((data, id) => {
    const entry = normalizeFeedback(data, id);
    if (!entry.id || !entry.variant || !entry.sentiment) {
      return;
    }
    state.feedback[entry.id] = entry;
    render();
    maybeAutoPromote(configNode);
  });

  render();
}

init();
