import { DEFAULT_GUN_PEERS, getNode } from '../src/growth/homepage-hero.js';
import {
  DEFAULT_MARKET_PULSE_PROFILE,
  MARKET_PULSE_DIRECTORY_PATH,
  MARKET_PULSE_LATEST_PATH,
  deserializeMarketPulseFromGun,
} from '../src/growth/market-pulse.js';

const META_MARKET_JOBS_PATH = Object.freeze([
  '3dvr-portal',
  'growth',
  'meta-market',
  'jobs',
]);

const refs = {
  marketPulseStatus: document.getElementById('marketPulseStatus'),
  pulseUpdatedAt: document.getElementById('pulseUpdatedAt'),
  pulseMarketFitScore: document.getElementById('pulseMarketFitScore'),
  pulseMarketFitVerdict: document.getElementById('pulseMarketFitVerdict'),
  pulseMarketFitNextAction: document.getElementById('pulseMarketFitNextAction'),
  pulseSignalCount: document.getElementById('pulseSignalCount'),
  pulseListingCount: document.getElementById('pulseListingCount'),
  pulseApprovalCount: document.getElementById('pulseApprovalCount'),
  pulseAutomationMode: document.getElementById('pulseAutomationMode'),
  pulseAutomationCommand: document.getElementById('pulseAutomationCommand'),
  pulseAutomationPolicy: document.getElementById('pulseAutomationPolicy'),
  pulseMetaGraphPlan: document.getElementById('pulseMetaGraphPlan'),
  pulseTopOpportunity: document.getElementById('pulseTopOpportunity'),
  pulseTopProblem: document.getElementById('pulseTopProblem'),
  pulseMarket: document.getElementById('pulseMarket'),
  pulseOpportunityList: document.getElementById('pulseOpportunityList'),
  pulseActionList: document.getElementById('pulseActionList'),
  pulseDirectoryStatus: document.getElementById('pulseDirectoryStatus'),
  pulseDirectoryList: document.getElementById('pulseDirectoryList'),
  pulseSocialProbeList: document.getElementById('pulseSocialProbeList'),
  pulseReactionList: document.getElementById('pulseReactionList'),
  pulseOutreachList: document.getElementById('pulseOutreachList'),
  pulseTestList: document.getElementById('pulseTestList'),
};

const state = {
  latest: null,
  directory: Object.create(null),
  directoryNode: null,
  metaMarketJobs: Object.create(null),
  metaMarketJobsNode: null,
};

function createGun() {
  if (typeof window.Gun !== 'function') {
    return null;
  }

  try {
    return window.Gun({ peers: window.__GUN_PEERS__ || DEFAULT_GUN_PEERS });
  } catch (error) {
    console.warn('Market pulse Gun init failed', error);
    try {
      return window.Gun({
        peers: window.__GUN_PEERS__ || DEFAULT_GUN_PEERS,
        radisk: false,
        localStorage: false,
      });
    } catch (fallbackError) {
      console.warn('Market pulse Gun fallback failed', fallbackError);
      return null;
    }
  }
}

function safe(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeAttr(value) {
  return safe(value).replace(/`/g, '&#96;');
}

function formatTimestamp(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function percentScore(value) {
  const score = Number(value || 0);
  if (!Number.isFinite(score)) return '0';
  return String(Math.round(score));
}

function shellQuote(value = '') {
  return `'${String(value || '').replace(/'/g, `'"'"'`)}'`;
}

async function copyText(value = '') {
  const text = String(value || '').trim();
  if (!text) return false;
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'readonly');
  textarea.className = 'fixed -left-[9999px] top-0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
  return true;
}

function listFromLatest(key) {
  const latest = state.latest || {};
  return Array.isArray(latest[key]) ? latest[key] : [];
}

function directoryItems() {
  const live = Object.values(state.directory).filter(Boolean);
  if (live.length) {
    return live.sort((left, right) => Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0));
  }
  return listFromLatest('directoryListings');
}

function emptyBlock(message) {
  return `<div class="rounded-md border border-dashed border-white/15 bg-zinc-950/70 p-4 text-sm text-zinc-400">${safe(message)}</div>`;
}

function extractPathSegment(url = '', beforeSegment = '') {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const index = parts.indexOf(beforeSegment);
    return index > 0 ? parts[index - 1] : '';
  } catch (_error) {
    return '';
  }
}

