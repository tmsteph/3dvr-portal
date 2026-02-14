import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMoneyAutomationSources,
  ensureActorIdentity,
  persistBillingEmailHint,
  persistMoneyLoopRun,
  readBillingEmailHint,
  sanitizeForGun
} from '../money-ai/gun-sync.js';

function createTrackingGun() {
  const writes = [];
  const store = new Map();

  function node(path = []) {
    const key = path.join('/');
    return {
      path,
      get(next) {
        return node([...path, String(next)]);
      },
      put(value, callback) {
        writes.push({ path: [...path], value });
        store.set(key, value);
        callback?.({ ok: true });
        return this;
      },
      once(callback) {
        callback?.(store.get(key));
        return this;
      }
    };
  }

  return {
    gun: {
      get(next) {
        return node([String(next)]);
      }
    },
    writes,
    store
  };
}

test('buildMoneyAutomationSources targets portal + legacy money-ai nodes', () => {
  const { gun } = createTrackingGun();
  const sources = buildMoneyAutomationSources(gun);

  assert.equal(sources.runSources[0].path.join('/'), '3dvr-portal/money-ai/runs');
  assert.equal(sources.runSources[1].path.join('/'), 'money-ai/runs');
  assert.equal(sources.opportunitySources[0].path.join('/'), '3dvr-portal/money-ai/opportunities');
  assert.equal(sources.adSources[1].path.join('/'), 'money-ai/ads');
});

test('sanitizeForGun removes functions and undefined values', () => {
  const payload = sanitizeForGun({
    ok: true,
    nested: {
      keep: 'value',
      fn() {},
      maybe: undefined
    },
    list: ['x', undefined, null],
    maybe: undefined
  });

  assert.deepEqual(payload, {
    ok: true,
    nested: {
      keep: 'value'
    },
    list: ['x', null]
  });
});

test('persistMoneyLoopRun writes run, opportunities, ads, and status to both source groups', async () => {
  const tracker = createTrackingGun();
  const sources = buildMoneyAutomationSources(tracker.gun);

  await persistMoneyLoopRun({
    sources,
    actor: 'guest-42',
    nowIso: '2026-02-13T10:00:00.000Z',
    report: {
      runId: 'money-test',
      generatedAt: '2026-02-13T09:59:00.000Z',
      usedOpenAi: true,
      input: {
        market: 'solo agencies',
        budget: 150,
        channels: ['reddit']
      },
      warnings: [],
      signals: [{ id: 's1' }],
      topOpportunity: {
        id: 'op-1',
        title: 'Proposal follow-up autopilot',
        score: 82
      },
      opportunities: [
        {
          id: 'op-1',
          title: 'Proposal follow-up autopilot',
          score: 82
        }
      ],
      adDrafts: [
        {
          id: 'ad-1',
          channel: 'reddit',
          headline: 'Stop losing proposals',
          body: 'Ship follow-up automation in one day',
          cta: 'Start pilot'
        }
      ]
    }
  });

  const writePaths = tracker.writes.map(entry => entry.path.join('/'));
  assert.ok(writePaths.includes('3dvr-portal/money-ai/runs/money-test'));
  assert.ok(writePaths.includes('money-ai/runs/money-test'));
  assert.ok(writePaths.includes('3dvr-portal/money-ai/opportunities/op-1'));
  assert.ok(writePaths.includes('money-ai/ads/ad-1'));
  assert.ok(writePaths.includes('3dvr-portal/money-ai/status/latest'));
});

test('ensureActorIdentity uses guest fallback when storage is unavailable', () => {
  const originalStorage = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get() {
      throw new Error('storage blocked');
    }
  });

  const actor = ensureActorIdentity({
    ensureGuestIdentity() {}
  });

  assert.equal(actor, 'guest');

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalStorage
  });
});

test('persistBillingEmailHint mirrors alias email under portal and legacy money-ai nodes', async () => {
  const tracker = createTrackingGun();
  const previousStorage = globalThis.localStorage;
  const map = new Map([['alias', 'agent@3dvr']]);
  const localStorageMock = {
    getItem(key) {
      return map.get(key) || null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    }
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageMock
  });

  try {
    const result = await persistBillingEmailHint(tracker.gun, 'Paid@Example.com');
    assert.equal(result.saved, true);
    assert.equal(result.email, 'paid@example.com');

    const paths = tracker.writes.map(entry => entry.path.join('/'));
    assert.ok(paths.includes('3dvr-portal/money-ai/billing/agent@3dvr'));
    assert.ok(paths.includes('money-ai/billing/agent@3dvr'));
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: previousStorage
    });
  }
});

test('readBillingEmailHint returns normalized email from billing hint nodes', async () => {
  const tracker = createTrackingGun();
  tracker.store.set(
    '3dvr-portal/money-ai/billing/agent@3dvr',
    { email: 'Agent@Example.com' }
  );

  const email = await readBillingEmailHint(tracker.gun, 'agent@3dvr');
  assert.equal(email, 'agent@example.com');
});
