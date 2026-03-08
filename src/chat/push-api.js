import Gun from 'gun';
import webPush from 'web-push';
import {
  CHAT_ROOMS,
  DEFAULT_GUN_PEERS,
  buildPushPayload,
  createGunPushStore,
  createPushConfig,
  normalizeMessageId,
  normalizeRoomName
} from './push.js';

let sharedStorePromise = null;

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function createServerGun({ GunFactory = Gun, peers = DEFAULT_GUN_PEERS } = {}) {
  return GunFactory({
    peers,
    axe: false,
    multicast: false,
    radisk: false,
    localStorage: false,
    file: false
  });
}

export function createDefaultGunPushStore({ peers = DEFAULT_GUN_PEERS } = {}) {
  if (!sharedStorePromise) {
    const gun = createServerGun({ peers });
    sharedStorePromise = Promise.resolve(createGunPushStore({ gun }));
  }
  return sharedStorePromise;
}

function normalizeRooms(rooms) {
  if (!Array.isArray(rooms) || !rooms.length) {
    return CHAT_ROOMS.slice();
  }

  return Array.from(
    new Set(
      rooms
        .map((room) => normalizeRoomName(room, ''))
        .filter(Boolean)
    )
  );
}

function configureWebPush(webPushLib, pushConfig) {
  webPushLib.setVapidDetails(
    pushConfig.subject,
    pushConfig.publicKey,
    pushConfig.privateKey
  );
}

function buildPushTopic(room, messageId) {
  const raw = `chat-${normalizeRoomName(room)}-${normalizeMessageId(messageId)}`.replace(/[^a-z0-9-]/gi, '-');
  return raw.slice(0, 32) || 'chat';
}

export function createChatPushConfigHandler({
  config = process.env
} = {}) {
  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const pushConfig = createPushConfig(config);
    return res.status(200).json({
      enabled: pushConfig.enabled,
      publicKey: pushConfig.enabled ? pushConfig.publicKey : '',
      rooms: CHAT_ROOMS
    });
  };
}

export function createChatPushSubscriptionHandler({
  config = process.env,
  getStore = createDefaultGunPushStore
} = {}) {
  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const pushConfig = createPushConfig(config);

    if (req.method === 'POST') {
      if (!pushConfig.enabled) {
        return res.status(503).json({ error: 'Push notifications are not configured.' });
      }

      try {
        const store = await getStore();
        const body = req.body || {};
        const record = await store.upsertSubscription({
          subscription: body.subscription,
          userId: typeof body.userId === 'string' ? body.userId.trim() : '',
          username: typeof body.username === 'string' ? body.username.trim() : '',
          rooms: normalizeRooms(body.rooms),
          scope: typeof body.scope === 'string' ? body.scope.trim() : '/chat/'
        });

        return res.status(200).json({
          ok: true,
          id: record.id,
          active: true
        });
      } catch (error) {
        return res.status(400).json({
          error: error?.message || 'Unable to save push subscription.'
        });
      }
    }

    if (req.method === 'DELETE') {
      try {
        const store = await getStore();
        const body = req.body || {};
        const endpoint = typeof body.endpoint === 'string'
          ? body.endpoint
          : String(body.subscription?.endpoint || '');
        const result = await store.deactivateSubscription({
          endpoint,
          subscriptionId: typeof body.subscriptionId === 'string' ? body.subscriptionId.trim() : '',
          reason: 'client-unsubscribed'
        });

        return res.status(200).json({
          ok: true,
          active: false,
          id: result.id
        });
      } catch (error) {
        return res.status(400).json({
          error: error?.message || 'Unable to remove push subscription.'
        });
      }
    }

    return res.status(405).json({ error: 'Method Not Allowed' });
  };
}

export function createChatPushNotifyHandler({
  config = process.env,
  getStore = createDefaultGunPushStore,
  webPushLib = webPush
} = {}) {
  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const pushConfig = createPushConfig(config);
    if (!pushConfig.enabled) {
      return res.status(503).json({ error: 'Push notifications are not configured.' });
    }

    const room = normalizeRoomName(req.body?.room);
    const messageId = normalizeMessageId(req.body?.messageId);

    if (!messageId) {
      return res.status(400).json({ error: 'A room and messageId are required.' });
    }

    try {
      const store = await getStore();
      const existingDelivery = await store.getDeliveryRecord(room, messageId);
      if (existingDelivery?.sentAt) {
        return res.status(200).json({
          ok: true,
          alreadySent: true,
          deliveredCount: Number(existingDelivery.deliveredCount) || 0,
          failedCount: Number(existingDelivery.failedCount) || 0
        });
      }

      const message = await store.getChatMessage(room, messageId);
      if (!message) {
        return res.status(404).json({ error: 'Chat message not found for notification delivery.' });
      }

      const subscriptions = await store.listActiveSubscriptions();
      const targets = subscriptions.filter((record) => {
        const rooms = Array.isArray(record.rooms) && record.rooms.length
          ? record.rooms.map((entry) => normalizeRoomName(entry, ''))
          : CHAT_ROOMS;
        return rooms.includes(room) && record.userId !== message.sender;
      });

      configureWebPush(webPushLib, pushConfig);
      const payload = buildPushPayload(message);

      let deliveredCount = 0;
      let failedCount = 0;

      await Promise.all(targets.map(async (record) => {
        try {
          await webPushLib.sendNotification(
            record.subscription,
            JSON.stringify(payload),
            {
              TTL: 60,
              urgency: 'high',
              topic: buildPushTopic(room, messageId)
            }
          );
          deliveredCount += 1;
          await store.markDeliverySuccess(record.id);
        } catch (error) {
          failedCount += 1;
          const statusCode = Number(error?.statusCode || 0);
          if (statusCode === 404 || statusCode === 410) {
            await store.deactivateSubscription({
              subscriptionId: record.id,
              reason: error?.body || error?.message || 'Push subscription expired',
              statusCode
            });
          }
        }
      }));

      await store.markMessageDelivered(room, messageId, {
        deliveredCount,
        failedCount
      });

      return res.status(200).json({
        ok: true,
        alreadySent: false,
        deliveredCount,
        failedCount
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Unable to send push notifications.'
      });
    }
  };
}

export function createChatPushHandler(options = {}) {
  const configHandler = createChatPushConfigHandler(options);
  const subscriptionHandler = createChatPushSubscriptionHandler(options);
  const notifyHandler = createChatPushNotifyHandler(options);

  return async function handler(req, res) {
    const action = typeof req.query?.action === 'string' ? req.query.action.trim().toLowerCase() : '';

    if (req.method === 'GET') {
      return configHandler(req, res);
    }

    if (req.method === 'POST' && action === 'notify') {
      return notifyHandler(req, res);
    }

    return subscriptionHandler(req, res);
  };
}
