import { queueOperatorTask, watchOperatorTask } from '../operator/delegate-task.js';

const CAMPAIGN_STORAGE_KEY = '3dvr.growthOperator.activeCampaign.v1';
const LAUNCH_ROOM_STORAGE_KEY = '3dvr.launch-room.movement-brief.v1';
const DEFAULT_CAMPAIGN = 'my-skill';
const CAMPAIGN_PRESETS = Object.freeze({
  'av-freelance': {
    label: 'AV freelance', title: 'Get booked for live events', description: 'Find production companies, venues, hotels, event agencies, labor providers, and AV teams that regularly need freelance technicians.', offer: 'Freelance audio visual support', audience: 'Production companies, AV vendors, venues, hotels, event agencies, and labor providers that book freelance AV technicians.',
    research: 'Find up to 10 relevant organizations in the chosen market that publicly produce live events or staff AV crews. Prefer public staffing, production, operations, or general business contact routes. Look for real signals such as upcoming events, production services, freelancer rosters, or hiring pages. Never guess a private contact address.',
    messageAngle: 'A short availability introduction: what kind of AV work the freelancer can do, where they work, and a tiny ask for the right staffing or production contact.'
  },
  'web-design': {
    label: 'Web design', title: 'Fix visible website problems', description: 'Find small businesses with a real public website problem, then offer one small useful improvement instead of a vague redesign pitch.', offer: 'Small website or landing-page improvement', audience: 'Owner-led businesses with a visible website, mobile, conversion, intake, or follow-up problem.',
    research: 'Find up to 10 small businesses with a verifiable public web problem such as no site, a broken or unavailable site, weak mobile usability, no clear call to action, no quote or booking path, or obviously stale information. Record the exact public evidence and URL. Do not invent problems.',
    messageAngle: 'Mention one verified problem, describe the smallest useful fix, and offer to show a lightweight concept or next step.'
  },
  'lead-generation': {
    label: 'Lead generation', title: 'Sell useful prospect research', description: 'Help a business by researching a small, verified list of likely prospects with public contact paths and reasons they fit.', offer: 'Small prospect research and lead-list sprint', audience: 'Small B2B businesses and independent service providers that need a clearer prospect list but do not need a giant sales stack.',
    research: 'Find up to 10 businesses that sell a clear B2B service and appear to have a reachable niche. Research only public information. The pitch is a small sample of relevant prospects with public contact routes and fit notes, not a promise of guaranteed sales.',
    messageAngle: 'Offer a tiny sample research sprint and ask whether a short verified prospect list for their niche would be useful.'
  },
  'market-research': {
    label: 'Market research', title: 'Turn research into a decision brief', description: 'Sell focused research that helps someone make one decision about a market, competitor set, offer, location, or customer segment.', offer: 'Focused market research brief', audience: 'Founders, local businesses, creators, and independent operators making a concrete market, pricing, positioning, or expansion decision.',
    research: 'Find up to 10 reachable businesses or founders with a current public decision signal: launching an offer, entering a market, opening a location, changing pricing, expanding services, or competing in a visibly active niche. Use public sources and describe the decision signal precisely.',
    messageAngle: 'Offer a short research brief around one decision: competitors, pricing, demand signals, customer language, or opportunity gaps.'
  },
  'my-skill': {
    label: 'My own skill', title: 'Turn my idea into a first paid test', description: 'Use the project or service from Launch Room, find a narrow group that may need it, and aim for one real conversation before scaling anything.', offer: 'Small service test based on my skill', audience: 'The first reachable people named in the Launch Room brief.',
    research: 'Use the saved Launch Room brief as the source of truth. Find up to 10 people or organizations that match its first audience and could realistically benefit from the tiny project. Prefer warm or clearly relevant public contact paths.',
    messageAngle: 'Describe the useful skill or tiny project in plain language, connect it to the recipient only with verified context, and ask for a small conversation or pilot.'
  }
});