function concreteTargetId(value = '') {
  const normalized = String(value || '').trim();
  return normalized.includes('{') ? '' : normalized;
}

function socialProbeIntegrationNote(item = {}) {
  if (item.metaGraph?.integration === 'meta_graph_api') {
    return '<p class="mt-2 rounded border border-sky-300/15 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">Meta Graph API ready: publish after approval, then measure the returned post id.</p>';
  }
  if (item.threadsApi?.integration === 'threads_api') {
    return '<p class="mt-2 rounded border border-violet-300/15 bg-violet-500/10 px-3 py-2 text-xs text-violet-100">Threads API ready: create a text container, publish after approval, then measure owned-post insights.</p>';
  }
  return '';
}

function queuedProbeRecord(probeId = '') {
  return state.metaMarketJobs[String(probeId || '').trim()] || null;
}

function buildMetaMarketJobFromProbe(probe = {}) {
  const metaGraph = probe.metaGraph || null;
  const threadsApi = probe.threadsApi || null;
  const plan = metaGraph || threadsApi;
  if (!plan) return null;

  const now = new Date().toISOString();
  return {
    id: probe.id || plan.id,
    experimentId: plan.id || probe.id || '',
    status: 'approved',
    channel: plan.channel || probe.channel || '',
    channelLabel: plan.channelLabel || probe.channelLabel || '',
    integration: plan.integration || probe.integration || '',
    title: probe.title || '',
    surface: probe.surface || '',
    linkedOpportunityId: probe.linkedOpportunityId || '',
    message: probe.prompt || plan.publishRequest?.body?.message || plan.publishRequest?.body?.text || '',
    link: probe.link || metaGraph?.publishRequest?.body?.link || '',
    pageId: concreteTargetId(extractPathSegment(metaGraph?.publishRequest?.url, 'feed')),
    threadsUserId: concreteTargetId(extractPathSegment(threadsApi?.publishRequest?.url, 'threads')),
    approvalSource: 'market-pulse-dashboard',
    approvedBy: 'market-pulse-dashboard',
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
    error: '',
  };
}

function queueButtonMarkup(item = {}) {
  if (!(item.metaGraph || item.threadsApi)) {
    return '';
  }

  const queued = queuedProbeRecord(item.id);
  if (queued) {
    return `<span class="mt-3 inline-flex rounded border border-emerald-300/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-100">Worker queue: ${safe(queued.status || 'approved')}</span>`;
  }

  return `
    <button
      type="button"
      class="mt-3 rounded border border-emerald-300/30 bg-emerald-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-300"
      data-queue-probe="${safeAttr(item.id)}"
    >Approve for worker</button>
  `;
}

function renderOpportunityList() {
  const opportunities = listFromLatest('opportunities').slice(0, 4);
  if (!refs.pulseOpportunityList) return;
  if (!opportunities.length) {
    refs.pulseOpportunityList.innerHTML = emptyBlock('No opportunities loaded yet.');
    return;
  }

  refs.pulseOpportunityList.innerHTML = opportunities.map((item) => `
    <article class="rounded-md border border-white/10 bg-zinc-950/70 p-4">
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-sm font-semibold text-zinc-100">${safe(item.title)}</h3>
        <span class="rounded bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">${safe(percentScore(item.score))}</span>
      </div>
      <p class="mt-2 text-xs text-zinc-400">${safe(item.problem)}</p>
      <p class="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">${safe(item.suggestedPrice || '')}</p>
    </article>
  `).join('');
}

function renderActions() {
  const actions = listFromLatest('salesActions');
  if (!refs.pulseActionList) return;
  if (!actions.length) {
    refs.pulseActionList.innerHTML = emptyBlock('No actions loaded yet.');
    return;
  }

  refs.pulseActionList.innerHTML = actions.map((item) => `
    <article class="rounded-md border border-white/10 bg-zinc-950/70 p-4">
      <div class="flex items-start justify-between gap-3">
        <strong class="text-sm text-zinc-100">${safe(item.label)}</strong>
        <span class="rounded px-2 py-1 text-xs ${item.approvalStatus === 'required' ? 'bg-amber-400/10 text-amber-200' : 'bg-emerald-400/10 text-emerald-200'}">${safe(item.approvalStatus)}</span>
      </div>
      <p class="mt-2 text-xs text-zinc-400">${safe(item.detail)}</p>
      <p class="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">${safe(item.risk)}</p>
    </article>
  `).join('');
}

