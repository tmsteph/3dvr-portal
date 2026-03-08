import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChatNotificationUrl,
  buildPushPayload,
  createGunPushStore,
  createPushConfig
} from '../src/chat/push.js';
import {
  createChatPushConfigHandler,
  createChatPushNotifyHandler,
  createChatPushSubscriptionHandler
} from '../src/chat/push-api.js';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function createTrackingGun() {
  const store = new Map();
  const writes = [];

  function readSnapshot(path = []) {
    const key = path.join('/');
    if (store.has(key)) {
      return clone(store.get(key));
    }

    const prefix = key ? `${key}/` : '';
    const snapshot = {};
    let found = false;

    for (const [storedPath, value] of store.entries()) {
      if (!storedPath.startsWith(prefix)) continue;
      const remainder = storedPath.slice(prefix.length);
      if (!remainder || remainder.includes('/')) continue;
      snapshot[remainder] = clone(value);
      found = true;
    }

    return found ? snapshot : undefined;
  }

  function directChildren(path = []) {
    const key = path.join('/');
    const prefix = key ? `${key}/` : '';
    const children = [];

    for (const [storedPath, value] of store.entries()) {
      if (!storedPath.startsWith(prefix)) continue;
      const remainder = storedPath.slice(prefix.length);
      if (!remainder || remainder.includes('/')) continue;
      children.push([remainder, clone(value)]);
    }

    return children;
  }

  function node(path = []) {
    const key = path.join('/');

    return {
      get(next) {
        return node([...path, String(next)]);
      },
      put(value, callback) {
        const normalized = clone(value);
        writes.push({ path: [...path], value: normalized });
        store.set(key, normalized);
        callback?.({ ok: true });
        return this;
      },
      once(callback) {
        callback?.(readSnapshot(path));
        return this;
      },
      map() {
        return {
          once(callback) {
            directChildren(path).forEach(([childKey, value]) => callback?.(value, childKey));
            return this;
          }
        };
      }
    };
  }

  return {
    gun: {
      get(next) {
        return node([String(next)]);
      }
    },
    store,
    writes
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end(payload) {
      this.ended = true;
      if (payload !== undefined) {
        this.body = payload;
      }
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
    }
  };
}

const pushEnv = {
  WEB_PUSH_VAPID_PUBLIC_KEY: 'public-key',
  WEB_PUSH_VAPID_PRIVATE_KEY: 'private-key',
  WEB_PUSH_VAPID_SUBJECT: 'mailto:test@3dvr.tech'
};

const sampleSubscription = {
  endpoint: 'https://example.com/push/abc',
  expirationTime: null,
  keys: {
    auth: 'auth-token',
    p256dh: 'p256dh-token'
  }
};

describe('chat push helpers', () => {
  it('builds canonical chat notification URLs and payloads', () => {
    assert.equal(
      buildChatNotificationUrl({ room: 'support', messageId: 'msg-1' }),
      '/chat/#room=support&message=msg-1'
    );

    const payload = buildPushPayload({
      room: 'support',
      messageId: 'msg-1',
      username: 'Pilot',
      text: 'Need help with notifications'
    });

    assert.equal(payload.title, 'Pilot in #support');
    assert.equal(payload.options.body, 'Need help with notifications');
    assert.equal(payload.options.data.url, '/chat/#room=support&message=msg-1');
  });

  it('creates enabled push config only when vapid keys exist', () => {
    const enabled = createPushConfig(pushEnv);
    const disabled = createPushConfig({});

    assert.equal(enabled.enabled, true);
    assert.equal(enabled.publicKey, 'public-key');
    assert.equal(disabled.enabled, false);
  });

  it('stores, lists, and deactivates Gun-backed push subscriptions', async () => {
    const tracker = createTrackingGun();
    const store = createGunPushStore({
      gun: tracker.gun,
      quietMs: 0,
      timeoutMs: 50,
      sleep: async () => {}
    });

    const saved = await store.upsertSubscription({
      subscription: sampleSubscription,
      userId: 'user_1',
      username: 'Pilot',
      rooms: ['general', 'support']
    });

    const listed = await store.listActiveSubscriptions();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, saved.id);
    assert.equal(listed[0].userId, 'user_1');

    const removed = await store.deactivateSubscription({
      subscriptionId: saved.id,
      reason: 'test'
    });

    assert.equal(removed.updated, true);
    const after = await store.listActiveSubscriptions();
    assert.equal(after.length, 0);
  });
});

