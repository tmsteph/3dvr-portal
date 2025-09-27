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

const LOCAL_EVENTS_KEY = 'calendar.local.events';
const PROVIDER_LABELS = {
  local: 'Local',
  google: 'Google',
  outlook: 'Outlook'
};

const DEFAULT_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

const state = {
  connections: new Map(),
  localEvents: []
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

function parseEventDate(value) {
  if (!value) return Number.MAX_SAFE_INTEGER;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.MAX_SAFE_INTEGER : timestamp;
}

function normalizeStoredEvent(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const provider = raw.provider === 'google' || raw.provider === 'outlook' ? raw.provider : 'local';
  const now = new Date().toISOString();
  const base = {
    id: typeof raw.id === 'string' ? raw.id : generateLocalId(provider),
    provider,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Untitled event',
    description: typeof raw.description === 'string' ? raw.description : '',
    start: typeof raw.start === 'string' ? raw.start : raw.start === null ? null : '',
    end: typeof raw.end === 'string' ? raw.end : raw.end === null ? null : '',
    timeZone: typeof raw.timeZone === 'string' ? raw.timeZone : '',
    link: typeof raw.link === 'string' ? raw.link : '',
    metadata: raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : {},
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now
  };
  return base;
}

function sortEvents(events) {
  return events
    .slice()
    .sort((a, b) => {
      const startA = parseEventDate(a.start);
      const startB = parseEventDate(b.start);
      if (startA !== startB) {
        return startA - startB;
      }
      return a.title.localeCompare(b.title);
    });
}

function readLocalEvents() {
  try {
    const stored = localStorage.getItem(LOCAL_EVENTS_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(normalizeStoredEvent)
      .filter(Boolean);
  } catch (err) {
    console.warn('Unable to parse local events', err);
    return [];
  }
}

function writeLocalEvents(events) {
  const normalized = Array.isArray(events)
    ? events.map(normalizeStoredEvent).filter(Boolean)
    : [];
  const sorted = sortEvents(normalized);
  state.localEvents = sorted;
  try {
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(sorted));
  } catch (err) {
    console.warn('Unable to persist local events', err);
  }
  renderEvents();
}

function hydrateLocalEvents() {
  const events = sortEvents(readLocalEvents());
  state.localEvents = events;
  renderEvents();
}

function withTimeZoneLabel(text, timeZone) {
  if (!timeZone || !text || text === '—') {
    return text;
  }
  return `${text} (${timeZone})`;
}

function renderEvents(events = state.localEvents) {
  if (!eventList || !eventTemplate) return;
  eventList.innerHTML = '';
  const normalized = events.map(normalizeEvent).filter(Boolean);
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
    if (link) {
      if (entry.link) {
        link.href = entry.link;
        link.hidden = false;
      } else {
        link.hidden = true;
      }
    }
    const deleteButton = fragment.querySelector('[data-action="delete-event"]');
    if (deleteButton) {
      deleteButton.dataset.eventId = entry.id;
    }
    eventList.appendChild(fragment);
  });
}

function normalizeEvent(entry) {
  if (!entry) return null;
  const provider = typeof entry.provider === 'string' ? entry.provider : 'local';
  const baseLabel = PROVIDER_LABELS[provider] || PROVIDER_LABELS.local;
  const syncedProviders = Array.isArray(entry.metadata?.syncedProviders)
    ? entry.metadata.syncedProviders
    : [];
  let providerLabel = baseLabel;
  if (provider === 'local' && syncedProviders.length) {
    const syncedLabels = syncedProviders
      .map(key => PROVIDER_LABELS[key] || key)
      .join(', ');
    providerLabel = `${baseLabel} • Synced to ${syncedLabels}`;
  } else if (provider !== 'local') {
    providerLabel = `${baseLabel} • Imported`;
  }
  const title = entry.title || 'Untitled event';
  const description = entry.description || '';
  const start = withTimeZoneLabel(formatDateTime(entry.start, entry.timeZone), entry.timeZone);
  const end = withTimeZoneLabel(formatDateTime(entry.end, entry.timeZone), entry.timeZone);
  return {
    id: entry.id,
    provider,
    providerLabel,
    title,
    description,
    start,
    end,
    link: entry.link || ''
  };
}

