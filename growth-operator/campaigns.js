const CAMPAIGN_STORAGE_KEY = '3dvr.growthOperator.activeCampaign.v1';
const LAUNCH_ROOM_STORAGE_KEY = '3dvr.launch-room.movement-brief.v1';
const AGENT_OWNER_ALIAS = '3dvr-managed';
const DEFAULT_CAMPAIGN = 'my-skill';
const DEFAULT_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];

const CAMPAIGN_PRESETS = Object.freeze({
  'av-freelance': {
    label: 'AV freelance',
    title: 'Get booked for live events',
    description: 'Find production companies, venues, hotels, event agencies, labor providers, and AV teams that regularly need freelance technicians.',
    offer: 'Freelance audio visual support',
    audience: 'Production companies, AV vendors, venues, hotels, event agencies, and labor providers that book freelance AV technicians.',
    research: 'Find up to 10 relevant organizations in the chosen market that publicly produce live events or staff AV crews. Prefer public staffing, production, operations, or general business contact routes. Look for real signals such as upcoming events, production services, freelancer rosters, or hiring pages. Never guess an email address.',
    messageAngle: 'A short availability introduction: what kind of AV work the freelancer can do, where they work, and a tiny ask for the right staffing or production contact.'
  },
  'web-design': {
    label: 'Web design',
    title: 'Fix visible website problems',
    description: 'Find small businesses with a real public website problem, then offer one small useful improvement instead of a vague redesign pitch.',
    offer: 'Small website or landing-page improvement',
    audience: 'Owner-led businesses with a visible website, mobile, conversion, intake, or follow-up problem.',
    research: 'Find up to 10 small businesses with a verifiable public web problem such as no site, a broken or unavailable site, weak mobile usability, no clear call to action, no quote or booking path, or obviously stale information. Record the exact public evidence and URL. Do not invent problems.',
    messageAngle: 'Mention one verified problem, describe the smallest useful fix, and offer to show a lightweight concept or next step.'
  },
  'lead-generation': {
    label: 'Lead generation',
    title: 'Sell useful prospect research',
    description: 'Help a business by researching a small, verified list of likely prospects with public contact paths and reasons they fit.',
    offer: 'Small prospect research and lead-list sprint',
    audience: 'Small B2B businesses and independent service providers that need a clearer prospect list but do not need a giant sales stack.',
    research: 'Find up to 10 businesses that sell a clear B2B service and appear to have a reachable niche. Research only public information. The pitch is a small sample of relevant prospects with public contact routes and fit notes, not a promise of guaranteed sales.',
    messageAngle: 'Offer a tiny sample research sprint and ask whether a short verified prospect list for their niche would be useful.'
  },
  'market-research': {
    label: 'Market research',
    title: 'Turn research into a decision brief',
    description: 'Sell focused research that helps someone make one decision about a market, competitor set, offer, location, or customer segment.',
    offer: 'Focused market research brief',
    audience: 'Founders, local businesses, creators, and independent operators making a concrete market, pricing, positioning, or expansion decision.',
    research: 'Find up to 10 reachable businesses or founders with a current public decision signal: launching an offer, entering a market, opening a location, changing pricing, expanding services, or competing in a visibly active niche. Use public sources and describe the decision signal precisely.',
    messageAngle: 'Offer a short research brief around one decision: competitors, pricing, demand signals, customer language, or opportunity gaps.'
  },
  'my-skill': {
    label: 'My own skill',
    title: 'Turn my idea into a first paid test',
    description: 'Use the project or service from Launch Room, find a narrow group that may need it, and aim for one real conversation before scaling anything.',
    offer: 'Small service test based on my skill',
    audience: 'The first reachable people named in the Launch Room brief.',
    research: 'Use the saved Launch Room brief as the source of truth. Find up to 10 people or organizations that match its first audience and could realistically benefit from the tiny project. Prefer warm or clearly relevant public contact paths.',
    messageAngle: 'Describe the useful skill or tiny project in plain language, connect it to the recipient only with verified context, and ask for a small conversation or pilot.'
  }
});

function clean(value) {
  return String(value == null ? '' : value).trim();
}

