const PROVIDERS = {
  google: {
    label: 'Google Calendar',
    storageKey: 'calendar.google.connection',
    endpoint: '/api/calendar/google',
    defaults: { calendarId: 'primary' }
  },
  outlook: {
    label: 'Outlook',
    storageKey: 'calendar.outlook.connection',
    endpoint: '/api/calendar/outlook',
    defaults: { mailbox: '' }
  }
};

const state = {
  connections: new Map()
};

const statusElements = new Map(
  Array.from(document.querySelectorAll('[data-status]')).map(el => [el.dataset.status, el])
);

const eventList = document.querySelector('[data-event-list]');
const emptyState = document.querySelector('[data-empty]');
const logPanel = document.querySelector('[data-log]');
const eventTemplate = document.getElementById('event-template');
const syncForm = document.getElementById('event-sync-form');
const createEventForm = document.getElementById('create-event-form');

function readConnection(provider) {
  const config = PROVIDERS[provider];
  if (!config) return null;
  try {
    const stored = localStorage.getItem(config.storageKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.accessToken) return null;
    return parsed;
  } catch (err) {
    console.warn('Unable to parse stored connection', provider, err);
    return null;
  }
}

function writeConnection(provider, payload) {
  const config = PROVIDERS[provider];
  if (!config) return;
  const record = {
    ...config.defaults,
    ...payload,
    updatedAt: new Date().toISOString()
  };
  localStorage.setItem(config.storageKey, JSON.stringify(record));
  state.connections.set(provider, record);
  updateStatus(provider, true);
}

function removeConnection(provider) {
  const config = PROVIDERS[provider];
  if (!config) return;
  localStorage.removeItem(config.storageKey);
  state.connections.delete(provider);
  updateStatus(provider, false);
}

function updateStatus(provider, isConnected) {
  const el = statusElements.get(provider);
  if (!el) return;
  el.dataset.connected = String(Boolean(isConnected));
  el.textContent = isConnected ? 'Connected' : 'Disconnected';
}

function hydrateForms() {
  Object.keys(PROVIDERS).forEach(provider => {
    const form = document.querySelector(`form[data-provider="${provider}"]`);
    if (!form) return;
    const connection = state.connections.get(provider);
    const config = PROVIDERS[provider];
    const controls = new FormData(form);
    controls.forEach((_, key) => {
      const field = form.elements.namedItem(key);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
        return;
      }
      if (connection && typeof connection[key] === 'string') {
        field.value = connection[key];
      } else if (config.defaults[key]) {
        field.value = config.defaults[key];
      } else {
        field.value = '';
      }
    });
  });
}

function hydrateState() {
  state.connections.clear();
  Object.keys(PROVIDERS).forEach(provider => {
    const stored = readConnection(provider);
    if (stored) {
      state.connections.set(provider, stored);
    }
    updateStatus(provider, Boolean(stored));
  });
  hydrateForms();
}

function showLog(message, type = 'info') {
  if (!logPanel) return;
  const prefix = type === 'error' ? '⚠️' : type === 'success' ? '✅' : 'ℹ️';
  logPanel.textContent = `${prefix} ${message}`;
}

function clearEvents() {
  if (eventList) {
    eventList.innerHTML = '';
  }
  if (emptyState) {
    emptyState.hidden = false;
  }
}

function renderEvents(provider, events = []) {
  if (!eventList || !eventTemplate) return;
  eventList.innerHTML = '';
  const normalized = events.map(event => normalizeEvent(provider, event)).filter(Boolean);
  if (!normalized.length) {
    if (emptyState) {
      emptyState.hidden = false;
    }
    return;
  }
  if (emptyState) {
    emptyState.hidden = true;
  }
  normalized.forEach(entry => {
    const fragment = eventTemplate.content.cloneNode(true);
    fragment.querySelector('[data-field="title"]').textContent = entry.title;
    fragment.querySelector('[data-field="provider"]').textContent = entry.providerLabel;
    fragment.querySelector('[data-field="start"]').textContent = entry.start;
    fragment.querySelector('[data-field="end"]').textContent = entry.end;
    fragment.querySelector('[data-field="description"]').textContent = entry.description;
    const link = fragment.querySelector('[data-field="link"]');
    if (entry.link) {
      link.href = entry.link;
      link.hidden = false;
    } else {
      link.hidden = true;
    }
    eventList.appendChild(fragment);
  });
}

function normalizeEvent(provider, raw) {
  if (!raw) return null;
  if (provider === 'google') {
    const start = raw.start?.dateTime || raw.start?.date;
    const end = raw.end?.dateTime || raw.end?.date;
    return {
      providerLabel: 'Google',
      title: raw.summary || 'Untitled event',
      description: raw.description || '',
      start: formatDateTime(start),
      end: formatDateTime(end),
      link: raw.htmlLink || null
    };
  }
  if (provider === 'outlook') {
    return {
      providerLabel: 'Outlook',
      title: raw.subject || 'Untitled event',
      description: raw.bodyPreview || '',
      start: formatDateTime(raw.start?.dateTime, raw.start?.timeZone),
      end: formatDateTime(raw.end?.dateTime, raw.end?.timeZone),
      link: raw.webLink || null
    };
  }
  return null;
}

