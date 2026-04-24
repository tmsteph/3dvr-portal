const STORAGE_KEY = 'portal-alive-system-cache';
const DEFAULT_STATE = {
  log: [],
  redirects: 0,
  social: 0,
  morning: null
};

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
    map() {
      return {
        __isGunStub: true,
        on() {
          return { off() {} };
        }
      };
    }
  };
  return node;
}

function safeParseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
}

function makeId(prefix = 'alive') {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function todayKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return todayKey();
  }
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function nowStamp() {
  return new Date().toISOString();
}

function displayTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Now';
  }
  return date.toLocaleString();
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeState(state) {
  const source = state && typeof state === 'object' ? state : {};
  return {
    log: Array.isArray(source.log) ? source.log.map(normalizeLogItem).filter(Boolean).slice(0, 40) : [],
    redirects: Math.max(0, Number(source.redirects || 0)),
    social: Math.max(0, Number(source.social || 0)),
    morning: source.morning && typeof source.morning === 'object' ? source.morning : null,
    updatedAt: source.updatedAt || nowStamp(),
    author: String(source.author || '')
  };
}

function normalizeLogItem(item) {
  if (!item || typeof item !== 'object') {
    return null;
  }

  return {
    id: String(item.id || makeId('entry')),
    type: String(item.type || 'note'),
    text: String(item.text || ''),
    meta: item.meta && typeof item.meta === 'object' ? item.meta : {},
    time: item.time || nowStamp(),
    day: item.day || todayKey(item.time || new Date())
  };
}

function loadCachedState() {
  return normalizeState(safeParseJson(window.localStorage.getItem(STORAGE_KEY), DEFAULT_STATE));
}

function cacheState(state) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state)));
}

function resolveAuthor(user) {
  if (user && user.is && user.is.pub) {
    return user.is.pub;
  }

  if (window.ScoreSystem && typeof window.ScoreSystem.ensureGuestIdentity === 'function') {
    return window.ScoreSystem.ensureGuestIdentity();
  }

  return 'guest';
}

function getGunContext() {
  const ensureGun = window.ScoreSystem && typeof window.ScoreSystem.ensureGun === 'function'
    ? window.ScoreSystem.ensureGun.bind(window.ScoreSystem)
    : null;
  const factory = () => (typeof Gun === 'function'
    ? Gun({
      peers: window.__GUN_PEERS__ || [
        'wss://relay.3dvr.tech/gun',
        'wss://gun-relay-3dvr.fly.dev/gun'
      ],
      axe: true
    })
    : null);

  if (ensureGun) {
    return ensureGun(factory, { label: 'alive-system' });
  }

  const gun = factory();
  if (gun) {
    return {
      gun,
      user: typeof gun.user === 'function' ? gun.user() : null,
      isStub: !!gun.__isGunStub
    };
  }

  const stub = {
    __isGunStub: true,
    get() {
      return createLocalGunNodeStub();
    },
    user() {
      return createLocalGunNodeStub();
    }
  };
  return { gun: stub, user: stub.user(), isStub: true };
}

function readCurrentState() {
  return normalizeState(state);
}

function writePortalState(nextState, statusMessage = 'Saved to Alive System and queued for Gun sync.') {
  state = normalizeState({
    ...nextState,
    updatedAt: nowStamp(),
    author
  });
  cacheState(state);
  render();

  if (!aliveRoot || typeof aliveRoot.get !== 'function') {
    setSyncStatus('Saved locally. Gun is unavailable right now.');
    return;
  }

  // Gun graph: 3dvr-portal/alive-system/state/<author> -> latest dashboard state.
  // Gun graph: 3dvr-portal/alive-system/entries/<entryId> -> append-only activity records.
  stateRoot.put(state, (ack) => {
    if (ack && ack.err) {
      setSyncStatus('Saved locally. Gun sync will retry when the relay is reachable.');
    } else {
      setSyncStatus(statusMessage);
    }
  });
}

function writeEntryToGun(entry) {
  if (!entriesRoot || typeof entriesRoot.get !== 'function') {
    return;
  }
  entriesRoot.get(entry.id).put({
    ...entry,
    author
  });
}

function addLog(type, text, meta = {}) {
  const entry = normalizeLogItem({
    id: makeId(type),
    type,
    text,
    meta,
    time: nowStamp(),
    day: todayKey()
  });
  const nextState = readCurrentState();
  nextState.log = [entry, ...nextState.log].slice(0, 40);
  writeEntryToGun(entry);
  writePortalState(nextState);
}

function setSyncStatus(message) {
  const status = document.getElementById('syncStatus');
  if (status) {
    status.textContent = message;
  }
}

function getCheckedMorning() {
  return {
    sunlight: document.getElementById('sunlight')?.checked || false,
    breathwork: document.getElementById('breathwork')?.checked || false,
    movement: document.getElementById('movement')?.checked || false,
    smallWin: document.getElementById('smallWin')?.checked || false,
    time: nowStamp(),
    day: todayKey()
  };
}

function saveMorning() {
  const nextState = readCurrentState();
  nextState.morning = getCheckedMorning();
  const completed = ['sunlight', 'breathwork', 'movement', 'smallWin']
    .filter((key) => nextState.morning[key]).length;
  writePortalState(nextState);
  addLog('morning', `Morning ritual logged (${completed}/4).`, { completed });
}

function prefillMorning() {
  for (const id of ['sunlight', 'breathwork', 'movement', 'smallWin']) {
    const input = document.getElementById(id);
    if (input) {
      input.checked = true;
    }
  }
}