function readJson(key, fallback = {}) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (_error) {
    return fallback;
  }
}

function readText(key) {
  try {
    return clean(window.localStorage.getItem(key));
  } catch (_error) {
    return '';
  }
}

function writeText(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch (_error) {
    // The campaign still works for this page load if storage is unavailable.
  }
}

function normalizeCampaign(value) {
  const key = clean(value).toLowerCase();
  return CAMPAIGN_PRESETS[key] ? key : DEFAULT_CAMPAIGN;
}

function getCampaign(key) {
  return CAMPAIGN_PRESETS[normalizeCampaign(key)];
}

function loadLaunchRoomBrief() {
  const brief = readJson(LAUNCH_ROOM_STORAGE_KEY, {});
  return brief && typeof brief === 'object' ? brief : {};
}

function launchRoomContext() {
  const brief = loadLaunchRoomBrief();
  const lines = [
    clean(brief.movementName) ? `Project: ${clean(brief.movementName)}` : '',
    clean(brief.firstAudience) ? `First audience: ${clean(brief.firstAudience)}` : '',
    clean(brief.worldPain) ? `Problem: ${clean(brief.worldPain)}` : '',
    clean(brief.worldWish) ? `Desired result: ${clean(brief.worldWish)}` : '',
    clean(brief.tinyProject) ? `Tiny first project: ${clean(brief.tinyProject)}` : ''
  ].filter(Boolean);
  return lines.join('\n');
}

function campaignContext(key) {
  const campaign = getCampaign(key);
  if (normalizeCampaign(key) === 'my-skill') {
    return launchRoomContext() || 'Use the smallest useful version of my skill or service. Ask one reachable person whether it would help.';
  }
  return `Campaign: ${campaign.label}\nIdeal customer: ${campaign.audience}\nMessage angle: ${campaign.messageAngle}`;
}