function renderSocialProbes() {
  const probes = listFromLatest('socialProbeDrafts');
  if (!refs.pulseSocialProbeList) return;
  if (!probes.length) {
    refs.pulseSocialProbeList.innerHTML = emptyBlock('No social probes loaded yet.');
    return;
  }

  refs.pulseSocialProbeList.innerHTML = probes.slice(0, 6).map((item) => `
    <article class="rounded-md border border-white/10 bg-zinc-950/70 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <strong class="text-sm text-zinc-100">${safe(item.channelLabel || item.channel)}</strong>
          <p class="mt-1 text-xs text-zinc-500">${safe(item.surface || 'social probe')}</p>
        </div>
        <span class="rounded px-2 py-1 text-xs ${item.risk === 'external_write' ? 'bg-amber-400/10 text-amber-200' : 'bg-cyan-400/10 text-cyan-200'}">${safe(item.approvalStatus || 'draft')}</span>
      </div>
      <p class="mt-3 whitespace-pre-wrap text-sm text-zinc-300">${safe(item.prompt)}</p>
      <p class="mt-3 text-xs text-zinc-500">${safe(item.successMetric)}</p>
      ${socialProbeIntegrationNote(item)}
      <button
        type="button"
        class="mt-3 rounded border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/10"
        data-copy-probe="${safeAttr(item.id)}"
      >Copy draft</button>
      ${queueButtonMarkup(item)}
    </article>
  `).join('');

  refs.pulseSocialProbeList.querySelectorAll('[data-copy-probe]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-copy-probe');
      const probe = probes.find((item) => item.id === id);
      if (!probe) return;
      await copyText(probe.prompt);
      button.textContent = 'Copied';
    });
  });
  refs.pulseSocialProbeList.querySelectorAll('[data-queue-probe]').forEach((button) => {
    button.addEventListener('click', () => queueSocialProbe(button.getAttribute('data-queue-probe')));
  });
}

function renderReactions() {
  const snapshots = listFromLatest('reactionSnapshots');
  if (!refs.pulseReactionList) return;
  if (!snapshots.length) {
    refs.pulseReactionList.innerHTML = emptyBlock('No reactions loaded yet.');
    return;
  }

  refs.pulseReactionList.innerHTML = snapshots.map((item) => `
    <article class="rounded-md border border-white/10 bg-zinc-950/70 p-4">
      <div class="flex items-start justify-between gap-3">
        <strong class="text-sm text-zinc-100">${safe(item.channelLabel || item.channel)}</strong>
        <span class="rounded bg-fuchsia-400/10 px-2 py-1 text-xs text-fuchsia-200">${safe(percentScore(item.marketFitScore))}</span>
      </div>
      <div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs text-zinc-400">
        <span class="rounded bg-white/5 px-2 py-2">${safe(String(item.signalCount || 0))} signals</span>
        <span class="rounded bg-white/5 px-2 py-2">${safe(String(item.commentCount || 0))} comments</span>
        <span class="rounded bg-white/5 px-2 py-2">${safe(String(item.reactionCount || 0))} reactions</span>
      </div>
      <p class="mt-3 text-xs text-zinc-400">${safe(item.topSignalTitle || 'No top signal yet.')}</p>
      ${item.topSignalUrl ? `<a href="${safeAttr(item.topSignalUrl)}" target="_blank" rel="noopener" class="mt-2 inline-flex text-xs font-semibold text-cyan-200 hover:text-white">Open signal</a>` : ''}
    </article>
  `).join('');
}

function automationCommand(latest = {}) {
  const profile = latest.profile || {};
  const market = profile.market || DEFAULT_MARKET_PULSE_PROFILE.market;
  const keywords = Array.isArray(profile.keywords) && profile.keywords.length
    ? profile.keywords.slice(0, 8)
    : DEFAULT_MARKET_PULSE_PROFILE.keywords;
  const channels = DEFAULT_MARKET_PULSE_PROFILE.channels;
  return [
    'npm run market:pulse --',
    `--market ${shellQuote(market)}`,
    `--keywords ${shellQuote(keywords.join(','))}`,
    `--channels ${shellQuote(channels.join(','))}`,
    `--limit ${Number(profile.limit || DEFAULT_MARKET_PULSE_PROFILE.limit)}`,
  ].join(' ');
}

