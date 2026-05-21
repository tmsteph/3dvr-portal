const STORAGE_KEY = '3dvr.marketLab.experiments.v1';
const SOURCE_STORAGE_KEY = '3dvr.marketLab.currentSource.v1';
const CLIENT_ID_KEY = '3dvr.marketLab.clientId.v1';
const GUN_ROOT_KEY = '3dvr-portal';
const GUN_SECTION_KEY = 'market-lab';
const GUN_STATE_KEY = 'state';
const DEFAULT_SOURCE = 'direct';
const DEFAULT_GUN_PEERS = [
  'https://gun-manhattan.herokuapp.com/gun',
  'https://gun-us.herokuapp.com/gun'
];

const DEFAULT_EXPERIMENTS = [
  {
    id: 'launch-your-idea',
    name: 'Launch Your Idea',
    message: 'We help people finally launch their ideas.',
    audience: 'entrepreneurs, creators, side hustlers',
    cta: 'Book a free brainstorming call.',
    headline: 'Finally launch the idea you keep carrying around.',
    explanation: 'Turn a rough idea into a first page, offer, or working next step with direct 3DVR help.',
    landingPath: 'launch-your-idea/',
    segment: 'Entrepreneurs, creators, and side hustlers',
    pain: 'Idea is stuck in notes instead of shipping',
    offer: 'Free brainstorming call',
    nextBestAction: 'Ask what idea they keep circling, what would count as launched, and what small page or offer could go live first.',
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
    landingPath: 'personal-tech-department/',
    segment: 'Small businesses, older adults, and busy professionals',
    pain: 'Tech tasks keep interrupting the real work',
    offer: '$20/month personal tech department',
    nextBestAction: 'Ask what tech task keeps costing them time and whether a calm monthly support lane would help.',
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
    landingPath: 'open-future-computing/',
    segment: 'Linux, open-source, makers, and digital nomads',
    pain: 'Modern computing feels closed, extractive, or too hard to own',
    offer: 'Builder community invitation',
    nextBestAction: 'Ask which open computing problem they care about most and whether they want to follow or help build the 3DVR stack.',
    status: 'Testing',
    clicks: 0,
    replies: 0,
    callsBooked: 0,
    signups: 0,
    clicksBySource: {},
    notes: ''
  }
];

const page = document.body;
const experimentId = page?.dataset?.experimentId || '';
const source = loadSource();
const gunBackup = createGunBackup();

document.querySelectorAll('[data-source-label]').forEach((element) => {
  element.textContent = source;
});

document.querySelectorAll('[data-market-cta]').forEach((link) => {
  link.addEventListener('click', () => {
    incrementClick(experimentId);
  });
});

document.querySelectorAll('[data-crm-link]').forEach((link) => {
  const experiment = getExperiment(experimentId);
  if (experiment) link.href = getCrmHref(experiment);
});

document.querySelectorAll('[data-contacts-link]').forEach((link) => {
  const experiment = getExperiment(experimentId);
  if (experiment) link.href = getContactsHref(experiment);
});

function loadSource() {
  const params = new URLSearchParams(window.location.search);
  const querySource = params.get('source') || params.get('utm_source') || params.get('ref');
  const current = normalizeSourceLabel(querySource || window.localStorage.getItem(SOURCE_STORAGE_KEY) || DEFAULT_SOURCE);
  window.localStorage.setItem(SOURCE_STORAGE_KEY, current);
  return current;
}

function incrementClick(id) {
  const payload = loadPayload();
  const experiments = payload.experiments.map((experiment) => {
    if (experiment.id !== id) return experiment;
    return {
      ...experiment,
      clicks: normalizeCount(experiment.clicks) + 1,
      clicksBySource: {
        ...experiment.clicksBySource,
        [source]: normalizeCount(experiment.clicksBySource?.[source]) + 1
      }
    };
  });
  const nextPayload = {
    schemaVersion: 1,
    updatedAt: Date.now(),
    updatedBy: gunBackup.clientId,
    experiments
  };

  savePayload(nextPayload);
  backupToGun(nextPayload);
  backupEventToGun(id, 'clicks');
}

function loadPayload() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { experiments: cloneDefaults(), updatedAt: 0 };
    return normalizePayload(JSON.parse(raw));
  } catch (error) {
    console.warn('Market Lab landing could not load local data.', error);
    return { experiments: cloneDefaults(), updatedAt: 0 };
  }
}

