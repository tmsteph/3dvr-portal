import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMoneyAutomationSources,
  ensureActorIdentity,
  persistMoneyLoopRun,
  sanitizeForGun
} from '../money-ai/gun-sync.js';

function createTrackingGun() {
  const writes = [];

  function node(path = []) {
    return {
      path,
      get(next) {
        return node([...path, String(next)]);
      },
      put(value, callback) {
        writes.push({ path: [...path], value });
        callback?.({ ok: true });
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
    writes
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
