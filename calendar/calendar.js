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
const DEFAULT_EVENT_START_OFFSET_MINUTES = 5;
const DEFAULT_EVENT_DURATION_MINUTES = 10;
const AUTO_SEEDED_METADATA_KEY = 'autoSeededOn';

function startOfMonth(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(1);
  return result;
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function toDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

const state = {
  connections: new Map(),
  localEvents: []
};

const today = startOfDay(new Date());
const calendarState = {
  viewDate: startOfMonth(new Date()),
  weekStartsOn: 0,
  selectedDate: today.toISOString().slice(0, 10),
  dayEvents: new Map()
};

const GUN_PEERS = (typeof window !== 'undefined' && window.__GUN_PEERS__) || [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];
const gun = typeof Gun === 'function' ? Gun(GUN_PEERS) : null;
const portalRoot = gun ? gun.get('3dvr-portal') : null;
const calendarRoot = portalRoot ? portalRoot.get('calendar') : null;
const calendarOwnerKey = calendarRoot ? resolveCalendarOwnerKey() : null;
const gunEvents = calendarOwnerKey ? calendarRoot.get('users').get(calendarOwnerKey).get('events') : null;
let isGunApplying = false;

const statusElements = new Map(
  Array.from(document.querySelectorAll('[data-status]')).map(el => [el.dataset.status, el])
);

const eventList = document.querySelector('[data-event-list]');
const emptyState = document.querySelector('[data-empty]');
const logPanel = document.querySelector('[data-log]');
const eventTemplate = document.getElementById('event-template');
const syncForm = document.getElementById('event-sync-form');
const createEventContainer = document.querySelector('[data-create-event-container]');
const createEventToggle = document.querySelector('[data-action="toggle-create-event"]');
const createEventForm = document.getElementById('create-event-form');
const calendarDayNames = document.querySelector('[data-calendar-day-names]');
const calendarGrid = document.querySelector('[data-calendar-grid]');
const calendarCurrentLabel = document.querySelector('[data-calendar-current]');
const calendarTodayButton = document.querySelector('[data-calendar-today]');
const calendarNavButtons = document.querySelectorAll('[data-calendar-nav]');
const calendarDetails = document.querySelector('[data-calendar-details]');
const calendarDetailsTitle = document.querySelector('[data-calendar-details-title]');
const calendarDetailsList = document.querySelector('[data-calendar-details-list]');
const calendarDetailsEmpty = document.querySelector('[data-calendar-details-empty]');
const calendarDetailsActions = document.querySelector('[data-calendar-details-actions]');
const addEventForDayButton = document.querySelector('[data-action="add-event-for-day"]');

const calendarMonthFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric'
});
const calendarWeekdayFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short'
});
const calendarFullDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'full'
});

function slugifyKey(value, fallback = '') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) {
    return fallback;
  }
  const slug = normalized.replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '');
  return slug || fallback;
}