function savePayload(payload) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('Market Lab landing could not save local data.', error);
  }
}

function backupToGun(payload) {
  if (!gunBackup.enabled || !gunBackup.stateNode) return;

  // This mirrors the dashboard backup path so landing pages can update shared counts.
  try {
    gunBackup.stateNode.put({
      schemaVersion: payload.schemaVersion,
      updatedAt: payload.updatedAt,
      updatedBy: payload.updatedBy,
      experiments: JSON.stringify(payload.experiments)
    });
  } catch (error) {
    console.warn('Market Lab landing could not write Gun backup.', error);
  }
}

function backupEventToGun(id, eventName) {
  if (!gunBackup.enabled || !gunBackup.eventsNode) return;

  const createdAt = Date.now();
  const eventId = `${createdAt}-${gunBackup.clientId}-${id}-${eventName}`;

  // Later: this same event can feed real analytics, CRM activity, or form attribution.
  try {
    gunBackup.eventsNode.get(eventId).put({
      id: eventId,
      experimentId: id,
      event: eventName,
      source,
      createdAt
    });
  } catch (error) {
    console.warn('Market Lab landing could not write Gun event.', error);
  }
}

function createGunBackup() {
  if (typeof Gun !== 'function') {
    return { enabled: false, clientId: createClientId(), stateNode: null, eventsNode: null };
  }

  try {
    const gun = Gun(window.__GUN_PEERS__ || DEFAULT_GUN_PEERS);
    const root = gun.get(GUN_ROOT_KEY).get(GUN_SECTION_KEY);
    return {
      enabled: true,
      clientId: createClientId(),
      stateNode: root.get(GUN_STATE_KEY),
      eventsNode: root.get('events')
    };
  } catch (error) {
    console.warn('Market Lab landing could not start Gun backup.', error);
    return { enabled: false, clientId: createClientId(), stateNode: null, eventsNode: null };
  }
}

function createClientId() {
  const existing = window.localStorage.getItem(CLIENT_ID_KEY);
  if (existing) return existing;

  const id = `market-lab-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(CLIENT_ID_KEY, id);
  return id;
}

function cloneDefaults() {
  return DEFAULT_EXPERIMENTS.map((experiment) => ({
    ...experiment,
    clicksBySource: { ...experiment.clicksBySource }
  }));
}

function normalizePayload(value) {
  if (Array.isArray(value)) {
    return { experiments: mergeStoredData(value), updatedAt: 0 };
  }

  if (!value || typeof value !== 'object') {
    return { experiments: cloneDefaults(), updatedAt: 0 };
  }

  return {
    experiments: mergeStoredData(Array.isArray(value.experiments) ? value.experiments : []),
    updatedAt: normalizeCount(value.updatedAt)
  };
}

function mergeStoredData(stored) {
  return DEFAULT_EXPERIMENTS.map((base) => {
    const match = Array.isArray(stored) ? stored.find((item) => item && item.id === base.id) : null;
    if (!match) return { ...base, clicksBySource: { ...base.clicksBySource } };

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

function getExperiment(id) {
  return DEFAULT_EXPERIMENTS.find((experiment) => experiment.id === id);
}

function getCrmHref(experiment) {
  const params = new URLSearchParams({
    draft: '1',
    type: 'person',
    status: 'Warm - Awareness',
    segment: experiment.segment,
    pain: experiment.pain,
    pilot: 'Conversation',
    offer: experiment.offer,
    signal: experiment.message,
    experiment: experiment.name,
    nextBestAction: experiment.nextBestAction,
    source: `market-lab/${source}`,
    tags: `source/market-lab,experiment/${experiment.id},angle/${normalizeSourceLabel(experiment.name)}`
  });

  return `../../crm/index.html?${params.toString()}`;
}

function getContactsHref(experiment) {
  const params = new URLSearchParams({
    source: `market-lab/${source}`,
    tags: `source/market-lab,experiment/${experiment.id}`,
    notes: `${experiment.name}: ${experiment.message} ${experiment.nextBestAction}`.trim()
  });

  return `../../contacts/index.html?${params.toString()}`;
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

  return Object.entries(value).reduce((map, [label, count]) => {
    const key = normalizeSourceLabel(label);
    map[key] = (map[key] || 0) + normalizeCount(count);
    return map;
  }, {});
}
