export const FREE_PAGE_ANALYTICS_PATH = Object.freeze([
  '3dvr-portal',
  'analytics',
  'free-page',
  'v1',
  'events'
]);

export const FREE_PAGE_ANALYTICS_EVENT_TYPES = Object.freeze([
  'page_view',
  'generate_lead'
]);

const FREE_PAGE_PATH = '/free-page/';

function safeRandomId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function cleanId(value = '') {
  return String(value).trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

export function utcDay(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().slice(0, 10);
}

export function createAnalyticsSessionId() {
  return `session-${cleanId(safeRandomId())}`;
}

export function createFreePageAnalyticsEvent(eventType, options = {}) {
  if (!FREE_PAGE_ANALYTICS_EVENT_TYPES.includes(eventType)) {
    throw new Error(`Unsupported Free Page analytics event: ${eventType}`);
  }

  const timestamp = (options.now instanceof Date ? options.now : new Date(options.now || Date.now())).toISOString();
  const id = cleanId(options.id || `${Date.now().toString(36)}-${safeRandomId()}`);
  const sessionId = cleanId(options.sessionId);

  if (!id || !sessionId) {
    throw new Error('Free Page analytics events require event and session IDs.');
  }

  return {
    id,
    eventType,
    page: FREE_PAGE_PATH,
    sessionId,
    timestamp,
    day: utcDay(timestamp),
    source: 'first-party-gun'
  };
}

export function getGunNode(root, path = []) {
  return path.reduce(
    (node, key) => (node && typeof node.get === 'function' ? node.get(String(key)) : null),
    root
  );
}

export function writeFreePageAnalyticsEvent(gun, event, options = {}) {
  const timeoutMs = Number.parseInt(options.timeoutMs, 10) || 2000;
  const dayNode = getGunNode(gun, [...FREE_PAGE_ANALYTICS_PATH, event.day]);
  const eventNode = dayNode?.get(event.id);

  return new Promise((resolve, reject) => {
    if (!eventNode || typeof eventNode.put !== 'function') {
      reject(new Error('Gun analytics node is unavailable.'));
      return;
    }

    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => finish(reject, new Error('Gun analytics write timed out.')), timeoutMs);

    eventNode.put(event, ack => {
      if (ack?.err) {
        finish(reject, new Error(String(ack.err)));
        return;
      }
      finish(resolve, ack || {});
    });
  });
}

export function createFreePageAnalyticsClient(options = {}) {
  const GunImpl = options.GunImpl || globalThis.Gun;
  if (typeof GunImpl !== 'function') {
    return null;
  }

  const peers = Array.isArray(options.peers)
    ? options.peers
    : (Array.isArray(globalThis.__GUN_PEERS__) ? globalThis.__GUN_PEERS__ : []);
  const gun = options.gun || GunImpl({
    peers,
    axe: false,
    localStorage: false,
    radisk: false
  });

  return {
    track(eventType, eventOptions = {}) {
      const event = createFreePageAnalyticsEvent(eventType, eventOptions);
      return writeFreePageAnalyticsEvent(gun, event, options);
    }
  };
}

export function normalizeFreePageAnalyticsEvent(data = {}, id = '') {
  const eventType = String(data.eventType || '').trim();
  const page = String(data.page || '').trim();
  const sessionId = cleanId(data.sessionId);
  const timestamp = String(data.timestamp || '').trim();
  const normalizedId = cleanId(id || data.id);

  if (
    !normalizedId
    || !sessionId
    || !FREE_PAGE_ANALYTICS_EVENT_TYPES.includes(eventType)
    || page !== FREE_PAGE_PATH
    || Number.isNaN(Date.parse(timestamp))
  ) {
    return null;
  }

  return {
    id: normalizedId,
    eventType,
    page,
    sessionId,
    timestamp,
    day: utcDay(timestamp),
    source: String(data.source || '').trim()
  };
}

export function summarizeFreePageAnalytics(events = [], options = {}) {
  const startAt = Date.parse(options.startAt || 0);
  const endAt = Date.parse(options.endAt || '9999-12-31T23:59:59.999Z');
  const uniqueEvents = new Map();

  events.forEach(rawEvent => {
    const event = normalizeFreePageAnalyticsEvent(rawEvent, rawEvent?.id);
    const timestamp = Date.parse(event?.timestamp || '');
    if (!event || timestamp < startAt || timestamp > endAt) return;
    uniqueEvents.set(event.id, event);
  });

  const values = [...uniqueEvents.values()];
  const pageViews = values.filter(event => event.eventType === 'page_view');
  const leads = values.filter(event => event.eventType === 'generate_lead');
  const sessions = new Set(pageViews.map(event => event.sessionId));

  return {
    sessions: sessions.size,
    pageViews: pageViews.length,
    leads: leads.length,
    eventCount: values.length
  };
}
