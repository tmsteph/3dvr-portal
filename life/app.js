const STORAGE_KEY = 'portal-life-checkins';
const DRAFT_KEY = 'portal-life-draft';

const defaultCategories = Object.freeze({
  mind: 3,
  body: 3,
  money: 3,
  relationships: 3,
  mission: 3
});

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
    map() {
      return {
        on() {
          return { off() {} };
        }
      };
    }
  };

  return node;
}

function createLocalGunUserStub() {
  return {
    is: null
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
          isStub: Boolean(instance.__isGunStub)
        };
      }
    } catch (error) {
      console.warn('Life could not start Gun. Saving on this device.', error);
    }
  }

  const gun = {
    __isGunStub: true,
    get() {
      return createLocalGunNodeStub();
    },
    user() {
      return createLocalGunUserStub();
    }
  };

  return {
    gun,
    user: gun.user(),
    isStub: true
  };
}

function clampMood(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 3;
  }
  return Math.min(5, Math.max(1, Math.round(number)));
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
    day: 'numeric'
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
  } catch {
    return fallback;
  }
}

function normalizeCategories(value = {}, mood = 3) {
  return {
    mind: clampMood(value.mind ?? mood),
    body: clampMood(value.body ?? mood),
    money: clampMood(value.money ?? mood),
    relationships: clampMood(value.relationships ?? mood),
    mission: clampMood(value.mission ?? value.projects ?? mood)
  };
}

function normalizeEntry(entry, fallbackId = makeId()) {
  const source = entry && typeof entry === 'object' ? entry : {};
  const mood = clampMood(source.mood);

  return {
    id: String(source.id || fallbackId),
    createdAt: source.createdAt || new Date().toISOString(),
    date: source.date || toDateInputValue(),
    mood,
    alignment: clampMood(source.alignment ?? mood),
    today: String(source.today || '').trim(),
    avoidance: String(source.avoidance || '').trim(),
    trueTask: String(source.trueTask || '').trim(),
    tomorrow: String(source.tomorrow || '').trim(),
    vision: String(source.vision || '').trim(),
    weeklyReflection: String(source.weeklyReflection || source.reflection || '').trim(),
    categories: normalizeCategories(source.categories || defaultCategories, mood),
    author: String(source.author || '').trim()
  };
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readValue(id) {
  return document.getElementById(id)?.value || '';
}

function setValue(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.value = value;
  }
}

