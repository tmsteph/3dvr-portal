import { createHash } from 'node:crypto';

export const CHAT_ROOMS = ['general', 'ideas', 'support', 'random'];
export const CHAT_PUSH_ROOT = ['3dvr-portal', 'chat', 'pushSubscriptions'];
export const CHAT_PUSH_DELIVERY_ROOT = ['3dvr-portal', 'chat', 'pushDeliveries'];
export const CHAT_MESSAGE_ROOT = ['3dvr-chat'];
export const DEFAULT_GUN_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];
export const DEFAULT_PUSH_ICON = '/icons/icon-192.png';
export const DEFAULT_PUSH_SUBJECT = 'mailto:support@3dvr.tech';

function sanitizeForGun(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value.map((entry) => {
      const sanitized = sanitizeForGun(entry);
      return sanitized === undefined ? null : sanitized;
    });
  }
  if (typeof value === 'object') {
    const result = {};
    for (const [key, entry] of Object.entries(value)) {
      const sanitized = sanitizeForGun(entry);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }
    return result;
  }
  if (typeof value === 'function') return undefined;
  return value;
}

export function normalizeRoomName(room, fallbackRoom = CHAT_ROOMS[0]) {
  const normalized = typeof room === 'string' ? room.trim().toLowerCase() : '';
  return CHAT_ROOMS.includes(normalized) ? normalized : fallbackRoom;
}

export function normalizeMessageId(messageId) {
  return typeof messageId === 'string' ? messageId.trim() : '';
}

export function normalizeTextPreview(text, limit = 160) {
  const normalized = typeof text === 'string' ? text.trim() : String(text || '').trim();
  if (!normalized) return 'New message';
  return normalized.length > limit ? `${normalized.slice(0, limit - 3)}...` : normalized;
}

export function buildChatNotificationUrl({ room, messageId } = {}) {
  const params = new URLSearchParams();
  params.set('room', normalizeRoomName(room));
  const normalizedMessageId = normalizeMessageId(messageId);
  if (normalizedMessageId) {
    params.set('message', normalizedMessageId);
  }
  return `/chat/#${params.toString()}`;
}

export function buildPushPayload(message = {}) {
  const room = normalizeRoomName(message.room);
  const messageId = normalizeMessageId(message.messageId);
  const username = typeof message.username === 'string' && message.username.trim()
    ? message.username.trim()
    : 'Someone';
  const body = normalizeTextPreview(message.text);

  return sanitizeForGun({
    title: `${username} in #${room}`,
    options: {
      body,
      tag: messageId ? `${room}-${messageId}` : `chat-${room}`,
      icon: DEFAULT_PUSH_ICON,
      badge: DEFAULT_PUSH_ICON,
      data: {
        room,
        messageId,
        url: buildChatNotificationUrl({ room, messageId })
      }
    }
  });
}

export function normalizePushSubscription(subscription) {
  if (!subscription || typeof subscription !== 'object') {
    return null;
  }

  const endpoint = typeof subscription.endpoint === 'string' ? subscription.endpoint.trim() : '';
  const auth = typeof subscription.keys?.auth === 'string' ? subscription.keys.auth.trim() : '';
  const p256dh = typeof subscription.keys?.p256dh === 'string' ? subscription.keys.p256dh.trim() : '';

  if (!endpoint || !auth || !p256dh) {
    return null;
  }

  const expirationTime = subscription.expirationTime == null
    ? null
    : Number(subscription.expirationTime);

  return sanitizeForGun({
    endpoint,
    expirationTime: Number.isFinite(expirationTime) ? expirationTime : null,
    keys: {
      auth,
      p256dh
    }
  });
}

export function createSubscriptionId(endpoint) {
  const normalizedEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';
  if (!normalizedEndpoint) return '';
  return createHash('sha256').update(normalizedEndpoint).digest('hex');
}

