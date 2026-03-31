import {
  AUTO_PROMOTION_GAP,
  DEFAULT_GUN_PEERS,
  EXPERIMENT_CONFIG_PATH,
  EXPERIMENT_EVENT_PATH,
  FEEDBACK_EVENT_PATH,
  MIN_COMPARISON_VIEWS,
  VARIANTS,
  computeStats,
  getNode,
  normalizeConfig,
  normalizeEvent,
  normalizeFeedback,
  pickRecommendedWinner,
} from '../src/growth/homepage-hero.js';

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
    updatedBy: '',
  },
  events: Object.create(null),
  feedback: Object.create(null),
  lastAutoSignature: '',
};

function createGun() {
  if (typeof window.Gun !== 'function') {
    return null;
  }

  try {
    return window.Gun({ peers: window.__GUN_PEERS__ || DEFAULT_GUN_PEERS });
  } catch (error) {
    console.warn('Growth lab Gun init failed', error);
    try {
      return window.Gun({
        peers: window.__GUN_PEERS__ || DEFAULT_GUN_PEERS,
        radisk: false,
        localStorage: false,
      });
    } catch (fallbackError) {
      console.warn('Growth lab Gun fallback failed', fallbackError);
      return null;
    }
  }
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
  const stats = computeStats(state.events, state.feedback);
  const totalViews = stats.clarity.views + stats.traction.views;
  const totalClicks = stats.clarity.clicks + stats.traction.clicks;
  const totalFeedback = stats.clarity.clear + stats.clarity.unclear + stats.traction.clear + stats.traction.unclear;
  const latestSignal = [...Object.values(state.events), ...Object.values(state.feedback)]
    .sort((left, right) => String(right.timestamp || '').localeCompare(String(left.timestamp || '')))[0];

  if (refs.growthLabStatus) {
    refs.growthLabStatus.textContent = state.config.updatedAt
      ? `Watching live data • config updated ${formatTimestamp(state.config.updatedAt)}${state.config.updatedBy ? ` via ${state.config.updatedBy}` : ''}`
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

  const recommended = pickRecommendedWinner(stats, {
    minComparisonViews: MIN_COMPARISON_VIEWS,
    autoPromotionGap: AUTO_PROMOTION_GAP,
  });
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
    updatedBy: 'growth-lab',
  };
  configNode.put(state.config);
  if (refs.growthConfigStatus) {
    refs.growthConfigStatus.textContent = message;
  }
}

function maybeAutoPromote(configNode) {
  const recommended = pickRecommendedWinner(computeStats(state.events, state.feedback), {
    minComparisonViews: MIN_COMPARISON_VIEWS,
    autoPromotionGap: AUTO_PROMOTION_GAP,
  });
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