function loadStoredEntries() {
  const parsed = parseJson(window.localStorage.getItem(STORAGE_KEY), []);
  return Array.isArray(parsed) ? parsed.map((entry) => normalizeEntry(entry)) : [];
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

function getFormDraft() {
  const mood = clampMood(readValue('moodScore'));

  return {
    date: readValue('lifeDate') || toDateInputValue(),
    mood,
    alignment: mood,
    today: readValue('todayText').trim(),
    avoidance: '',
    trueTask: readValue('trueTaskText').trim(),
    tomorrow: '',
    vision: '',
    weeklyReflection: '',
    categories: normalizeCategories(defaultCategories, mood)
  };
}

function applyDraft(draft) {
  const source = draft && typeof draft === 'object' ? draft : {};
  const mood = clampMood(source.mood || 3);

  setValue('lifeDate', source.date || toDateInputValue());
  setValue('moodScore', mood);
  setValue('todayText', source.today || '');
  setValue('trueTaskText', source.trueTask || '');
  syncMoodOutput();
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

function getStreak(entries) {
  const uniqueDates = new Set(entries.map((entry) => entry.date));
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

function getEntryNeed(entry) {
  return entry.today || entry.avoidance || entry.vision || 'No note yet.';
}

function getEntryStep(entry) {
  return entry.trueTask || entry.tomorrow || entry.weeklyReflection || 'Pick one small step.';
}

function renderSummary(entries) {
  const latestStep = document.getElementById('latestStep');
  const latest = entries[0];

  if (latestStep) {
    latestStep.textContent = latest ? getEntryStep(latest) : 'Save a check-in to pick one step.';
  }

  const saveStatus = document.getElementById('saveStatus');
  if (saveStatus && entries.length) {
    const streak = getStreak(entries);
    saveStatus.dataset.streak = String(streak);
  }
}

function renderEntryList(entries) {
  const list = document.getElementById('entryList');
  if (!list) {
    return;
  }

  const recent = entries.slice(0, 4);
  if (!recent.length) {
    list.innerHTML = '<li class="entry-item"><strong>No notes yet</strong><p class="entry-copy">Save one small step.</p></li>';
    return;
  }

  list.innerHTML = recent.map((entry) => `
    <li class="entry-item">
      <strong>${escapeHtml(getEntryStep(entry))}</strong>
      <p class="entry-meta">${toReadableDate(entry.date)} · Feeling ${entry.mood}/5</p>
      <p class="entry-copy">${escapeHtml(getEntryNeed(entry))}</p>
    </li>
  `).join('');
}

function render() {
  const entries = getAllEntries();
  renderSummary(entries);
  renderEntryList(entries);
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

      status.textContent = ack && ack.err
        ? 'Saved on this phone.'
        : 'Saved.';
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
    if (entry && id) {
      mergeEntry(entry, id);
    }
  });
}

function syncMoodOutput() {
  const input = document.getElementById('moodScore');
  const output = document.getElementById('moodValue');
  if (input && output) {
    output.textContent = String(clampMood(input.value));
  }
}

function persistDraftFromForm() {
  saveDraft(getFormDraft());
}

function fillIfEmpty(id, value) {
  const element = document.getElementById(id);
  if (!element) {
    return;
  }

  if (element.value.trim()) {
    element.value = value;
  } else {
    element.value = value;
  }

  persistDraftFromForm();
  element.focus();
}

function initializeForm() {
  applyDraft(loadDraft() || { date: toDateInputValue(), mood: 3 });

  const moodInput = document.getElementById('moodScore');
  moodInput?.addEventListener('input', () => {
    syncMoodOutput();
    persistDraftFromForm();
  });

  for (const input of document.querySelectorAll('#lifeForm input, #lifeForm textarea')) {
    input.addEventListener('input', persistDraftFromForm);
  }

  document.querySelectorAll('[data-need]').forEach((button) => {
    button.addEventListener('click', () => {
      fillIfEmpty('todayText', button.dataset.need || '');
    });
  });

  document.querySelectorAll('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      fillIfEmpty('trueTaskText', button.dataset.step || '');
    });
  });

  const clearDraftButton = document.getElementById('clearDraft');
  clearDraftButton?.addEventListener('click', () => {
    window.localStorage.removeItem(DRAFT_KEY);
    applyDraft({ date: toDateInputValue(), mood: 3 });
    const status = document.getElementById('saveStatus');
    if (status) {
      status.textContent = 'Cleared.';
    }
  });
}

function initializeEntries() {
  for (const entry of loadStoredEntries()) {
    entriesById.set(entry.id, entry);
  }
  render();
  loadEntriesFromGun();
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
const portalRoot = gun && typeof gun.get === 'function'
  ? gun.get('3dvr-portal')
  : createLocalGunNodeStub();
const lifeRoot = portalRoot.get('life');
const entriesRoot = lifeRoot.get('entries');
const entriesById = new Map();

const form = document.getElementById('lifeForm');
const saveStatus = document.getElementById('saveStatus');

if (saveStatus) {
  saveStatus.textContent = gunContext.isStub
    ? 'Saves on this phone.'
    : 'Ready.';
}

initializeForm();
initializeEntries();

form?.addEventListener('submit', (event) => {
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
  window.localStorage.removeItem(DRAFT_KEY);
  applyDraft({ date: toDateInputValue(), mood: entry.mood });

  if (saveStatus) {
    saveStatus.textContent = 'Saved. Do one small step.';
  }
});
