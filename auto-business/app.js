const elements = {
  refresh: document.getElementById('refreshRadar'),
  status: document.getElementById('radarStatus'),
  marketFit: document.getElementById('marketFit'),
  marketVerdict: document.getElementById('marketVerdict'),
  signalCount: document.getElementById('signalCount'),
  lastScan: document.getElementById('lastScan'),
  scanAge: document.getElementById('scanAge'),
  approvalCount: document.getElementById('approvalCount'),
  topOpportunityTitle: document.getElementById('topOpportunityTitle'),
  topOpportunityProblem: document.getElementById('topOpportunityProblem'),
  topOpportunityScore: document.getElementById('topOpportunityScore'),
  marketNextAction: document.getElementById('marketNextAction'),
  channelList: document.getElementById('channelList'),
  opportunityList: document.getElementById('opportunityList'),
  warningList: document.getElementById('warningList')
};

const MARKET_PULSE_PATH = ['3dvr-portal', 'growth', 'market-pulse', 'latest'];
let gun = null;

function getNode(root, path) {
  return path.reduce((node, key) => node.get(key), root);
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return parsed ?? fallback;
  } catch (_error) {
    return fallback;
  }
}

function compactText(value, fallback = '') {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function timeAgo(iso) {
  const time = Date.parse(iso || '');
  if (!Number.isFinite(time)) return 'unknown age';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return 'seconds ago';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatDate(iso) {
  const time = Date.parse(iso || '');
  if (!Number.isFinite(time)) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(time));
}

function item(title, detail, href = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'compact-item';

  const strong = document.createElement('strong');
  if (href) {
    const link = document.createElement('a');
    link.href = href;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = title;
    strong.append(link);
  } else {
    strong.textContent = title;
  }
  wrapper.append(strong);

  if (detail) {
    const span = document.createElement('span');
    span.textContent = detail;
    wrapper.append(span);
  }
  return wrapper;
}

function replaceList(target, nodes, emptyText) {
  if (!target) return;
  target.replaceChildren(...(nodes.length ? nodes : [item(emptyText, '')]));
}

function setStatus(message, tone = '') {
  elements.status.textContent = message;
  elements.status.className = `radar-status${tone ? ` ${tone}` : ''}`;
}

function deserialize(record = {}) {
  return {
    runId: compactText(record.runId),
    generatedAt: compactText(record.generatedAt),
    market: compactText(record.market),
    signalsAnalyzed: Number(record.signalsAnalyzed || 0),
    approvalsRequired: Number(record.approvalsRequired || 0),
    topOpportunity: {
      title: compactText(record.topOpportunityTitle),
      problem: compactText(record.topOpportunityProblem),
      score: Number(record.topOpportunityScore || 0)
    },
    marketFit: parseJson(record.marketFitJson, {}),
    opportunities: parseJson(record.opportunitiesJson, []),
    reactionSnapshots: parseJson(record.reactionSnapshotsJson, []),
    warnings: parseJson(record.warningsJson, [])
  };
}

function renderPulse(record) {
  const pulse = deserialize(record);
  const hasPulse = Boolean(pulse.runId || pulse.generatedAt || pulse.topOpportunity.title);

  if (!hasPulse) {
    setStatus('No Market Pulse record is available yet. The server runner needs to complete a scan.', 'warn');
    return;
  }

  const fitScore = Number(pulse.marketFit?.score || 0);
  const verdict = compactText(pulse.marketFit?.verdict, 'searching');
  const nextAction = compactText(pulse.marketFit?.nextAction, 'Collect more evidence before building.');

  elements.marketFit.textContent = fitScore ? `${fitScore}/100` : '—';
  elements.marketVerdict.textContent = verdict;
  elements.signalCount.textContent = String(pulse.signalsAnalyzed || 0);
  elements.lastScan.textContent = formatDate(pulse.generatedAt);
  elements.scanAge.textContent = timeAgo(pulse.generatedAt);
  elements.approvalCount.textContent = String(pulse.approvalsRequired || 0);

  elements.topOpportunityTitle.textContent = pulse.topOpportunity.title || 'No ranked opportunity yet';
  elements.topOpportunityProblem.textContent = pulse.topOpportunity.problem || 'The latest scan did not produce a clear buyer problem.';
  elements.topOpportunityScore.textContent = pulse.topOpportunity.score ? `${pulse.topOpportunity.score}/100` : '—';
  elements.marketNextAction.textContent = nextAction;

  const channels = Array.isArray(pulse.reactionSnapshots) ? pulse.reactionSnapshots : [];
  replaceList(
    elements.channelList,
    channels.slice(0, 6).map(channel => item(
      compactText(channel.channelLabel || channel.channel, 'Unknown channel'),
      `${Number(channel.signalCount || 0)} signals · ${Number(channel.commentCount || 0)} comments · fit ${Number(channel.marketFitScore || 0)}/100`,
      compactText(channel.topSignalUrl)
    )),
    'No channel evidence in this scan.'
  );

  const opportunities = Array.isArray(pulse.opportunities) ? pulse.opportunities : [];
  replaceList(
    elements.opportunityList,
    opportunities.slice(0, 6).map(opportunity => item(
      compactText(opportunity.title, 'Unnamed opportunity'),
      `${compactText(opportunity.suggestedPrice, 'price unknown')} · score ${Number(opportunity.score || 0)}/100`
    )),
    'No ranked opportunities yet.'
  );

  const warnings = Array.isArray(pulse.warnings) ? pulse.warnings : [];
  replaceList(
    elements.warningList,
    warnings.slice(0, 6).map(warning => item(compactText(warning, 'Unknown warning'), '')), 
    'No warnings in the latest scan.'
  );

  const marketSuffix = pulse.market ? ` for ${pulse.market}` : '';
  setStatus(`Loaded ${pulse.runId || 'latest scan'}${marketSuffix}.`, 'good');
}

function readLatest() {
  if (typeof window.Gun !== 'function') {
    setStatus('GUN is unavailable in this browser, so live Market Pulse data cannot be read.', 'warn');
    return;
  }

  if (!gun) {
    gun = window.Gun({
      peers: Array.isArray(window.__GUN_PEERS__) ? window.__GUN_PEERS__ : [],
      localStorage: false,
      radisk: false
    });
  }

  setStatus('Reading the latest Market Pulse…');
  const node = getNode(gun, MARKET_PULSE_PATH);
  let finished = false;
  const timeout = window.setTimeout(() => {
    if (finished) return;
    finished = true;
    setStatus('Market Pulse read timed out. The page still works, but the relay may be unavailable.', 'warn');
  }, 5000);

  node.once(record => {
    if (finished) return;
    finished = true;
    window.clearTimeout(timeout);
    renderPulse(record || {});
  });
}

elements.refresh?.addEventListener('click', readLatest);
readLatest();