function formatDateTime(value, timeZone) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone
    });
    return formatter.format(date);
  } catch (err) {
    console.warn('Unable to format date', value, err);
    return value;
  }
}

async function callProvider(provider, payload) {
  const config = PROVIDERS[provider];
  if (!config) throw new Error('Unknown provider');
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error || data?.message || 'Request failed';
    throw new Error(message);
  }
  return data;
}

function getSelectedProvider() {
  const formData = new FormData(syncForm);
  return formData.get('provider') || 'google';
}

function getConnectionOrWarn(provider) {
  const connection = state.connections.get(provider);
  if (!connection) {
    showLog(`${PROVIDERS[provider].label} is not connected yet. Save a token first.`, 'error');
    return null;
  }
  return connection;
}

async function handleFetchEvents() {
  const provider = getSelectedProvider();
  const connection = getConnectionOrWarn(provider);
  if (!connection) {
    clearEvents();
    return;
  }
  const params = new FormData(syncForm);
  const payload = {
    action: 'listEvents',
    accessToken: connection.accessToken
  };
  if (provider === 'google') {
    payload.calendarId = connection.calendarId || PROVIDERS.google.defaults.calendarId;
  }
  if (provider === 'outlook' && connection.mailbox) {
    payload.mailbox = connection.mailbox;
  }
  const timeMin = params.get('timeMin');
  const timeMax = params.get('timeMax');
  const maxResults = params.get('maxResults');
  if (timeMin) payload.timeMin = new Date(timeMin).toISOString();
  if (timeMax) payload.timeMax = new Date(timeMax).toISOString();
  if (maxResults) payload.maxResults = Number(maxResults);
  try {
    showLog(`Fetching ${PROVIDERS[provider].label} events…`);
    const data = await callProvider(provider, payload);
    renderEvents(provider, data.events || []);
    showLog(`Loaded ${data.events?.length || 0} events from ${PROVIDERS[provider].label}.`, 'success');
  } catch (err) {
    clearEvents();
    showLog(err.message || 'Unable to fetch events.', 'error');
  }
}

async function handleCreateEvent(event) {
  event.preventDefault();
  const formData = new FormData(createEventForm);
  const provider = formData.get('provider');
  const connection = getConnectionOrWarn(provider);
  if (!connection) {
    return;
  }
  const payload = {
    action: 'createEvent',
    accessToken: connection.accessToken,
    title: formData.get('title'),
    description: formData.get('description'),
    start: formData.get('start'),
    end: formData.get('end'),
    timeZone: formData.get('timeZone') || 'UTC'
  };
  if (!payload.title || !payload.start || !payload.end) {
    showLog('Please provide a title, start, and end time.', 'error');
    return;
  }
  if (provider === 'google') {
    payload.calendarId = connection.calendarId || PROVIDERS.google.defaults.calendarId;
  }
  if (provider === 'outlook' && connection.mailbox) {
    payload.mailbox = connection.mailbox;
  }
  try {
    showLog(`Creating event in ${PROVIDERS[provider].label}…`);
    const result = await callProvider(provider, payload);
    showLog(`Event created successfully (${result.event?.id || 'no id returned'}).`, 'success');
    createEventForm.reset();
  } catch (err) {
    showLog(err.message || 'Unable to create event.', 'error');
  }
}

function onConnectionSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const provider = form.dataset.provider;
  const formData = new FormData(form);
  const accessToken = formData.get('accessToken')?.trim();
  if (!accessToken) {
    showLog('Access token is required.', 'error');
    return;
  }
  const record = { accessToken };
  if (provider === 'google') {
    record.calendarId = formData.get('calendarId')?.trim() || PROVIDERS.google.defaults.calendarId;
  }
  if (provider === 'outlook') {
    record.mailbox = formData.get('mailbox')?.trim();
  }
  writeConnection(provider, record);
  showLog(`${PROVIDERS[provider].label} connection stored locally.`, 'success');
}

function handleDisconnect(event) {
  const button = event.currentTarget;
  const provider = button.dataset.provider;
  removeConnection(provider);
  const form = document.querySelector(`form[data-provider="${provider}"]`);
  if (form) {
    form.reset();
  }
  hydrateForms();
  showLog(`${PROVIDERS[provider].label} tokens removed from this browser.`, 'info');
}

function bindEvents() {
  document
    .querySelectorAll('.connection-card__form')
    .forEach(form => form.addEventListener('submit', onConnectionSubmit));

  document
    .querySelectorAll('button[data-action="disconnect"]')
    .forEach(button => button.addEventListener('click', handleDisconnect));

  syncForm.querySelector('[data-action="fetch-events"]').addEventListener('click', handleFetchEvents);
  syncForm.querySelector('[data-action="refresh-status"]').addEventListener('click', hydrateState);
  createEventForm.addEventListener('submit', handleCreateEvent);
}

hydrateState();
bindEvents();
clearEvents();
showLog('Ready to connect a provider and sync events.');