function ensureCalendarGuestId() {
  try {
    const legacyId = localStorage.getItem('userId');
    if (legacyId && !localStorage.getItem('guestId')) {
      localStorage.setItem('guestId', legacyId);
    }
    if (legacyId) {
      localStorage.removeItem('userId');
    }
    let guestId = localStorage.getItem('guestId');
    if (!guestId) {
      guestId = `guest_${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem('guestId', guestId);
    }
    if (!localStorage.getItem('guestDisplayName')) {
      localStorage.setItem('guestDisplayName', 'Guest');
    }
    localStorage.setItem('guest', 'true');
    return guestId;
  } catch (err) {
    console.warn('Unable to ensure guest identity for calendar sync', err);
    return 'guest';
  }
}

function resolveCalendarOwnerKey() {
  const signedIn = localStorage.getItem('signedIn') === 'true';
  const alias = (localStorage.getItem('alias') || '').trim();
  const username = (localStorage.getItem('username') || '').trim();
  if (signedIn) {
    const aliasKey = slugifyKey(alias || username, '');
    if (aliasKey) {
      return `user:${aliasKey}`;
    }
  }
  if (window.ScoreSystem && typeof window.ScoreSystem.ensureGuestIdentity === 'function') {
    const guestId = window.ScoreSystem.ensureGuestIdentity();
    if (guestId) {
      return `guest:${slugifyKey(guestId, 'guest')}`;
    }
  }
  const fallbackGuestId = ensureCalendarGuestId();
  return `guest:${slugifyKey(fallbackGuestId, 'guest')}`;
}

function stripGunMeta(value) {
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(stripGunMeta);
  }
  const result = {};
  Object.entries(value).forEach(([key, current]) => {
    if (key === '_') {
      return;
    }
    result[key] = stripGunMeta(current);
  });
  return result;
}

function normalizeSyncedProviders(value) {
  if (Array.isArray(value)) {
    return value
      .map(item => (typeof item === 'string' ? item.trim() : ''))
      .filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .map(key => (typeof value[key] === 'string' ? value[key].trim() : ''))
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  const cleaned = {};
  Object.entries(metadata).forEach(([key, value]) => {
    if (key === '_' || value === undefined) {
      return;
    }
    if (key === 'syncedProviders') {
      const providers = normalizeSyncedProviders(value);
      if (providers.length) {
        cleaned.syncedProviders = providers;
      }
      return;
    }
    if (value === null) {
      cleaned[key] = null;
      return;
    }
    if (Array.isArray(value)) {
      const normalized = value
        .map(item => (typeof item === 'object' ? sanitizeMetadata(item) : item))
        .filter(item => item !== undefined);
      if (normalized.length) {
        cleaned[key] = normalized;
      }
      return;
    }
    if (typeof value === 'object') {
      const nested = sanitizeMetadata(value);
      if (Object.keys(nested).length) {
        cleaned[key] = nested;
      }
      return;
    }
    cleaned[key] = value;
  });
  return cleaned;
}

function prepareEventForGun(event) {
  if (!event || typeof event !== 'object' || !event.id) {
    return null;
  }
  const metadata = sanitizeMetadata(event.metadata);
  const payload = {
    id: event.id,
    provider: event.provider,
    title: event.title,
    description: event.description,
    start: event.start,
    end: event.end,
    timeZone: event.timeZone,
    link: event.link,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt
  };
  if (Object.keys(metadata).length) {
    payload.metadata = metadata;
  } else {
    payload.metadata = {};
  }
  return payload;
}

function syncEventsToGun(events, previousIds = new Set()) {
  if (!gunEvents) {
    return;
  }
  events.forEach(event => {
    const payload = prepareEventForGun(event);
    if (!payload) {
      return;
    }
    gunEvents.get(payload.id).put(payload);
    previousIds.delete(payload.id);
  });
  previousIds.forEach(id => {
    gunEvents.get(id).put(null);
  });
}

function setupGunSync() {
  if (!gunEvents) {
    console.info('3DVR calendar relay unavailable; continuing with local-only events.');
    return;
  }

  gunEvents.map().on((raw, id) => {
    if (!id) {
      return;
    }
    if (raw == null) {
      if (!state.localEvents.some(event => event.id === id)) {
        return;
      }
      isGunApplying = true;
      deleteLocalEvent(id, { skipGunSync: true, silent: true });
      isGunApplying = false;
      return;
    }
    if (!raw || typeof raw !== 'object') {
      return;
    }
    const sanitized = normalizeStoredEvent({ ...stripGunMeta(raw), id });
    if (!sanitized) {
      return;
    }
    const hasExisting = state.localEvents.some(event => event.id === sanitized.id);
    const nextList = hasExisting
      ? state.localEvents.map(event => (event.id === sanitized.id ? { ...event, ...sanitized } : event))
      : [...state.localEvents, sanitized];
    isGunApplying = true;
    writeLocalEvents(nextList, { skipGunSync: true });
    isGunApplying = false;
  });

  if (state.localEvents.length) {
    syncEventsToGun(state.localEvents);
  }
}

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
  const cleaned = stripGunMeta(raw);
  const provider = cleaned.provider === 'google' || cleaned.provider === 'outlook' ? cleaned.provider : 'local';
  const now = new Date().toISOString();
  const metadata = sanitizeMetadata(cleaned.metadata);
  const base = {
    id:
      typeof cleaned.id === 'string' && cleaned.id.trim()
        ? cleaned.id.trim()
        : generateLocalId(provider),
    provider,
    title:
      typeof cleaned.title === 'string' && cleaned.title.trim()
        ? cleaned.title.trim()
        : 'Untitled event',
    description: typeof cleaned.description === 'string' ? cleaned.description : '',
    start: typeof cleaned.start === 'string' ? cleaned.start : cleaned.start === null ? null : '',
    end: typeof cleaned.end === 'string' ? cleaned.end : cleaned.end === null ? null : '',
    timeZone: typeof cleaned.timeZone === 'string' ? cleaned.timeZone : '',
    link: typeof cleaned.link === 'string' ? cleaned.link : '',
    metadata,
    createdAt: typeof cleaned.createdAt === 'string' ? cleaned.createdAt : now,
    updatedAt: typeof cleaned.updatedAt === 'string' ? cleaned.updatedAt : now
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

function writeLocalEvents(events, options = {}) {
  const { skipGunSync = false } = options;
  const normalized = Array.isArray(events)
    ? events.map(normalizeStoredEvent).filter(Boolean)
    : [];
  const sorted = sortEvents(normalized);
  const previousIds = new Set(state.localEvents.map(event => event.id));
  state.localEvents = sorted;
  try {
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(sorted));
  } catch (err) {
    console.warn('Unable to persist local events', err);
  }
  renderEvents();
  if (gunEvents && !skipGunSync && !isGunApplying) {
    syncEventsToGun(sorted, previousIds);
  }
}

function hydrateLocalEvents() {
  const events = sortEvents(readLocalEvents());
  state.localEvents = events;
  renderEvents();
}

function ensureDefaultTodayEvent() {
  const today = new Date();
  const todayKey = toDateKey(today);
  if (!todayKey) {
    return;
  }
  const alreadySeeded = state.localEvents.some(
    event => event?.metadata?.[AUTO_SEEDED_METADATA_KEY] === todayKey
  );
  if (alreadySeeded) {
    return;
  }
  const hasEventsToday = state.localEvents.some(event => {
    if (!event || typeof event.start !== 'string') {
      return false;
    }
    const date = new Date(event.start);
    if (Number.isNaN(date.getTime())) {
      return false;
    }
    return toDateKey(date) === todayKey;
  });
  if (hasEventsToday) {
    return;
  }
  const { start, end } = computeDefaultEventTimes(todayKey);
  if (
    !(start instanceof Date) ||
    Number.isNaN(start.getTime()) ||
    !(end instanceof Date) ||
    Number.isNaN(end.getTime())
  ) {
    return;
  }
  const timestamp = new Date().toISOString();
  const seededEvent = {
    id: generateLocalId('local'),
    provider: 'local',
    title: 'New event',
    description: '',
    start: start.toISOString(),
    end: end.toISOString(),
    timeZone: DEFAULT_TIME_ZONE || 'UTC',
    link: '',
    metadata: { [AUTO_SEEDED_METADATA_KEY]: todayKey },
    createdAt: timestamp,
    updatedAt: timestamp
  };
  writeLocalEvents([...state.localEvents, seededEvent]);
}

function withTimeZoneLabel(text, timeZone) {
  if (!timeZone || !text || text === '—') {
    return text;
  }
  return `${text} (${timeZone})`;
}

function getWeekdayIndex(day) {
  return (day - calendarState.weekStartsOn + 7) % 7;
}

function formatCalendarTime(value, timeZone) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '';
    }
    const options = { hour: 'numeric', minute: '2-digit' };
    if (timeZone) {
      options.timeZone = timeZone;
    }
    const formatter = new Intl.DateTimeFormat(undefined, options);
    return formatter.format(date);
  } catch (err) {
    console.warn('Unable to format calendar time', value, err);
    return '';
  }
}

function formatCalendarRange(event) {
  if (!event) return '';
  const start = formatCalendarTime(event.start, event.timeZone);
  const end = formatCalendarTime(event.end, event.timeZone);
  if (start && end) {
    return `${start} – ${end}`;
  }
  return start || '';
}

function renderCalendarDayNames() {
  if (!calendarDayNames) return;
  calendarDayNames.innerHTML = '';
  const reference = new Date(Date.UTC(2023, 0, 1));
  for (let index = 0; index < 7; index += 1) {
    const weekday = (calendarState.weekStartsOn + index) % 7;
    const date = new Date(reference);
    date.setUTCDate(reference.getUTCDate() + weekday);
    const cell = document.createElement('div');
    cell.className = 'calendar-view__day-name';
    cell.textContent = calendarWeekdayFormatter.format(date);
    cell.setAttribute('aria-hidden', 'true');
    calendarDayNames.appendChild(cell);
  }
}

function renderCalendar(events = state.localEvents) {
  if (calendarCurrentLabel) {
    calendarCurrentLabel.textContent = calendarMonthFormatter.format(calendarState.viewDate);
  }
  if (!calendarGrid) return;
  const monthStart = startOfMonth(calendarState.viewDate || new Date());
  const gridStart = new Date(monthStart);
  const offset = getWeekdayIndex(monthStart.getDay());
  gridStart.setDate(gridStart.getDate() - offset);
  calendarGrid.innerHTML = '';
  const normalizedEvents = Array.isArray(events) ? events : [];
  const todayKey = startOfDay(new Date()).getTime();
  calendarState.dayEvents = new Map();

  for (let index = 0; index < 42; index += 1) {
    const cellDate = new Date(gridStart);
    cellDate.setDate(gridStart.getDate() + index);
    const cellDayTime = startOfDay(cellDate).getTime();
    const cell = document.createElement('div');
    cell.classList.add('calendar-view__day');
    cell.setAttribute('role', 'button');
    cell.setAttribute('tabindex', '0');
    if (cellDate.getMonth() !== monthStart.getMonth()) {
      cell.classList.add('calendar-view__day--muted');
    }
    if (cellDayTime === todayKey) {
      cell.classList.add('calendar-view__day--today');
      cell.setAttribute('aria-current', 'date');
    }

    const dayNumber = document.createElement('p');
    dayNumber.className = 'calendar-view__date';
    dayNumber.textContent = String(cellDate.getDate());
    cell.appendChild(dayNumber);

    const eventsForDay = normalizedEvents.filter(event => {
      if (!event || typeof event.start !== 'string' || !event.start) {
        return false;
      }
      const eventDate = new Date(event.start);
      if (Number.isNaN(eventDate.getTime())) {
        return false;
      }
      return startOfDay(eventDate).getTime() === cellDayTime;
    });

    if (eventsForDay.length) {
      cell.classList.add('calendar-view__day--has-events');
      const list = document.createElement('ul');
      list.className = 'calendar-view__events';
      eventsForDay.slice(0, 3).forEach(event => {
        const item = document.createElement('li');
        item.className = 'calendar-view__event';
        const timeLabel = formatCalendarTime(event.start, event.timeZone);
        if (timeLabel) {
          const time = document.createElement('span');
          time.className = 'calendar-view__event-time';
          time.textContent = timeLabel;
          item.appendChild(time);
        }
        item.appendChild(document.createTextNode(event.title || 'Untitled event'));
        list.appendChild(item);
      });
      if (eventsForDay.length > 3) {
        const more = document.createElement('li');
        more.className = 'calendar-view__more';
        more.textContent = `+${eventsForDay.length - 3} more`;
        list.appendChild(more);
      }
      cell.appendChild(list);
    }

    const labelParts = [calendarFullDateFormatter.format(cellDate)];
    if (eventsForDay.length === 1) {
      labelParts.push('1 event');
    } else if (eventsForDay.length > 1) {
      labelParts.push(`${eventsForDay.length} events`);
    }
    const dayKey = cellDate.toISOString().slice(0, 10);
    cell.setAttribute('aria-label', labelParts.join(', '));
    cell.dataset.date = dayKey;
    calendarState.dayEvents.set(dayKey, eventsForDay.slice());
    if (calendarState.selectedDate === dayKey) {
      cell.classList.add('calendar-view__day--selected');
      cell.setAttribute('aria-pressed', 'true');
    } else {
      cell.setAttribute('aria-pressed', 'false');
    }
    calendarGrid.appendChild(cell);
  }

  if (calendarState.selectedDate && !calendarState.dayEvents.has(calendarState.selectedDate)) {
    calendarState.selectedDate = null;
  }
  renderSelectedDayDetails();
}

function renderSelectedDayDetails() {
  if (!calendarDetails || !calendarDetailsTitle || !calendarDetailsList || !calendarDetailsEmpty) {
    return;
  }
  const { selectedDate } = calendarState;
  if (calendarDetailsActions) {
    calendarDetailsActions.hidden = true;
  }
  if (!selectedDate || !calendarState.dayEvents.has(selectedDate)) {
    calendarDetails.hidden = true;
    calendarDetailsTitle.textContent = '';
    calendarDetailsList.innerHTML = '';
    calendarDetailsEmpty.hidden = true;
    prefillCreateEventForm(null);
    return;
  }

  const eventsForDay = calendarState.dayEvents.get(selectedDate) || [];
  calendarDetails.hidden = false;
  calendarDetailsList.innerHTML = '';
  if (calendarDetailsActions) {
    calendarDetailsActions.hidden = false;
  }

  const displayDate = new Date(`${selectedDate}T00:00:00`);
  calendarDetailsTitle.textContent = calendarFullDateFormatter.format(displayDate);

  if (!eventsForDay.length) {
    calendarDetailsEmpty.hidden = false;
    prefillCreateEventForm(selectedDate);
    return;
  }

  calendarDetailsEmpty.hidden = true;
  const sortedEvents = [...eventsForDay].sort((a, b) => {
    const aTime = new Date(a.start || '').getTime();
    const bTime = new Date(b.start || '').getTime();
    const aInvalid = Number.isNaN(aTime);
    const bInvalid = Number.isNaN(bTime);
    if (aInvalid && bInvalid) return 0;
    if (aInvalid) return 1;
    if (bInvalid) return -1;
    return aTime - bTime;
  });

  sortedEvents
    .map(event => ({ raw: event, normalized: normalizeEvent(event) }))
    .filter(item => item.normalized)
    .forEach(item => {
      const listItem = document.createElement('li');
      listItem.className = 'calendar-view__details-item';

      const title = document.createElement('p');
      title.className = 'calendar-view__details-item-title';
      title.textContent = item.normalized.title;
      listItem.appendChild(title);

      const metaParts = [];
      const range = formatCalendarRange(item.raw);
      if (range) {
        metaParts.push(range);
      }
      if (item.normalized.providerLabel) {
        metaParts.push(item.normalized.providerLabel);
      }
      if (metaParts.length) {
        const meta = document.createElement('p');
        meta.className = 'calendar-view__details-item-meta';
        meta.textContent = metaParts.join(' • ');
        listItem.appendChild(meta);
      }

      if (item.normalized.description) {
        const description = document.createElement('p');
        description.className = 'calendar-view__details-item-description';
        description.textContent = item.normalized.description;
        listItem.appendChild(description);
      }

      calendarDetailsList.appendChild(listItem);
    });

  prefillCreateEventForm(selectedDate);
}

function selectCalendarDate(dateString) {
  if (!dateString) {
    calendarState.selectedDate = null;
    renderSelectedDayDetails();
    if (!calendarGrid) {
      return;
    }
    calendarGrid.querySelectorAll('.calendar-view__day').forEach(cell => {
      cell.classList.remove('calendar-view__day--selected');
      cell.setAttribute('aria-pressed', 'false');
    });
    return;
  }

  if (calendarState.selectedDate === dateString) {
    renderSelectedDayDetails();
    return;
  }

  calendarState.selectedDate = dateString;
  renderCalendar();
  if (calendarGrid) {
    const nextCell = calendarGrid.querySelector(`.calendar-view__day[data-date="${dateString}"]`);
    if (nextCell && typeof nextCell.focus === 'function') {
      nextCell.focus();
    }
  }
}

function handleCalendarGridClick(event) {
  const cell = event.target.closest('.calendar-view__day');
  if (!cell) return;
  const { date } = cell.dataset;
  if (date) {
    selectCalendarDate(date);
  }
}

function handleCalendarGridKeydown(event) {
  if (event.defaultPrevented) return;
  const cell = event.target.closest('.calendar-view__day');
  if (!cell) return;
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    const { date } = cell.dataset;
    if (date) {
      selectCalendarDate(date);
    }
  }
}

function handleAddEventForSelectedDay() {
  const targetDate = calendarState.selectedDate || toDateKey(new Date());
  resetCreateEventFormDirty();
  prefillCreateEventForm(targetDate, { force: true });
  setCreateEventExpanded(true);
}

function renderEvents(events = state.localEvents) {
  renderCalendar(events);
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

function toLocalDateTimeInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = value => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function computeDefaultEventTimes(dateString) {
  const now = new Date();
  const todayKey = toDateKey(now);
  const targetKey = typeof dateString === 'string' && dateString ? dateString : todayKey;

  const buildTargetDate = (key, hours, minutes) => {
    const base = new Date(`${key}T00:00:00`);
    if (Number.isNaN(base.getTime())) {
      return null;
    }
    base.setHours(hours, minutes, 0, 0);
    return base;
  };

  let start;

  if (targetKey === todayKey) {
    start = new Date(now);
    start.setMinutes(start.getMinutes() + DEFAULT_EVENT_START_OFFSET_MINUTES);
    if (Number.isNaN(start.getTime()) || toDateKey(start) !== targetKey) {
      start = buildTargetDate(targetKey, 9, 0) || new Date(now);
    }
  } else {
    start = buildTargetDate(targetKey, 9, 0) || new Date(now);
  }

  if (Number.isNaN(start.getTime())) {
    start = new Date(now);
  }

  start.setSeconds(0, 0);

  const end = new Date(start);
  end.setMinutes(end.getMinutes() + DEFAULT_EVENT_DURATION_MINUTES);

  return { start, end };
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

function updateLocalEvent(eventId, patch, options = {}) {
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
  writeLocalEvents(list, options);
}

function deleteLocalEvent(id, options = {}) {
  if (!id) return;
  const remaining = state.localEvents.filter(event => event.id !== id);
  if (remaining.length === state.localEvents.length) {
    return;
  }
  writeLocalEvents(remaining, options);
  if (!options.silent) {
    showLog('Event removed from your local calendar.', 'info');
  }
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
  if (messageType !== 'error') {
    setCreateEventExpanded(false, { focusToggle: true });
  }
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

function resetCreateEventFormDirty() {
  if (!createEventForm) return;
  createEventForm.dataset.dirty = 'false';
}

function markCreateEventFormDirty() {
  if (!createEventForm) return;
  createEventForm.dataset.dirty = 'true';
}

function prefillCreateEventForm(dateString, options = {}) {
  if (!createEventForm) return;
  const { force = false } = options;
  if (!force && createEventForm.dataset.dirty === 'true') {
    return;
  }
  if (force) {
    createEventForm.dataset.dirty = 'false';
  }
  const { start, end } = computeDefaultEventTimes(dateString);
  const startField = createEventForm.elements.namedItem('start');
  if (startField instanceof HTMLInputElement) {
    startField.value = toLocalDateTimeInputValue(start);
  }
  const endField = createEventForm.elements.namedItem('end');
  if (endField instanceof HTMLInputElement) {
    endField.value = toLocalDateTimeInputValue(end);
  }
  const timeZoneField = createEventForm.elements.namedItem('timeZone');
  if (timeZoneField instanceof HTMLInputElement) {
    timeZoneField.value = timeZoneField.value || DEFAULT_TIME_ZONE || 'UTC';
  }
}

function hydrateCreateFormDefaults() {
  if (!createEventForm) return;
  resetCreateEventFormDirty();
  prefillCreateEventForm(calendarState.selectedDate, { force: true });
}

function updateCreateEventToggleLabel(expanded) {
  if (!createEventToggle) return;
  const openLabel = createEventToggle.dataset.labelOpen || 'Add event';
  const closeLabel = createEventToggle.dataset.labelClose || 'Hide event form';
  createEventToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  createEventToggle.textContent = expanded ? closeLabel : openLabel;
}

function setCreateEventExpanded(expanded, options = {}) {
  if (!createEventContainer || !createEventToggle) return;
  createEventContainer.hidden = !expanded;
  updateCreateEventToggleLabel(expanded);
  if (expanded) {
    prefillCreateEventForm(calendarState.selectedDate);
    if (createEventForm) {
      const firstField = createEventForm.elements.namedItem('title');
      if (firstField instanceof HTMLElement) {
        requestAnimationFrame(() => {
          firstField.focus();
        });
      }
    }
  } else if (options.focusToggle && typeof createEventToggle.focus === 'function') {
    createEventToggle.focus();
  }
}

function toggleCreateEventForm() {
  if (!createEventToggle) return;
  const expanded = createEventToggle.getAttribute('aria-expanded') === 'true';
  setCreateEventExpanded(!expanded, { focusToggle: expanded });
}

function initializeCreateEventToggle() {
  if (createEventContainer) {
    createEventContainer.hidden = true;
  }
  updateCreateEventToggleLabel(false);
}

function changeCalendarMonth(offset) {
  const next = new Date(calendarState.viewDate);
  next.setMonth(next.getMonth() + offset);
  calendarState.viewDate = startOfMonth(next);
  calendarState.selectedDate = calendarState.viewDate.toISOString().slice(0, 10);
  renderCalendar();
}

function goToCalendarToday() {
  const now = startOfDay(new Date());
  calendarState.viewDate = startOfMonth(now);
  calendarState.selectedDate = now.toISOString().slice(0, 10);
  renderCalendar();
}

function initializeCalendarView() {
  renderCalendarDayNames();
  renderCalendar();
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
    createEventForm.addEventListener('input', markCreateEventFormDirty);
  }

  if (createEventToggle) {
    createEventToggle.addEventListener('click', toggleCreateEventForm);
  }

  if (eventList) {
    eventList.addEventListener('click', handleEventListClick);
  }

  calendarNavButtons.forEach(button => {
    button.addEventListener('click', () => {
      const direction = button.dataset.calendarNav === 'next' ? 1 : -1;
      changeCalendarMonth(direction);
    });
  });

  if (calendarTodayButton) {
    calendarTodayButton.addEventListener('click', goToCalendarToday);
  }

  if (calendarGrid) {
    calendarGrid.addEventListener('click', handleCalendarGridClick);
    calendarGrid.addEventListener('keydown', handleCalendarGridKeydown);
  }

  if (addEventForDayButton) {
    addEventForDayButton.addEventListener('click', handleAddEventForSelectedDay);
  }
}

initializeCalendarView();
hydrateState();
hydrateLocalEvents();
ensureDefaultTodayEvent();
initializeCreateEventToggle();
hydrateCreateFormDefaults();
bindEvents();
setupGunSync();
const readyMessage = gunEvents
  ? 'Ready to manage your calendar. Local events sync through the 3DVR relay and can connect to Google or Outlook when needed.'
  : 'Ready to manage your local calendar. Connect Google or Outlook to sync when needed.';
showLog(readyMessage);