function formatDateTime(value, timeZone) {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '—';
    }
    const formatter = new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone
    });
    return formatter.format(date);
  } catch (err) {
    console.warn('Unable to format date', value, err);
    return '—';
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
  if (!syncForm) return 'google';
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

function toISOStringIfPossible(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function generateLocalId(prefix = 'local') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}:${crypto.randomUUID()}`;
  }
  return `${prefix}:${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function mapRemoteEvent(provider, raw) {
  if (!raw) return null;
  if (provider === 'google') {
    const start = raw.start?.dateTime || raw.start?.date;
    const end = raw.end?.dateTime || raw.end?.date;
    const timeZone = raw.start?.timeZone || raw.end?.timeZone || '';
    return {
      id: `remote:${provider}:${raw.id || `${start || ''}:${end || ''}`}`,
      provider,
      title: raw.summary || 'Untitled event',
      description: raw.description || '',
      start: toISOStringIfPossible(start),
      end: toISOStringIfPossible(end),
      timeZone,
      link: raw.htmlLink || '',
      metadata: {
        remoteId: raw.id || null
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  if (provider === 'outlook') {
    const start = raw.start?.dateTime;
    const end = raw.end?.dateTime;
    const timeZone = raw.start?.timeZone || raw.end?.timeZone || '';
    return {
      id: `remote:${provider}:${raw.id || `${start || ''}:${end || ''}`}`,
      provider,
      title: raw.subject || 'Untitled event',
      description: raw.bodyPreview || '',
      start: toISOStringIfPossible(start),
      end: toISOStringIfPossible(end),
      timeZone,
      link: raw.webLink || '',
      metadata: {
        remoteId: raw.id || null
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
  return null;
}

function importRemoteEvents(provider, events = []) {
  if (!Array.isArray(events) || !events.length) {
    return { added: 0, updated: 0, total: 0 };
  }
  const list = [...state.localEvents];
  let added = 0;
  let updated = 0;
  events.forEach(raw => {
    const mapped = mapRemoteEvent(provider, raw);
    if (!mapped) {
      return;
    }
    const index = list.findIndex(item => item.id === mapped.id);
    if (index === -1) {
      list.push(mapped);
      added += 1;
    } else {
      list[index] = {
        ...list[index],
        ...mapped,
        updatedAt: new Date().toISOString()
      };
      updated += 1;
    }
  });
  if (added || updated) {
    writeLocalEvents(list);
  } else {
    renderEvents();
  }
  return { added, updated, total: added + updated };
}

async function handleFetchEvents() {
  if (!syncForm) return;
  const provider = getSelectedProvider();
  const connection = getConnectionOrWarn(provider);
  if (!connection) {
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
    showLog(`Importing events from ${PROVIDERS[provider].label}…`);
    const data = await callProvider(provider, payload);
    const imported = importRemoteEvents(provider, data.events || []);
    if (!imported.total) {
      showLog(`No new events from ${PROVIDERS[provider].label}.`, 'info');
      return;
    }
    const summary = [];
    if (imported.added) summary.push(`${imported.added} new`);
    if (imported.updated) summary.push(`${imported.updated} updated`);
    const detail = summary.join(' and ');
    showLog(`Imported ${detail} event${imported.total === 1 ? '' : 's'} from ${PROVIDERS[provider].label}.`, 'success');
  } catch (err) {
    showLog(err.message || 'Unable to import events.', 'error');
  }
}

function updateLocalEvent(eventId, patch) {
  const list = state.localEvents.map(entry => {
    if (entry.id !== eventId) {
      return entry;
    }
    const mergedMetadata = {
      ...(entry.metadata && typeof entry.metadata === 'object' ? entry.metadata : {}),
      ...(patch.metadata || {})
    };
    return {
      ...entry,
      ...patch,
      metadata: mergedMetadata,
      updatedAt: new Date().toISOString()
    };
  });
  writeLocalEvents(list);
}

function deleteLocalEvent(id) {
  if (!id) return;
  const remaining = state.localEvents.filter(event => event.id !== id);
  if (remaining.length === state.localEvents.length) {
    return;
  }
  writeLocalEvents(remaining);
  showLog('Event removed from your local calendar.', 'info');
}

function handleEventListClick(event) {
  const button = event.target.closest('button[data-action="delete-event"]');
  if (!button) return;
  const { eventId } = button.dataset;
  if (eventId) {
    deleteLocalEvent(eventId);
  }
}

async function handleCreateEvent(event) {
  event.preventDefault();
  if (!createEventForm) return;
  const formData = new FormData(createEventForm);
  const title = formData.get('title')?.toString().trim();
  const startValue = formData.get('start')?.toString();
  const endValue = formData.get('end')?.toString();
  const timeZone = formData.get('timeZone')?.toString().trim() || DEFAULT_TIME_ZONE || 'UTC';
  const description = formData.get('description')?.toString().trim() || '';

  if (!title || !startValue || !endValue) {
    showLog('Please provide a title, start, and end time.', 'error');
    return;
  }

  const start = toISOStringIfPossible(startValue);
  const end = toISOStringIfPossible(endValue);
  if (!start || !end) {
    showLog('Please provide valid start and end times.', 'error');
    return;
  }

  if (new Date(start).getTime() > new Date(end).getTime()) {
    showLog('End time must be after the start time.', 'error');
    return;
  }

  const localEvent = {
    id: generateLocalId('local'),
    provider: 'local',
    title,
    description,
    start,
    end,
    timeZone,
    link: '',
    metadata: { createdFrom: 'local' },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  writeLocalEvents([...state.localEvents, localEvent]);

  const storedEvent = state.localEvents.find(item => item.id === localEvent.id) || localEvent;

  createEventForm.reset();
  hydrateCreateFormDefaults();

  const messages = ['Event saved to your local calendar.'];
  let messageType = 'success';

  const syncTargets = Array.from(
    new Set(
      formData
        .getAll('syncProviders')
        .map(value => value?.toString())
        .filter(value => value && PROVIDERS[value])
    )
  );

  if (syncTargets.length) {
    const result = await syncEventToProviders(storedEvent, syncTargets);
    if (result.lines.length) {
      messages.push(...result.lines);
    }
    if (result.type === 'error') {
      messageType = 'error';
    }
  }

  showLog(messages.join('\n'), messageType);
}

async function syncEventToProviders(localEvent, providers) {
  const lines = [];
  let overallType = 'success';
  const syncedProviders = Array.isArray(localEvent.metadata?.syncedProviders)
    ? [...localEvent.metadata.syncedProviders]
    : [];

  for (const provider of providers) {
    const config = PROVIDERS[provider];
    if (!config) {
      continue;
    }
    const label = config.label;
    const connection = state.connections.get(provider);
    if (!connection) {
      lines.push(`${label} is not connected. Open the section above to add a token and try again.`);
      overallType = 'error';
      continue;
    }
    const payload = {
      action: 'createEvent',
      accessToken: connection.accessToken,
      title: localEvent.title,
      description: localEvent.description,
      start: localEvent.start,
      end: localEvent.end,
      timeZone: localEvent.timeZone || DEFAULT_TIME_ZONE || 'UTC'
    };
    if (provider === 'google') {
      payload.calendarId = connection.calendarId || PROVIDERS.google.defaults.calendarId;
    }
    if (provider === 'outlook' && connection.mailbox) {
      payload.mailbox = connection.mailbox;
    }
    try {
      const response = await callProvider(provider, payload);
      lines.push(`Synced to ${label}${response.event?.id ? ` (id: ${response.event.id})` : ''}.`);
      if (!syncedProviders.includes(provider)) {
        syncedProviders.push(provider);
      }
    } catch (err) {
      lines.push(`Failed to sync to ${label}: ${err.message || 'Unknown error.'}`);
      overallType = 'error';
    }
  }

  if (syncedProviders.length !== (localEvent.metadata?.syncedProviders?.length || 0)) {
    updateLocalEvent(localEvent.id, {
      metadata: {
        ...localEvent.metadata,
        syncedProviders
      }
    });
  }

  return {
    lines,
    type: overallType
  };
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

function hydrateCreateFormDefaults() {
  if (!createEventForm) return;
  const timeZoneField = createEventForm.elements.namedItem('timeZone');
  if (timeZoneField instanceof HTMLInputElement) {
    timeZoneField.value = timeZoneField.value || DEFAULT_TIME_ZONE || 'UTC';
  }
}

function bindEvents() {
  document
    .querySelectorAll('.connection-card__form')
    .forEach(form => form.addEventListener('submit', onConnectionSubmit));

  document
    .querySelectorAll('button[data-action="disconnect"]')
    .forEach(button => button.addEventListener('click', handleDisconnect));

  if (syncForm) {
    const fetchButton = syncForm.querySelector('[data-action="fetch-events"]');
    const refreshButton = syncForm.querySelector('[data-action="refresh-status"]');
    if (fetchButton) {
      fetchButton.addEventListener('click', handleFetchEvents);
    }
    if (refreshButton) {
      refreshButton.addEventListener('click', hydrateState);
    }
  }

  if (createEventForm) {
    createEventForm.addEventListener('submit', handleCreateEvent);
  }

  if (eventList) {
    eventList.addEventListener('click', handleEventListClick);
  }
}

hydrateState();
hydrateLocalEvents();
hydrateCreateFormDefaults();
bindEvents();
showLog('Ready to manage your local calendar. Connect Google or Outlook to sync when needed.');