function taskId(key) {
  return `growth-campaign-${key}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildCampaignTask(key) {
  const campaignKey = normalizeCampaign(key);
  const campaign = getCampaign(campaignKey);
  const launchContext = campaignKey === 'my-skill' ? launchRoomContext() : '';
  const now = new Date().toISOString();
  const id = taskId(campaignKey);
  const task = [
    `Run a focused 3DVR Growth Operator campaign research pass: ${campaign.title}.`,
    '',
    `Campaign key: ${campaignKey}`,
    `Offer: ${campaign.offer}`,
    `Ideal customer: ${campaign.audience}`,
    launchContext ? `Launch Room context:\n${launchContext}` : '',
    '',
    'Research job:',
    campaign.research,
    '',
    'Outreach angle:',
    campaign.messageAngle,
    '',
    'Use the existing system instead of creating parallel data:',
    '- Save qualified people/businesses in the unified 3dvr-crm records.',
    '- Put message history and follow-ups through the existing Growth Operator / outreach pipeline.',
    '- If the current autopilot policy allows routine direct email, hand qualified records to that existing outbound pipeline. Otherwise leave an honest draft ready for review.',
    '',
    'Rules:',
    '- Keep this to a small relevant batch, maximum 10 prospects.',
    '- Research public information only.',
    '- Never guess or synthesize email addresses, phone numbers, names, or business facts.',
    '- Do not mass email or blast generic lists.',
    '- Respect existing campaign caps, do-not-contact state, unsubscribe handling, delivery checks, and compliance gates.',
    '- Personalize only with verified public facts.',
    '- Do not promise guaranteed leads, revenue, bookings, rankings, or business outcomes.',
    '',
    'Return: qualified CRM records, the evidence for fit, proposed short drafts, and one recommended next action.'
  ].filter(Boolean).join('\n');

  return {
    id,
    task,
    tenantId: 'portal:growth-operator',
    tenantAlias: readText('alias') || readText('username') || 'growth-operator',
    tenantPlan: 'builder',
    backend: 'codex',
    repo: 'tmsteph/3dvr-portal',
    model: '',
    thinking: 'high',
    unsafe: false,
    riskClass: 'workspace_write',
    approvalStatus: 'not_required',
    requiredCapabilities: 'codex,crm,email,gun',
    maxRuntimeMs: 0,
    status: 'queued',
    requestedBy: `growth-campaign:${campaignKey}`,
    campaign: campaignKey,
    createdAt: now,
    updatedAt: now,
    resultSummary: '',
    error: '',
    workerDeviceId: ''
  };
}

function putGun(node, payload) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.put !== 'function') {
      reject(new Error('Growth relay is unavailable.'));
      return;
    }
    const timer = window.setTimeout(() => resolve({ timedOut: true }), 6000);
    node.put(payload, ack => {
      window.clearTimeout(timer);
      if (ack?.err) reject(new Error(String(ack.err)));
      else resolve(ack || {});
    });
  });
}

function updatePageStatus(message) {
  const target = document.getElementById('syncStatus');
  if (target) target.textContent = message;
}

function seedQuickAdd(key) {
  const campaignKey = normalizeCampaign(key);
  const campaign = getCampaign(campaignKey);
  const offer = document.getElementById('itemOffer');
  const context = document.getElementById('itemContext');

  if (offer && !clean(offer.value)) {
    const launch = campaignKey === 'my-skill' ? loadLaunchRoomBrief() : {};
    offer.value = clean(launch.tinyProject) || campaign.offer;
  }
  if (context && !clean(context.value)) {
    context.value = campaignContext(campaignKey);
  }
}

function renderCampaign(key) {
  const campaignKey = normalizeCampaign(key);
  const campaign = getCampaign(campaignKey);
  document.querySelectorAll('[data-campaign]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.campaign === campaignKey));
  });

  const title = document.getElementById('activeCampaignTitle');
  const description = document.getElementById('activeCampaignDescription');
  const finderLink = document.getElementById('campaignLeadFinderLink');
  if (title) title.textContent = campaign.title;
  if (description) description.textContent = campaign.description;
  if (finderLink) finderLink.href = `../lead-finder/?campaign=${encodeURIComponent(campaignKey)}`;
  seedQuickAdd(campaignKey);
}

function selectCampaign(key, { announce = true } = {}) {
  const campaignKey = normalizeCampaign(key);
  writeText(CAMPAIGN_STORAGE_KEY, campaignKey);
  renderCampaign(campaignKey);
  if (announce) {
    updatePageStatus(`${getCampaign(campaignKey).label} selected. Ready to research a small first batch.`);
  }
  return campaignKey;
}

async function queueCampaignResearch(key) {
  const campaignKey = normalizeCampaign(key);
  const task = buildCampaignTask(campaignKey);
  const gun = typeof window.Gun === 'function' ? window.Gun(window.__GUN_PEERS__ || DEFAULT_PEERS) : null;
  const queueRoot = gun
    ? gun.get('3dvr-portal').get('agentOps').get(AGENT_OWNER_ALIAS).get('taskQueue')
    : null;

  updatePageStatus(`Queuing ${getCampaign(campaignKey).label} research…`);
  try {
    await putGun(queueRoot.get(task.id), task);
    await putGun(queueRoot.get('latest'), {
      id: task.id,
      kind: 'campaign-find-leads',
      campaign: campaignKey,
      updatedAt: task.updatedAt
    });
    updatePageStatus(`${getCampaign(campaignKey).label} research queued. The first pass is capped at 10 relevant prospects.`);
  } catch (error) {
    updatePageStatus(`Campaign research was not queued. ${error.message || 'Check the relay.'}`);
  }
}

function initCampaigns() {
  const params = new URLSearchParams(window.location.search);
  const requested = params.get('campaign');
  const stored = readText(CAMPAIGN_STORAGE_KEY);
  let active = selectCampaign(requested || stored || DEFAULT_CAMPAIGN, { announce: false });

  document.querySelectorAll('[data-campaign]').forEach(button => {
    button.addEventListener('click', () => {
      active = selectCampaign(button.dataset.campaign);
    });
  });

  document.getElementById('campaignFindButton')?.addEventListener('click', () => {
    queueCampaignResearch(active);
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', initCampaigns);
}

export { CAMPAIGN_PRESETS, buildCampaignTask, loadLaunchRoomBrief, normalizeCampaign, selectCampaign };