function saveCheckin() {
  const energy = clampNumber(document.getElementById('energy')?.value, 1, 10);
  const focus = clampNumber(document.getElementById('focus')?.value, 1, 10);
  const urge = clampNumber(document.getElementById('urge')?.value, 1, 10);
  addLog('checkin', `Energy ${energy}/10, focus ${focus}/10, urge ${urge}/10.`, { energy, focus, urge });
}

function redirectAction(type, message) {
  const nextState = readCurrentState();
  nextState.redirects = Number(nextState.redirects || 0) + 1;
  const redirectStatus = document.getElementById('redirectStatus');
  if (redirectStatus) {
    redirectStatus.textContent = `${message} Use the charge, then move.`;
  }
  writePortalState(nextState);
  addLog('redirect', `Redirect: ${type}. ${message}`, { type });
}

function saveSocial() {
  const count = clampNumber(document.getElementById('socialCount')?.value, 0, 10);
  const noteInput = document.getElementById('socialNote');
  const note = noteInput && noteInput.value.trim() ? noteInput.value.trim() : 'No note added.';
  const nextState = readCurrentState();
  nextState.social = Math.max(Number(nextState.social || 0), count);
  writePortalState(nextState);
  addLog('social', `Social count ${count}/10. ${note}`, { count, note });
  if (noteInput) {
    noteInput.value = '';
  }
}

function quickSocial(text) {
  const noteInput = document.getElementById('socialNote');
  const countInput = document.getElementById('socialCount');
  const countOutput = document.getElementById('socialCountValue');
  if (noteInput) {
    noteInput.value = text;
  }
  if (countInput) {
    countInput.value = String(Math.min(10, Number(countInput.value || 0) + 1));
  }
  if (countInput && countOutput) {
    countOutput.textContent = countInput.value;
  }
}

function showHook(path) {
  const hookStatus = document.getElementById('hookStatus');
  if (hookStatus) {
    hookStatus.textContent = `Opening ${path}`;
  }
  window.location.href = path;
}

function render() {
  const current = readCurrentState();
  const today = todayKey();
  const todayLog = current.log.filter((item) => item.day === today);
  const checkins = todayLog.filter((item) => item.type === 'checkin').length;

  document.getElementById('kpiCheckins').textContent = String(checkins);
  document.getElementById('kpiSocial').textContent = String(current.social || 0);
  document.getElementById('kpiRedirects').textContent = String(current.redirects || 0);

  const morningStatus = document.getElementById('morningStatus');
  if (morningStatus && current.morning) {
    const completed = ['sunlight', 'breathwork', 'movement', 'smallWin']
      .filter((key) => current.morning[key]).length;
    morningStatus.textContent = `Last ritual: ${displayTime(current.morning.time)} · ${completed}/4 complete.`;
  }

  const list = document.getElementById('log');
  if (!list) {
    return;
  }

  if (!current.log.length) {
    list.innerHTML = '<li class="log-item small">No activity yet. Start with a morning ritual or a check-in.</li>';
    return;
  }

  list.innerHTML = current.log.slice(0, 12).map((item) => `
    <li class="log-item">
      <div class="small">${displayTime(item.time)} · ${escapeHtml(item.type)}</div>
      <div>${escapeHtml(item.text)}</div>
    </li>
  `).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function subscribeToGun() {
  if (!stateRoot || typeof stateRoot.on !== 'function') {
    return;
  }

  stateRoot.on((remoteState) => {
    if (!remoteState || typeof remoteState !== 'object') {
      return;
    }
    const remoteUpdated = new Date(remoteState.updatedAt || 0).getTime();
    const localUpdated = new Date(state.updatedAt || 0).getTime();
    if (remoteUpdated >= localUpdated) {
      state = normalizeState(remoteState);
      cacheState(state);
      render();
    }
  });
}

function syncSlider(inputId, outputId) {
  const input = document.getElementById(inputId);
  const output = document.getElementById(outputId);
  if (!input || !output) {
    return;
  }

  const update = () => {
    output.textContent = input.value;
  };
  input.addEventListener('input', update);
  update();
}

function bindEvents() {
  document.getElementById('saveMorning')?.addEventListener('click', saveMorning);
  document.getElementById('prefillMorning')?.addEventListener('click', prefillMorning);
  document.getElementById('saveCheckin')?.addEventListener('click', saveCheckin);
  document.getElementById('saveSocial')?.addEventListener('click', saveSocial);

  for (const button of document.querySelectorAll('[data-redirect]')) {
    button.addEventListener('click', () => redirectAction(button.dataset.redirect, button.dataset.message));
  }

  for (const button of document.querySelectorAll('[data-social-note]')) {
    button.addEventListener('click', () => quickSocial(button.dataset.socialNote));
  }

  for (const button of document.querySelectorAll('[data-hook]')) {
    button.addEventListener('click', () => showHook(button.dataset.hook));
  }

  syncSlider('energy', 'energyValue');
  syncSlider('focus', 'focusValue');
  syncSlider('urge', 'urgeValue');
  syncSlider('socialCount', 'socialCountValue');
}

const gunContext = getGunContext();
const gun = gunContext.gun;
const user = gunContext.user;
const author = resolveAuthor(user);
const portalRoot = gun && typeof gun.get === 'function' ? gun.get('3dvr-portal') : createLocalGunNodeStub();
const aliveRoot = portalRoot.get('alive-system');
const stateRoot = aliveRoot.get('state').get(author);
const entriesRoot = aliveRoot.get('entries');
let state = loadCachedState();

setSyncStatus(gunContext.isStub
  ? 'Offline mode. Activity is cached locally and will use Gun when available.'
  : 'Connected to the 3DVR Gun relay.');
bindEvents();
render();
subscribeToGun();
