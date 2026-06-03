export const BODY_MODE_KEYS = Object.freeze({
  reduceMotion: 'bodyMode.reduceMotion',
  preferredMode: 'bodyMode.preferredMode',
  lastUsedApp: 'bodyMode.lastUsedApp',
});

export const BODY_MODE_DEFAULTS = Object.freeze({
  reduceMotion: false,
  preferredMode: 'work-reset',
  lastUsedApp: '',
});

export const BODY_MODE_APPS = Object.freeze([
  {
    id: 'seated-spine-reset',
    title: 'Seated Spine Reset',
    href: '/body-mode/seated-spine-reset/',
    status: 'Ready',
    description: 'A quiet 3-5 minute posture and mobility reset for neck, shoulders, spine, hips, and breath.',
  },
  {
    id: 'breathing-room',
    title: 'Breathing Room',
    href: '/meditation/',
    status: 'Available',
    description: 'Guided breathing for calming, focusing, and returning to the present.',
  },
  {
    id: 'integration-journal',
    title: 'Integration Journal',
    href: '#integration-journal',
    status: 'Planned',
    description: 'Reflect on dreams, meditation, emotional breakthroughs, and psychedelic experiences with grounded prompts.',
  },
  {
    id: 'one-next-action',
    title: 'One Next Action',
    href: '#one-next-action',
    status: 'Planned',
    description: 'Turn an insight into one small real-world step.',
  },
  {
    id: 'sleep-wind-down',
    title: 'Sleep Wind-Down',
    href: '#sleep-wind-down',
    status: 'Planned',
    description: 'A low-light routine for relaxing your body and reducing screen intensity before bed.',
  },
]);

export function readBodyModePreferences(storage = globalThis.localStorage) {
  return {
    reduceMotion: readBoolean(storage, BODY_MODE_KEYS.reduceMotion, BODY_MODE_DEFAULTS.reduceMotion),
    preferredMode: readString(storage, BODY_MODE_KEYS.preferredMode, BODY_MODE_DEFAULTS.preferredMode),
    lastUsedApp: readString(storage, BODY_MODE_KEYS.lastUsedApp, BODY_MODE_DEFAULTS.lastUsedApp),
  };
}

export function writeBodyModePreference(name, value, storage = globalThis.localStorage) {
  if (!storage || typeof storage.setItem !== 'function') {
    return readBodyModePreferences(storage);
  }

  if (!Object.prototype.hasOwnProperty.call(BODY_MODE_KEYS, name)) {
    throw new Error(`Unknown Body Mode preference: ${name}`);
  }

  storage.setItem(BODY_MODE_KEYS[name], serializePreference(name, value));
  return readBodyModePreferences(storage);
}

export function setBodyModeLastUsed(appId, storage = globalThis.localStorage) {
  return writeBodyModePreference('lastUsedApp', appId, storage);
}

export function getBodyModeApp(appId) {
  return BODY_MODE_APPS.find(app => app.id === appId) || null;
}

export function applyBodyModePreferences(documentRef = globalThis.document, preferences = readBodyModePreferences()) {
  if (!documentRef || !documentRef.body) {
    return;
  }
  documentRef.body.dataset.reduceMotion = preferences.reduceMotion ? 'true' : 'false';
}

function readBoolean(storage, key, fallback) {
  if (!storage || typeof storage.getItem !== 'function') {
    return fallback;
  }
  const value = storage.getItem(key);
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function readString(storage, key, fallback) {
  if (!storage || typeof storage.getItem !== 'function') {
    return fallback;
  }
  const value = storage.getItem(key);
  return typeof value === 'string' && value ? value : fallback;
}

function serializePreference(name, value) {
  if (name === 'reduceMotion') {
    return value ? 'true' : 'false';
  }
  return String(value || '');
}

function updateLastUsedLabel(documentRef, preferences) {
  const label = documentRef.getElementById('lastUsedApp');
  if (!label) {
    return;
  }
  const app = getBodyModeApp(preferences.lastUsedApp);
  label.textContent = app ? app.title : 'None yet';
}

function bindPreferenceControls(documentRef) {
  const reduceMotionToggle = documentRef.getElementById('reduceMotionToggle');
  const preferredModeSelect = documentRef.getElementById('preferredMode');
  const preferences = readBodyModePreferences();

  applyBodyModePreferences(documentRef, preferences);
  updateLastUsedLabel(documentRef, preferences);

  if (reduceMotionToggle) {
    reduceMotionToggle.checked = preferences.reduceMotion;
    reduceMotionToggle.addEventListener('change', event => {
      const next = writeBodyModePreference('reduceMotion', event.target.checked);
      applyBodyModePreferences(documentRef, next);
      updateLastUsedLabel(documentRef, next);
    });
  }

  if (preferredModeSelect) {
    preferredModeSelect.value = preferences.preferredMode;
    preferredModeSelect.addEventListener('change', event => {
      const next = writeBodyModePreference('preferredMode', event.target.value);
      applyBodyModePreferences(documentRef, next);
      updateLastUsedLabel(documentRef, next);
    });
  }
}

function bindBodyModeCards(documentRef) {
  documentRef.querySelectorAll('[data-body-app]').forEach(card => {
    card.addEventListener('click', () => {
      const appId = card.getAttribute('data-body-app') || '';
      const next = setBodyModeLastUsed(appId);
      updateLastUsedLabel(documentRef, next);
    });
  });
}

function initBodyMode() {
  if (typeof document === 'undefined') {
    return;
  }
  bindPreferenceControls(document);
  bindBodyModeCards(document);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBodyMode, { once: true });
  } else {
    initBodyMode();
  }
}