function renderAutomation() {
  const latest = state.latest || {};
  const policy = latest.automationPolicy || {};
  const metaProbe = listFromLatest('socialProbeDrafts').find((item) => {
    return item.integration === 'meta_graph_api' || item.metaGraph?.integration === 'meta_graph_api';
  });
  const threadsProbe = listFromLatest('socialProbeDrafts').find((item) => {
    return item.integration === 'threads_api' || item.threadsApi?.integration === 'threads_api';
  });
  if (refs.pulseAutomationMode) {
    refs.pulseAutomationMode.textContent = latest.runId
      ? `Latest run ${latest.runId} is ready for automatic refreshes. Social writes stay approval-gated.`
      : 'Run the market-fit automation to populate public signals, social probes, and reaction radar.';
  }
  if (refs.pulseAutomationCommand) {
    refs.pulseAutomationCommand.textContent = automationCommand(latest);
  }
  if (!refs.pulseAutomationPolicy) return;

  const items = [
    ['Market research', policy.marketResearch || 'Automatic when the runner executes.'],
    ['Social listening', policy.socialListening || 'Automatic for supported public sources.'],
    ['Social posting', policy.socialPosting || 'Draft only until approved.'],
    ['Outreach', policy.outreach || 'Draft only until approved.'],
  ];
  refs.pulseAutomationPolicy.innerHTML = items.map(([label, value]) => `
    <span class="rounded bg-white/5 px-3 py-2">
      <strong class="block text-zinc-100">${safe(label)}</strong>
      <span class="mt-1 block text-zinc-400">${safe(value)}</span>
    </span>
  `).join('');

  if (!refs.pulseMetaGraphPlan) return;
  if (!metaProbe?.metaGraph && !threadsProbe?.threadsApi) {
    refs.pulseMetaGraphPlan.textContent = 'Meta publishing path: approve a Facebook Page or Threads probe, publish from the server worker, store the post id, then measure comments, reactions, shares, clicks, views, and impressions.';
    return;
  }

  const planCards = [];
  if (metaProbe?.metaGraph) {
    const permissions = Array.isArray(metaProbe.metaGraph.requiredPermissions)
      ? metaProbe.metaGraph.requiredPermissions.join(', ')
      : 'pages access permissions';
    const metrics = metaProbe.metaGraph.measurementRequests?.[1]?.metrics || [];
    planCards.push(`
      <strong class="block text-sky-100">Facebook Page experiment</strong>
      <span class="mt-1 block text-sky-100/80">${safe(metaProbe.title || 'Facebook Page probe')}</span>
      <span class="mt-2 block text-xs text-sky-100/70">Permissions: ${safe(permissions)}</span>
      <span class="mt-1 block text-xs text-sky-100/70">Metrics: ${safe(metrics.join(', ') || 'post reactions, comments, shares, clicks, impressions')}</span>
    `);
  }
  if (threadsProbe?.threadsApi) {
    const permissions = Array.isArray(threadsProbe.threadsApi.requiredPermissions)
      ? threadsProbe.threadsApi.requiredPermissions.join(', ')
      : 'threads access permissions';
    const metrics = threadsProbe.threadsApi.measurementRequests?.[1]?.metrics || [];
    planCards.push(`
      <strong class="mt-4 block text-violet-100">Threads experiment</strong>
      <span class="mt-1 block text-violet-100/80">${safe(threadsProbe.title || 'Threads probe')}</span>
      <span class="mt-2 block text-xs text-violet-100/70">Permissions: ${safe(permissions)}</span>
      <span class="mt-1 block text-xs text-violet-100/70">Metrics: ${safe(metrics.join(', ') || 'views, likes, replies, reposts, quotes')}</span>
    `);
  }
  refs.pulseMetaGraphPlan.innerHTML = planCards.join('');
}

function approveListing(id) {
  const listing = directoryItems().find((item) => item.id === id);
  if (!listing || !state.directoryNode) return;
  const approved = {
    ...listing,
    approved: true,
    approvalStatus: 'approved',
    approvedAt: new Date().toISOString(),
    approvedBy: 'market-pulse-dashboard',
  };
  state.directory[id] = approved;
  state.directoryNode.get(id).put(approved);
  render();
}