function clean(value) { return String(value == null ? '' : value).trim(); }
function readJson(key, fallback = {}) { try { const raw = window.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; } catch (_error) { return fallback; } }
function readText(key) { try { return clean(window.localStorage.getItem(key)); } catch (_error) { return ''; } }
function writeText(key, value) { try { window.localStorage.setItem(key, value); } catch (_error) { /* page-load state still works */ } }
function normalizeCampaign(value) { const key = clean(value).toLowerCase(); return CAMPAIGN_PRESETS[key] ? key : DEFAULT_CAMPAIGN; }
function getCampaign(key) { return CAMPAIGN_PRESETS[normalizeCampaign(key)]; }
function loadLaunchRoomBrief() { const brief = readJson(LAUNCH_ROOM_STORAGE_KEY, {}); return brief && typeof brief === 'object' ? brief : {}; }
function launchRoomContext() {
  const brief = loadLaunchRoomBrief();
  return [clean(brief.movementName) ? `Project: ${clean(brief.movementName)}` : '', clean(brief.firstAudience) ? `First audience: ${clean(brief.firstAudience)}` : '', clean(brief.worldPain) ? `Problem: ${clean(brief.worldPain)}` : '', clean(brief.worldWish) ? `Desired result: ${clean(brief.worldWish)}` : '', clean(brief.tinyProject) ? `Tiny first project: ${clean(brief.tinyProject)}` : ''].filter(Boolean).join('\n');
}
function campaignContext(key) {
  const campaign = getCampaign(key);
  if (normalizeCampaign(key) === 'my-skill') return launchRoomContext() || 'Use the smallest useful version of my skill or service. Ask one reachable person whether it would help.';
  return `Campaign: ${campaign.label}\nIdeal customer: ${campaign.audience}\nMessage angle: ${campaign.messageAngle}`;
}
function taskId(key) { return `growth-campaign-${key}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function buildCampaignTask(key) {
  const campaignKey = normalizeCampaign(key), campaign = getCampaign(campaignKey), launchContext = campaignKey === 'my-skill' ? launchRoomContext() : '', now = new Date().toISOString(), id = taskId(campaignKey);
  const task = [
    `Run a focused 3DVR Growth Operator campaign research pass: ${campaign.title}.`, '', `Campaign key: ${campaignKey}`, `Offer: ${campaign.offer}`, `Ideal customer: ${campaign.audience}`, launchContext ? `Launch Room context:\n${launchContext}` : '', '', 'Research job:', campaign.research, '', 'Outreach angle:', campaign.messageAngle, '',
    'Use the existing system instead of creating parallel data:', '- Return source-backed candidate records for human review and later deduplication in the existing unified 3dvr-crm; do not write CRM records from this read-only task.', '- Suggest follow-ups and unsent drafts for the existing Growth Operator / outreach pipeline, but do not update contact history.', '- This research task must not send messages or make any external writes. Do not claim prospects are imported, contacted, or paid.', '',
    'Rules:', '- Keep this to a small relevant batch, maximum 10 prospects.', '- Research public information only.', '- Never guess or synthesize private contact addresses, phone numbers, names, or business facts.', '- Do not send messages or blast generic lists from this research task.', '- Respect existing campaign caps, do-not-contact state, unsubscribe handling, delivery checks, and compliance gates.', '- Personalize only with verified public facts.', '- Do not promise guaranteed leads, revenue, bookings, rankings, or business outcomes.', '', 'Return: up to 10 source-backed candidate leads for CRM review, fit evidence, proposed unsent drafts, and one recommended next action. Do not claim a CRM import or outreach occurred.'
  ].filter(Boolean).join('\n');
  return { id, task, tenantId: 'portal:growth-operator', tenantAlias: readText('alias') || readText('username') || 'growth-operator', tenantPlan: 'builder', backend: 'codex', repo: 'tmsteph/3dvr-portal', model: '', thinking: 'high', unsafe: false, riskClass: 'draft', approvalStatus: 'not_required', requiredCapabilities: 'codex', maxRuntimeMs: 0, status: 'queued', requestedBy: `growth-campaign:${campaignKey}`, campaign: campaignKey, createdAt: now, updatedAt: now, resultSummary: '', error: '', workerDeviceId: '' };
}
function updatePageStatus(message) { const target = document.getElementById('syncStatus'); if (target) target.textContent = message; }
function setCampaignSeed(input, value) { if (!input) return; const canReplace = !clean(input.value) || input.dataset.campaignSeed === 'true'; if (!canReplace) return; input.value = value; input.dataset.campaignSeed = 'true'; }
function seedQuickAdd(key) { const campaignKey = normalizeCampaign(key), campaign = getCampaign(campaignKey), offer = document.getElementById('itemOffer'), context = document.getElementById('itemContext'), launch = campaignKey === 'my-skill' ? loadLaunchRoomBrief() : {}; setCampaignSeed(offer, clean(launch.tinyProject) || campaign.offer); setCampaignSeed(context, campaignContext(campaignKey)); }
function renderCampaign(key) {
  const campaignKey = normalizeCampaign(key), campaign = getCampaign(campaignKey);
  document.querySelectorAll('[data-campaign]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.campaign === campaignKey)));
  const title = document.getElementById('activeCampaignTitle'), description = document.getElementById('activeCampaignDescription'), finderLink = document.getElementById('campaignLeadFinderLink');
  if (title) title.textContent = campaign.title; if (description) description.textContent = campaign.description; if (finderLink) finderLink.href = `../lead-finder/?campaign=${encodeURIComponent(campaignKey)}`; seedQuickAdd(campaignKey);
}
function selectCampaign(key, { announce = true } = {}) { const campaignKey = normalizeCampaign(key); writeText(CAMPAIGN_STORAGE_KEY, campaignKey); renderCampaign(campaignKey); if (announce) updatePageStatus(`${getCampaign(campaignKey).label} selected. Ready to research a small first batch.`); return campaignKey; }
// Persist the signed task identity before sending. Reloads and uncertain HTTP
// acknowledgements must resume status checks, never create another task ID.
const CAMPAIGN_RESEARCH_KEY_PREFIX = '3dvr.growthOperator.researchRequest.v1.';
const researchFlights = new Map();
function researchStorageKey(key) { return CAMPAIGN_RESEARCH_KEY_PREFIX + normalizeCampaign(key); }
function researchRequestId() {
  return `task-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`}`;
}
function pendingCampaignResearch(key) {
  const raw = readText(researchStorageKey(key));
  if (!raw) return null;
  // A damaged or unexpected saved identity might still represent an enqueued
  // task. Fail closed instead of replacing it with a new request on reload.
  try {
    const pending = JSON.parse(raw);
    return pending && typeof pending === 'object' && !Array.isArray(pending)
      && /^operator-http:[A-Za-z0-9_-]{12,100}$/.test(pending.taskId || '')
      ? pending : { invalid: true };
  } catch (_error) {
    return { invalid: true };
  }
}
function savePendingCampaignResearch(key, taskId) {
  // A reload-safe request needs a durable identity BEFORE the network call.
  // Storage may throw (privacy mode/quota) or silently reject the write.
  const storageKey = researchStorageKey(key);
  const payload = JSON.stringify({ taskId, createdAt: new Date().toISOString() });
  try {
    window.localStorage.setItem(storageKey, payload);
    return window.localStorage.getItem(storageKey) === payload;
  } catch (_error) {
    return false;
  }
}
function clearPendingCampaignResearch(key) {
  // Never release the in-memory guard while the persisted request survives:
  // a subsequent reload would otherwise resume an obsolete task identity.
  const storageKey = researchStorageKey(key);
  try {
    window.localStorage.removeItem(storageKey);
    return !window.localStorage.getItem(storageKey);
  } catch (_error) {
    return false;
  }
}
function observeCampaignResearch(campaignKey, taskId, watchTask, flight) {
  const label = getCampaign(campaignKey).label;
  try {
    watchTask(taskId, {
      onUpdate(record = {}) {
        const status = clean(record.status || record.state).toLowerCase();
        // Signed terminal status is required. Synthetic 'blocked' from polling
        // timeout or authentication failure must never release the guard.
        if (['completed', 'failed', 'skipped', 'cancelled', 'canceled'].includes(status)
          && researchFlights.get(campaignKey) === flight) {
          if (clearPendingCampaignResearch(campaignKey)) researchFlights.delete(campaignKey);
        }
        if (status === 'completed') {
          updatePageStatus(`${label} research finished. Review the result in Operator before any CRM import or outreach.`);
        } else if (['blocked', 'failed', 'skipped', 'review'].includes(status)) {
          updatePageStatus(`${label} research ${status}. ${clean(record.error || record.resultSummary).slice(0, 250)}`);
        } else if (status === 'running') {
          updatePageStatus(`${label} research running in Operator; no outreach authorized.`);
        }
      }
    });
  } catch (_error) {
    updatePageStatus(`${label} status check unavailable. The saved task identity is preserved; check Operator before retrying.`);
  }
}
function resumeCampaignResearch(campaignKey, watchTask) {
  if (researchFlights.has(campaignKey)) return researchFlights.get(campaignKey);
  const pending = pendingCampaignResearch(campaignKey);
  if (!pending) return null;
  if (pending.invalid) {
    const flight = { invalid: true, promise: Promise.resolve(null) };
    researchFlights.set(campaignKey, flight);
    updatePageStatus('Research not submitted: saved Operator task identity is unreadable. Review existing Operator tasks before clearing browser state; no duplicate submitted.');
    return flight;
  }
  const flight = {
    taskId: pending.taskId,
    promise: Promise.resolve({ taskId: pending.taskId, confirmed: false, message: 'Resuming the saved Operator task status.' })
  };
  researchFlights.set(campaignKey, flight);
  updatePageStatus(`${getCampaign(campaignKey).label} has an existing Operator request. Checking its signed status; no duplicate submitted.`);
  observeCampaignResearch(campaignKey, pending.taskId, watchTask, flight);
  return flight;
}
function queueCampaignResearch(key, { queueTask = queueOperatorTask, watchTask = watchOperatorTask } = {}) {
  const campaignKey = normalizeCampaign(key);
  const existing = researchFlights.get(campaignKey) || resumeCampaignResearch(campaignKey, watchTask);
  if (existing) {
    updatePageStatus(existing.invalid
      ? 'Research not submitted: saved Operator task identity is unreadable. Review existing Operator tasks before clearing browser state; no duplicate submitted.'
      : `${getCampaign(campaignKey).label} research already submitted or delivery uncertain. Check its existing Operator task before starting another.`);
    return existing.promise;
  }
  const flight = { taskId: `operator-http:${researchRequestId()}` };
  // Store the request ID *before* the first network await so a reload during
  // delivery can query the same server-side idempotency key.
  if (!savePendingCampaignResearch(campaignKey, flight.taskId)) {
    updatePageStatus('Research not submitted: this browser cannot preserve the Operator task identity. Enable site storage before retrying.');
    return Promise.resolve(null);
  }
  flight.promise = submitCampaignResearch(campaignKey, { queueTask, watchTask }, flight);
  researchFlights.set(campaignKey, flight);
  return flight.promise;
}
async function submitCampaignResearch(campaignKey, { queueTask, watchTask }, flight) {
  const task = buildCampaignTask(campaignKey);
  const label = getCampaign(campaignKey).label;
  updatePageStatus(`Submitting ${label} research to authenticated Operator…`);
  try {
    // Signed HTTP → existing private SQLite → Codex worker; no Gun task write.
    const requestId = flight.taskId.slice('operator-http:'.length);
    const receipt = await queueTask({ text: task.task, title: `${label} prospect research`, requestId });
    if (receipt?.taskId !== flight.taskId) throw new Error('Operator returned a mismatched task identity.');
    updatePageStatus(receipt.confirmed
      ? `${label} research accepted by Operator. Waiting for a verified result; no CRM records or messages sent.`
      : receipt.message || 'Checking Operator delivery; do not submit a duplicate task.');
    observeCampaignResearch(campaignKey, flight.taskId, watchTask, flight);
    return receipt;
  } catch (error) {
    // The API rejects these before enqueue. All other errors are ambiguous:
    // keep the stored identity and check status instead of submitting again.
    const rejected = [400, 401, 403].includes(error.status) || /Sign in/.test(String(error.message || ''));
    if (rejected) {
      if (clearPendingCampaignResearch(campaignKey) && researchFlights.get(campaignKey) === flight) {
        researchFlights.delete(campaignKey);
      }
    } else {
      observeCampaignResearch(campaignKey, flight.taskId, watchTask, flight);
    }
    updatePageStatus(`${label} research was not confirmed. ${error.message || 'Check Operator status.'}${rejected ? '' : ' Check the saved task before retrying.'}`);
    return null;
  }
}
function initCampaigns() {
  const params = new URLSearchParams(window.location.search), requested = params.get('campaign'), stored = readText(CAMPAIGN_STORAGE_KEY); let active = selectCampaign(requested || stored || DEFAULT_CAMPAIGN, { announce: false }); resumeCampaignResearch(active, watchOperatorTask);
  document.querySelectorAll('[data-campaign]').forEach(button => button.addEventListener('click', () => { active = selectCampaign(button.dataset.campaign); }));
  [document.getElementById('itemOffer'), document.getElementById('itemContext')].forEach(input => input?.addEventListener('input', () => { input.dataset.campaignSeed = 'false'; }));
  document.getElementById('campaignFindButton')?.addEventListener('click', () => { queueCampaignResearch(active); });
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') window.addEventListener('DOMContentLoaded', initCampaigns);
export { CAMPAIGN_PRESETS, buildCampaignTask, loadLaunchRoomBrief, normalizeCampaign, queueCampaignResearch, selectCampaign };
