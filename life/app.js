const categoryDefs = [
  { key: 'mind', label: 'Mind' },
  { key: 'body', label: 'Body' },
  { key: 'money', label: 'Money' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'projects', label: 'Projects' }
];

const STORAGE_KEY = 'portal-life-checkins';
const DRAFT_KEY = 'portal-life-draft';

function createLocalGunSubscriptionStub() {
  return {
    off() {}
  };
}

function createLocalGunNodeStub() {
  const node = {
    __isGunStub: true,
    get() {
      return createLocalGunNodeStub();
    },
    put(_value, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
      return node;
    },
    once(callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback(undefined), 0);
      }
      return node;
    },
    on() {
      return createLocalGunSubscriptionStub();
    },
    off() {},
    map() {
      return {
        __isGunStub: true,
        on() {
          return createLocalGunSubscriptionStub();
        }
      };
    }
  };
  return node;
}

function createLocalGunUserStub() {
  const node = createLocalGunNodeStub();
  return {
    ...node,
    is: null,
    _: {},
    recall() {},
    auth(_alias, _password, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
    },
    leave() {},
    create(_alias, _password, callback) {
      if (typeof callback === 'function') {
        setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
      }
    }
  };
}

function ensureGunContext(factory, label) {
  const ensureGun = window.ScoreSystem && typeof window.ScoreSystem.ensureGun === 'function'
    ? window.ScoreSystem.ensureGun.bind(window.ScoreSystem)
    : null;

  if (ensureGun) {
    return ensureGun(factory, { label });
  }

  if (typeof factory === 'function') {
    try {
      const instance = factory();
      if (instance) {
        return {
          gun: instance,
          user: typeof instance.user === 'function' ? instance.user() : createLocalGunUserStub(),
          isStub: !!instance.__isGunStub
        };
      }
    } catch (error) {
      console.warn(`Failed to initialize ${label || 'life'} Gun instance`, error);
    }
  }

  console.warn(`Gun.js is unavailable for ${label || 'life'}; running in offline mode.`);
  const stubGun = {
    __isGunStub: true,
    get() {
      return createLocalGunNodeStub();
    },
    user() {
      return createLocalGunUserStub();
    }
  };

  return {
    gun: stubGun,
    user: stubGun.user(),
    isStub: true
  };
}

function clampScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 7;
  }
  return Math.min(10, Math.max(1, Math.round(number)));
}