function queueSocialProbe(id) {
  const probe = listFromLatest('socialProbeDrafts').find((item) => item.id === id);
  const job = buildMetaMarketJobFromProbe(probe);
  if (!job || !state.metaMarketJobsNode) return;

  state.metaMarketJobs[job.id] = job;
  state.metaMarketJobsNode.get(job.id).put(job);
  render();
}

function renderDirectory() {
  const listings = directoryItems();
  if (refs.pulseDirectoryStatus) {
    refs.pulseDirectoryStatus.textContent = `${listings.filter((item) => item.approved).length} approved`;
  }
  if (!refs.pulseDirectoryList) return;
  if (!listings.length) {
    refs.pulseDirectoryList.innerHTML = emptyBlock('No directory listings loaded yet.');
    return;
  }

  refs.pulseDirectoryList.innerHTML = listings.map((item) => {
    const approved = item.approved || item.approvalStatus === 'approved';
    const button = approved
      ? '<span class="rounded bg-emerald-400/10 px-2 py-1 text-xs text-emerald-200">Approved</span>'
      : `<button type="button" class="rounded bg-sky-400 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-sky-300" data-approve-listing="${safeAttr(item.id)}">Approve</button>`;
    return `
      <article class="rounded-md border border-white/10 bg-zinc-950/70 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 class="text-sm font-semibold text-zinc-100">${safe(item.title)}</h3>
            <p class="mt-1 text-xs text-zinc-400">${safe(item.market)}</p>
          </div>
          ${button}
        </div>
        <p class="mt-3 text-sm text-zinc-300">${safe(item.pain)}</p>
        <p class="mt-2 text-xs text-sky-200">${safe(item.recommendedOffer)}</p>
        <div class="mt-3 flex flex-wrap gap-2 text-xs text-zinc-400">
          <span>${safe(item.confidence)} confidence</span>
          <span>${safe(percentScore(item.confidenceScore))} score</span>
          <span>${safe(formatTimestamp(item.updatedAt))}</span>
        </div>
      </article>
    `;
  }).join('');

  refs.pulseDirectoryList.querySelectorAll('[data-approve-listing]').forEach((button) => {
    button.addEventListener('click', () => approveListing(button.getAttribute('data-approve-listing')));
  });
}

function renderOutreach() {
  const drafts = listFromLatest('outreachDrafts');
  if (!refs.pulseOutreachList) return;
  if (!drafts.length) {
    refs.pulseOutreachList.innerHTML = emptyBlock('No outreach drafts loaded yet.');
    return;
  }

  refs.pulseOutreachList.innerHTML = drafts.map((item) => {
    const params = new URLSearchParams({
      draft: '1',
      source: 'market-pulse',
      lead: item.title || 'Market pulse lead',
      subject: item.subject || '3dvr follow-up idea',
      pain: item.opener || '',
      next: 'Review and approve before sending',
      tags: 'market-pulse,approval-required',
    });
    return `
      <article class="rounded-md border border-white/10 bg-zinc-950/70 p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <strong class="text-sm text-zinc-100">${safe(item.title)}</strong>
          <span class="rounded bg-amber-400/10 px-2 py-1 text-xs text-amber-200">${safe(item.approvalStatus)}</span>
        </div>
        <p class="mt-2 text-xs text-zinc-400">${safe(item.opener)}</p>
        <a href="../email-operator/index.html?${params.toString()}" class="mt-3 inline-flex rounded border border-white/15 px-3 py-1.5 text-xs font-semibold text-zinc-100 hover:bg-white/10">Open draft</a>
      </article>
    `;
  }).join('');
}

function renderTests() {
  const tests = listFromLatest('tests');
  if (!refs.pulseTestList) return;
  if (!tests.length) {
    refs.pulseTestList.innerHTML = emptyBlock('No tests loaded yet.');
    return;
  }

  refs.pulseTestList.innerHTML = tests.map((item) => `
    <article class="rounded-md border border-white/10 bg-zinc-950/70 p-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <strong class="text-sm text-zinc-100">${safe(item.id || item.surface)}</strong>
        <span class="rounded bg-violet-400/10 px-2 py-1 text-xs text-violet-200">${safe(item.approvalStatus)}</span>
      </div>
      <p class="mt-2 text-xs text-zinc-400">${safe(item.metric)}</p>
      <p class="mt-3 text-xs uppercase tracking-[0.18em] text-zinc-500">${safe(item.surface)}</p>
    </article>
  `).join('');
}