describe('chat push API handlers', () => {
  it('returns public push config', async () => {
    const handler = createChatPushConfigHandler({ config: pushEnv });
    const res = createMockRes();

    await handler({ method: 'GET' }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      enabled: true,
      publicKey: 'public-key',
      rooms: ['general', 'ideas', 'support', 'random']
    });
  });

  it('registers and unregisters subscriptions through the API', async () => {
    const tracker = createTrackingGun();
    const store = createGunPushStore({
      gun: tracker.gun,
      quietMs: 0,
      timeoutMs: 50,
      sleep: async () => {}
    });
    const getStore = async () => store;
    const handler = createChatPushSubscriptionHandler({
      config: pushEnv,
      getStore
    });

    const saveRes = createMockRes();
    await handler({
      method: 'POST',
      body: {
        subscription: sampleSubscription,
        userId: 'user_2',
        username: 'Builder',
        rooms: ['general']
      }
    }, saveRes);

    assert.equal(saveRes.statusCode, 200);
    assert.equal(saveRes.body.ok, true);

    const deleteRes = createMockRes();
    await handler({
      method: 'DELETE',
      body: {
        subscriptionId: saveRes.body.id
      }
    }, deleteRes);

    assert.equal(deleteRes.statusCode, 200);
    assert.equal(deleteRes.body.active, false);
  });

  it('fans out push notifications to other subscribers and prunes expired ones', async () => {
    const tracker = createTrackingGun();
    tracker.store.set('3dvr-chat/general/msg-1', {
      text: 'Server-side push is live',
      sender: 'user_sender',
      username: 'Sender',
      createdAt: 123
    });

    const store = createGunPushStore({
      gun: tracker.gun,
      quietMs: 0,
      timeoutMs: 50,
      sleep: async () => {}
    });

    await store.upsertSubscription({
      subscription: {
        ...sampleSubscription,
        endpoint: 'https://example.com/push/alive'
      },
      userId: 'user_receiver',
      username: 'Receiver',
      rooms: ['general']
    });

    await store.upsertSubscription({
      subscription: {
        ...sampleSubscription,
        endpoint: 'https://example.com/push/dead'
      },
      userId: 'user_dead',
      username: 'Dead',
      rooms: ['general']
    });

    await store.upsertSubscription({
      subscription: {
        ...sampleSubscription,
        endpoint: 'https://example.com/push/self'
      },
      userId: 'user_sender',
      username: 'Sender',
      rooms: ['general']
    });

    const webPushLib = {
      setVapidDetails: mock.fn(() => {}),
      sendNotification: mock.fn(async (subscription) => {
        if (subscription.endpoint.includes('/dead')) {
          const error = new Error('Gone');
          error.statusCode = 410;
          error.body = 'Expired';
          throw error;
        }
        return { statusCode: 201 };
      })
    };

    const handler = createChatPushNotifyHandler({
      config: pushEnv,
      getStore: async () => store,
      webPushLib
    });

    const res = createMockRes();
    await handler({
      method: 'POST',
      body: {
        room: 'general',
        messageId: 'msg-1'
      }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body, {
      ok: true,
      alreadySent: false,
      deliveredCount: 1,
      failedCount: 1
    });
    assert.equal(webPushLib.setVapidDetails.mock.calls.length, 1);
    assert.equal(webPushLib.sendNotification.mock.calls.length, 2);

    const deliveryRecord = tracker.store.get('3dvr-portal/chat/pushDeliveries/general/msg-1');
    assert.equal(deliveryRecord.deliveredCount, 1);
    assert.equal(deliveryRecord.failedCount, 1);

    const records = await store.listActiveSubscriptions();
    assert.equal(records.length, 2);
    assert.deepEqual(
      records.map((record) => record.userId).sort(),
      ['user_receiver', 'user_sender']
    );
  });

  it('does not resend push notifications for the same message', async () => {
    const tracker = createTrackingGun();
    tracker.store.set('3dvr-portal/chat/pushDeliveries/general/msg-2', {
      sentAt: 100,
      deliveredCount: 2,
      failedCount: 0
    });

    const store = createGunPushStore({
      gun: tracker.gun,
      quietMs: 0,
      timeoutMs: 50,
      sleep: async () => {}
    });

    const webPushLib = {
      setVapidDetails: mock.fn(() => {}),
      sendNotification: mock.fn(async () => ({}))
    };

    const handler = createChatPushNotifyHandler({
      config: pushEnv,
      getStore: async () => store,
      webPushLib
    });

    const res = createMockRes();
    await handler({
      method: 'POST',
      body: {
        room: 'general',
        messageId: 'msg-2'
      }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.alreadySent, true);
    assert.equal(webPushLib.sendNotification.mock.calls.length, 0);
  });
});