function toDateInputValue(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function toReadableDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Today';
  }
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `life-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function normalizeEntry(entry, fallbackId = makeId()) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const categories = {};

  for (const category of categoryDefs) {
    categories[category.key] = clampScore(source.categories && source.categories[category.key]);
  }

  return {
    id: String(source.id || fallbackId),
    createdAt: source.createdAt || new Date().toISOString(),
    date: source.date || toDateInputValue(),
    mood: clampScore(source.mood),
    today: String(source.today || '').trim(),
    tomorrow: String(source.tomorrow || '').trim(),
    weeklyReflection: String(source.weeklyReflection || source.reflection || '').trim(),
    categories,
    author: String(source.author || '').trim()
  };
}

function summarizeEntry(entry) {
  return entry.today || entry.tomorrow || entry.weeklyReflection || 'No written note yet.';
}

function average(values) {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function loadStoredEntries() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = parseJson(raw, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((entry) => normalizeEntry(entry));
}

function saveStoredEntries(entries) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function loadDraft() {
  const parsed = parseJson(window.localStorage.getItem(DRAFT_KEY), null);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

function saveDraft(draft) {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}

function readValue(id) {
  const element = document.getElementById(id);
  return element ? element.value : '';
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value;
  }
}

function updateSliderValue(inputId, outputId) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(outputId);
  if (!input || !output) {
    return;
  }

  const sync = () => {
    output.textContent = String(clampScore(input.value));
  };

  input.addEventListener('input', sync);
  sync();
}

function getFormDraft() {
  return {
    date: readValue('lifeDate'),
    mood: clampScore(readValue('moodScore')),
    today: readValue('todayText').trim(),
    tomorrow: readValue('tomorrowText').trim(),
    weeklyReflection: readValue('weeklyText').trim(),
    categories: {
      mind: clampScore(readValue('mindScore')),
      body: clampScore(readValue('bodyScore')),
      money: clampScore(readValue('moneyScore')),
      relationships: clampScore(readValue('relationshipsScore')),
      projects: clampScore(readValue('projectsScore'))
    }
  };
}

function applyDraft(draft) {
  const source = draft && typeof draft === 'object' ? draft : {};
  setValue('lifeDate', source.date || toDateInputValue());
  setValue('moodScore', clampScore(source.mood || 7));
  setValue('todayText', source.today || '');
  setValue('tomorrowText', source.tomorrow || '');
  setValue('weeklyText', source.weeklyReflection || '');

  for (const category of categoryDefs) {
    const nextValue = source.categories && source.categories[category.key] ? source.categories[category.key] : 7;
    setValue(`${category.key}Score`, clampScore(nextValue));
  }
}

function getAllEntries() {
  return Array.from(entriesById.values())
    .map((entry) => normalizeEntry(entry))
    .sort((a, b) => {
      const aTime = new Date(a.createdAt || a.date).getTime();
      const bTime = new Date(b.createdAt || b.date).getTime();
      return bTime - aTime;
    });
}

function getRecentEntries(limit = 5) {
  return getAllEntries().slice(0, limit);
}

function getAverages(entries) {
  const scores = {};
  for (const category of categoryDefs) {
    scores[category.key] = average(entries.map((entry) => Number(entry.categories[category.key] || 0)));
  }
  return scores;
}

function getMoodTrend(entries) {
  const moods = entries.map((entry) => Number(entry.mood || 0));
  const recent = moods.slice(0, 3);
  const previous = moods.slice(3, 6);
  if (!recent.length || !previous.length) {
    return 'Need more check-ins';
  }

  const delta = average(recent) - average(previous);
  if (delta > 0.35) {
    return 'Up';
  }
  if (delta < -0.35) {
    return 'Down';
  }
  return 'Flat';
}

function getStreak(entries) {
  const uniqueDates = new Set();
  for (const entry of entries) {
    uniqueDates.add(entry.date);
  }

  let streak = 0;
  let cursor = new Date(toDateInputValue());
  while (true) {
    const key = toDateInputValue(cursor);
    if (!uniqueDates.has(key)) {
      break;
    }
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function renderCategoryBars(entries) {
  const container = document.getElementById('categoryBars');
  if (!container) {
    return;
  }

  const averages = getAverages(entries);
  container.innerHTML = categoryDefs.map((category) => {
    const value = averages[category.key] || 0;
    const width = Math.max(8, Math.round((value / 10) * 100));
    return `
      <div class="bar-row">
        <div class="bar-row__head">
          <span>${category.label}</span>
          <span>${value.toFixed(1)} / 10</span>
        </div>
        <div class="bar" aria-hidden="true"><span style="width:${width}%"></span></div>
      </div>
    `;
  }).join('');
}

function renderEntryList(entries) {
  const list = document.getElementById('entryList');
  if (!list) {
    return;
  }

  if (!entries.length) {
    list.innerHTML = '<li class="entry-item"><strong>No entries yet</strong><p class="entry-copy">Save your first check-in to start building a pattern.</p></li>';
    return;
  }

  list.innerHTML = entries.map((entry) => `
    <li class="entry-item">
      <strong>${toReadableDate(entry.date)} · Mood ${entry.mood}/10</strong>
      <div class="entry-meta">${categoryDefs.map((category) => `${category.label} ${entry.categories[category.key]}/10`).join(' · ')}</div>
      <p class="entry-copy">${escapeHtml(summarizeEntry(entry))}</p>
    </li>
  `).join('');
}

function renderSummary(entries) {
  const averageMood = document.getElementById('averageMood');
  const trendLabel = document.getElementById('trendLabel');
  const streakValue = document.getElementById('streakValue');
  const latestReflection = document.getElementById('latestReflection');

  if (averageMood) {
    averageMood.textContent = entries.length ? `${average(entries.map((entry) => entry.mood)).toFixed(1)} / 10` : '--';
  }

  if (trendLabel) {
    trendLabel.textContent = getMoodTrend(entries);
  }

  if (streakValue) {
    const streak = getStreak(entries);
    streakValue.textContent = streak ? `${streak} day${streak === 1 ? '' : 's'}` : '0 days';
  }

  if (latestReflection) {
    const weekly = entries.find((entry) => entry.weeklyReflection);
    latestReflection.textContent = weekly ? weekly.weeklyReflection : 'No reflections yet. Save one when you want to review the week.';
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function render() {
  const entries = getAllEntries();
  renderSummary(entries);
  renderCategoryBars(entries);
  renderEntryList(getRecentEntries());
}

function mergeEntry(entry, id) {
  const normalized = normalizeEntry({ ...entry, id }, id);
  entriesById.set(normalized.id, normalized);
  saveStoredEntries(getAllEntries());
  render();
}

function writeEntry(entry) {
  const id = entry.id || makeId();
  const normalized = normalizeEntry({ ...entry, id }, id);
  entriesById.set(normalized.id, normalized);
  saveStoredEntries(getAllEntries());
  render();

  if (entriesRoot && typeof entriesRoot.get === 'function') {
    entriesRoot.get(normalized.id).put(normalized, (ack) => {
      const status = document.getElementById('saveStatus');
      if (!status) {
        return;
      }

      if (ack && ack.err) {
        status.textContent = 'Saved locally. Gun sync is unavailable right now, so the entry stays in your browser cache.';
      } else {
        status.textContent = 'Saved to Life and queued for Gun sync.';
      }
    });
  }
}

function loadEntriesFromGun() {
  if (!entriesRoot || typeof entriesRoot.map !== 'function') {
    return;
  }

  const mapped = entriesRoot.map();
  if (!mapped || typeof mapped.on !== 'function') {
    return;
  }

  mapped.on((entry, id) => {
    if (!entry || !id) {
      return;
    }
    mergeEntry(entry, id);
  });
}

const gunContext = ensureGunContext(
  () => (typeof Gun === 'function'
    ? Gun({
      peers: window.__GUN_PEERS__ || [
        'wss://relay.3dvr.tech/gun',
        'wss://gun-relay-3dvr.fly.dev/gun'
      ],
      axe: true
    })
    : null),
  'life'
);

const gun = gunContext.gun;
const user = gunContext.user;

// Life entries live at 3dvr-portal/life/entries so the portal can keep one shared history.
// Life data lives under 3dvr-portal/life so it syncs with the rest of the portal graph.
const portalRoot = gun && typeof gun.get === 'function'
  ? gun.get('3dvr-portal')
  : createLocalGunNodeStub();
const lifeRoot = portalRoot.get('life');
const entriesRoot = lifeRoot.get('entries');

const entriesById = new Map();

function persistDraftFromForm() {
  saveDraft(getFormDraft());
}

function initializeForm() {
  const draft = loadDraft();
  applyDraft(draft || { date: toDateInputValue() });

  for (const category of categoryDefs) {
    updateSliderValue(`${category.key}Score`, `${category.key}Value`);
  }

  const moodInput = document.getElementById('moodScore');
  const moodOutput = document.getElementById('moodValue');
  if (moodInput && moodOutput) {
    moodInput.addEventListener('input', () => {
      moodOutput.textContent = String(clampScore(moodInput.value));
      persistDraftFromForm();
    });
  }

  for (const input of document.querySelectorAll('#lifeForm input, #lifeForm textarea')) {
    input.addEventListener('input', persistDraftFromForm);
  }

  const clearDraftButton = document.getElementById('clearDraft');
  if (clearDraftButton) {
    clearDraftButton.addEventListener('click', () => {
      window.localStorage.removeItem(DRAFT_KEY);
      applyDraft({ date: toDateInputValue() });
      const status = document.getElementById('saveStatus');
      if (status) {
        status.textContent = 'Draft cleared.';
      }
    });
  }
}

function initializeEntries() {
  const storedEntries = loadStoredEntries();
  for (const entry of storedEntries) {
    entriesById.set(entry.id, entry);
  }
  render();
  loadEntriesFromGun();
}

const form = document.getElementById('lifeForm');
const saveStatus = document.getElementById('saveStatus');

if (saveStatus) {
  saveStatus.textContent = gunContext.isStub
    ? 'Offline mode is active. Entries will stay in local storage until Gun is available.'
    : 'Life is connected to Gun and ready to sync across devices.';
}

initializeForm();
initializeEntries();

if (form) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = getFormDraft();
    const entry = normalizeEntry({
      ...draft,
      createdAt: new Date().toISOString(),
      author: window.ScoreSystem && typeof window.ScoreSystem.ensureGuestIdentity === 'function'
        ? window.ScoreSystem.ensureGuestIdentity()
        : (user && user.is && user.is.pub) || ''
    });

    writeEntry(entry);
    if (saveStatus) {
      saveStatus.textContent = 'Saved. The entry is now part of your Life history.';
    }
  });
}