function render() {
  const latest = state.latest || {};
  const top = latest.topOpportunity || {};
  const listings = directoryItems();

  if (refs.marketPulseStatus) {
    refs.marketPulseStatus.textContent = latest.runId
      ? `Run ${latest.runId} loaded. Outreach stays approval-gated; approved aggregate listings can feed the public directory.`
      : 'Waiting for the latest market pulse.';
  }
  if (refs.pulseUpdatedAt) refs.pulseUpdatedAt.textContent = formatTimestamp(latest.generatedAt);
  if (refs.pulseMarketFitScore) refs.pulseMarketFitScore.textContent = percentScore(latest.marketFit?.score);
  if (refs.pulseMarketFitVerdict) refs.pulseMarketFitVerdict.textContent = latest.marketFit?.verdict || 'Searching';
  if (refs.pulseMarketFitNextAction) {
    refs.pulseMarketFitNextAction.textContent = latest.marketFit?.nextAction || 'Waiting for market-fit data.';
  }
  if (refs.pulseSignalCount) refs.pulseSignalCount.textContent = String(latest.signalsAnalyzed || 0);
  if (refs.pulseListingCount) refs.pulseListingCount.textContent = String(listings.filter((item) => item.approved).length);
  if (refs.pulseApprovalCount) refs.pulseApprovalCount.textContent = String(latest.approvalsRequired || 0);
  if (refs.pulseTopOpportunity) refs.pulseTopOpportunity.textContent = top.title || 'Waiting for pulse data';
  if (refs.pulseTopProblem) refs.pulseTopProblem.textContent = top.problem || 'The next scheduled run will fill this from live demand signals.';
  if (refs.pulseMarket) refs.pulseMarket.textContent = latest.profile?.market || '--';

  renderOpportunityList();
  renderAutomation();
  renderActions();
  renderSocialProbes();
  renderReactions();
  renderDirectory();
  renderOutreach();
  renderTests();
}

function normalizeListing(data = {}, id = '') {
  return {
    id: String(data.id || id || '').trim(),
    title: String(data.title || '').trim(),
    market: String(data.market || '').trim(),
    pain: String(data.pain || '').trim(),
    recommendedOffer: String(data.recommendedOffer || '').trim(),
    suggestedPrice: String(data.suggestedPrice || '').trim(),
    confidence: String(data.confidence || '').trim(),
    confidenceScore: Number(data.confidenceScore || 0),
    approved: Boolean(data.approved || data.approvalStatus === 'approved'),
    approvalStatus: String(data.approvalStatus || '').trim(),
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
    updatedAt: String(data.updatedAt || '').trim(),
    source: String(data.source || '').trim(),
  };
}

function normalizeMetaMarketJob(data = {}, id = '') {
  return {
    id: String(data.id || id || '').trim(),
    status: String(data.status || '').trim(),
    channel: String(data.channel || '').trim(),
    integration: String(data.integration || '').trim(),
    approvedAt: String(data.approvedAt || '').trim(),
    updatedAt: String(data.updatedAt || '').trim(),
  };
}

function init() {
  const gun = createGun();
  if (!gun) {
    if (refs.marketPulseStatus) {
      refs.marketPulseStatus.textContent = 'Gun unavailable. Market pulse data cannot load.';
    }
    return;
  }

  const latestNode = getNode(gun, MARKET_PULSE_LATEST_PATH);
  state.directoryNode = getNode(gun, MARKET_PULSE_DIRECTORY_PATH);
  state.metaMarketJobsNode = getNode(gun, META_MARKET_JOBS_PATH);

  latestNode?.on((data) => {
    state.latest = deserializeMarketPulseFromGun(data || {});
    render();
  });

  state.directoryNode?.map().on((data, id) => {
    if (!id) return;
    if (!data) {
      delete state.directory[id];
    } else {
      state.directory[id] = normalizeListing(data, id);
    }
    render();
  });

  state.metaMarketJobsNode?.map().on((data, id) => {
    if (!id) return;
    if (!data) {
      delete state.metaMarketJobs[id];
    } else {
      state.metaMarketJobs[id] = normalizeMetaMarketJob(data, id);
    }
    render();
  });

  render();
}

init();