export function createPushConfig(config = process.env) {
  const publicKey = String(config.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
  const privateKey = String(config.WEB_PUSH_VAPID_PRIVATE_KEY || '').trim();
  const subject = String(config.WEB_PUSH_VAPID_SUBJECT || DEFAULT_PUSH_SUBJECT).trim() || DEFAULT_PUSH_SUBJECT;
  const enabled = Boolean(publicKey && privateKey && subject);

  return {
    enabled,
    publicKey,
    privateKey,
    subject
  };
}

function resolveNode(root, path = []) {
  return path.reduce((node, key) => node.get(String(key)), root);
}

function putNodeValue(node, value, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Gun write timed out.'));
    }, timeoutMs);

    node.put(value, (ack) => {
      clearTimeout(timer);
      if (ack?.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      resolve(ack || { ok: true });
    });
  });
}

function onceNodeValue(node, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Gun read timed out.'));
    }, timeoutMs);

    node.once((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function collectNodeMapEntries(node, { quietMs = 120, timeoutMs = 1200 } = {}) {
  return new Promise((resolve) => {
    const records = [];
    let resolved = false;
    let quietTimer = null;
    let hardTimer = null;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (quietTimer) {
        clearTimeout(quietTimer);
      }
      if (hardTimer) {
        clearTimeout(hardTimer);
      }
      resolve(records);
    };

    const scheduleFinish = () => {
      if (quietTimer) {
        clearTimeout(quietTimer);
      }
      quietTimer = setTimeout(finish, quietMs);
    };

    scheduleFinish();
    hardTimer = setTimeout(finish, timeoutMs);

    node.map().once((value, key) => {
      if (!value || key === '_') {
        scheduleFinish();
        return;
      }
      records.push({ key, value });
      scheduleFinish();
    });
  });
}

async function readValueWithRetry(node, { attempts = 4, waitMs = 160, timeoutMs = 2000, sleep = defaultSleep } = {}) {
  let lastValue;

  for (let index = 0; index < attempts; index += 1) {
    try {
      lastValue = await onceNodeValue(node, timeoutMs);
    } catch (error) {
      if (index === attempts - 1) {
        throw error;
      }
    }

    if (lastValue) {
      return lastValue;
    }

    if (index < attempts - 1) {
      await sleep(waitMs);
    }
  }

  return lastValue;
}

function defaultSleep(waitMs) {
  return new Promise((resolve) => setTimeout(resolve, waitMs));
}

export function createGunPushStore({
  gun,
  now = () => Date.now(),
  quietMs = 120,
  timeoutMs = 4000,
  sleep = defaultSleep
} = {}) {
  if (!gun || typeof gun.get !== 'function') {
    throw new Error('A Gun instance is required.');
  }

  const subscriptionsRoot = resolveNode(gun, CHAT_PUSH_ROOT);
  const deliveriesRoot = resolveNode(gun, CHAT_PUSH_DELIVERY_ROOT);

  async function upsertSubscription({
    subscription,
    userId = '',
    username = '',
    rooms = CHAT_ROOMS,
    scope = '/chat/'
  } = {}) {
    const normalizedSubscription = normalizePushSubscription(subscription);
    if (!normalizedSubscription) {
      throw new Error('A valid push subscription is required.');
    }

    const id = createSubscriptionId(normalizedSubscription.endpoint);
    const timestamp = now();
    const existing = await onceNodeValue(subscriptionsRoot.get(id), timeoutMs).catch(() => null);
    const record = sanitizeForGun({
      id,
      active: true,
      endpoint: normalizedSubscription.endpoint,
      subscription: normalizedSubscription,
      userId: typeof userId === 'string' ? userId.trim() : '',
      username: typeof username === 'string' ? username.trim() : '',
      rooms: Array.isArray(rooms) ? rooms.map((room) => normalizeRoomName(room)).filter(Boolean) : CHAT_ROOMS,
      scope: typeof scope === 'string' ? scope.trim() : '/chat/',
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp,
      deactivatedAt: null,
      failureReason: '',
      failureStatus: 0,
      lastDeliveredAt: existing?.lastDeliveredAt || 0
    });

    await putNodeValue(subscriptionsRoot.get(id), record, timeoutMs);
    return record;
  }

  async function deactivateSubscription({
    endpoint = '',
    subscriptionId = '',
    reason = 'unsubscribed',
    statusCode = 0
  } = {}) {
    const resolvedId = subscriptionId || createSubscriptionId(endpoint);
    if (!resolvedId) {
      return { updated: false, id: '' };
    }

    const existing = await onceNodeValue(subscriptionsRoot.get(resolvedId), timeoutMs).catch(() => null);
    if (!existing || typeof existing !== 'object') {
      return { updated: false, id: resolvedId };
    }

    const next = sanitizeForGun({
      ...existing,
      active: false,
      updatedAt: now(),
      deactivatedAt: now(),
      failureReason: typeof reason === 'string' ? reason : 'unsubscribed',
      failureStatus: Number.isFinite(Number(statusCode)) ? Number(statusCode) : 0
    });

    await putNodeValue(subscriptionsRoot.get(resolvedId), next, timeoutMs);
    return { updated: true, id: resolvedId };
  }

  async function listActiveSubscriptions() {
    const entries = await collectNodeMapEntries(subscriptionsRoot, { quietMs, timeoutMs });
    return entries
      .map((entry) => entry.value)
      .filter((record) => record && typeof record === 'object')
      .filter((record) => record.active !== false)
      .filter((record) => normalizePushSubscription(record.subscription));
  }

  async function getChatMessage(room, messageId) {
    const normalizedRoom = normalizeRoomName(room);
    const normalizedMessageId = normalizeMessageId(messageId);
    if (!normalizedMessageId) return null;

    const messageNode = resolveNode(gun, [...CHAT_MESSAGE_ROOT, normalizedRoom, normalizedMessageId]);
    const message = await readValueWithRetry(messageNode, {
      attempts: 5,
      waitMs: 180,
      timeoutMs: Math.min(timeoutMs, 2500),
      sleep
    }).catch(() => null);

    if (!message || typeof message !== 'object') {
      return null;
    }

    return sanitizeForGun({
      room: normalizedRoom,
      messageId: normalizedMessageId,
      text: message.text,
      sender: message.sender,
      username: message.username,
      createdAt: message.createdAt
    });
  }

  async function getDeliveryRecord(room, messageId) {
    const normalizedRoom = normalizeRoomName(room);
    const normalizedMessageId = normalizeMessageId(messageId);
    if (!normalizedMessageId) return null;
    return onceNodeValue(
      resolveNode(deliveriesRoot, [normalizedRoom, normalizedMessageId]),
      timeoutMs
    ).catch(() => null);
  }

  async function markMessageDelivered(room, messageId, delivery = {}) {
    const normalizedRoom = normalizeRoomName(room);
    const normalizedMessageId = normalizeMessageId(messageId);
    if (!normalizedMessageId) {
      throw new Error('A messageId is required.');
    }

    const record = sanitizeForGun({
      room: normalizedRoom,
      messageId: normalizedMessageId,
      sentAt: now(),
      deliveredCount: Number.isFinite(Number(delivery.deliveredCount))
        ? Number(delivery.deliveredCount)
        : 0,
      failedCount: Number.isFinite(Number(delivery.failedCount))
        ? Number(delivery.failedCount)
        : 0
    });

    await putNodeValue(
      resolveNode(deliveriesRoot, [normalizedRoom, normalizedMessageId]),
      record,
      timeoutMs
    );

    return record;
  }

  async function markDeliverySuccess(subscriptionId) {
    const normalizedId = typeof subscriptionId === 'string' ? subscriptionId.trim() : '';
    if (!normalizedId) return;
    const existing = await onceNodeValue(subscriptionsRoot.get(normalizedId), timeoutMs).catch(() => null);
    if (!existing || typeof existing !== 'object') return;
    await putNodeValue(subscriptionsRoot.get(normalizedId), sanitizeForGun({
      ...existing,
      active: true,
      updatedAt: now(),
      lastDeliveredAt: now(),
      failureReason: '',
      failureStatus: 0
    }), timeoutMs);
  }

  return {
    upsertSubscription,
    deactivateSubscription,
    listActiveSubscriptions,
    getChatMessage,
    getDeliveryRecord,
    markMessageDelivered,
    markDeliverySuccess
  };
}
