import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateFreelanceSourceHealth,
  recordFreelanceSourceCheck,
} from '../src/freelance-source-health.js';

const NOW = new Date('2026-09-29T19:00:00Z');

test('successful empty source check is healthy, not a connector failure', () => {
  const source = recordFreelanceSourceCheck(
    { id: 'iatse', monitoring: 'connector', checkCadenceMinutes: 1440 },
    { ok: true, opportunityCount: 0 },
    NOW,
  );
  const health = evaluateFreelanceSourceHealth(source, NOW);

  assert.equal(source.lastResult, 'empty');
  assert.equal(health.health, 'healthy');
  assert.equal(health.label, 'Healthy · 0 found');
});

test('successful source check reports discovered opportunity count', () => {
  const source = recordFreelanceSourceCheck(
    { id: 'portal', monitoring: 'connector' },
    { ok: true, opportunityCount: 4 },
    NOW,
  );
  const health = evaluateFreelanceSourceHealth(source, NOW);

  assert.equal(health.health, 'healthy');
  assert.equal(health.label, 'Healthy · 4 found');
});

test('latest failed connector check is an error even when an older success exists', () => {
  const source = recordFreelanceSourceCheck({
    id: 'portal',
    monitoring: 'connector',
    lastSuccessAt: '2026-09-29T17:00:00Z',
  }, {
    ok: false,
    error: 'login expired',
  }, NOW);

  const health = evaluateFreelanceSourceHealth(source, NOW);
  assert.equal(health.health, 'error');
  assert.match(health.detail, /login expired/);
});

test('connector becomes stale after twice its expected cadence', () => {
  const health = evaluateFreelanceSourceHealth({
    monitoring: 'connector',
    checkCadenceMinutes: 60,
    lastCheckedAt: '2026-09-29T16:00:00Z',
    lastSuccessAt: '2026-09-29T16:00:00Z',
    lastResult: 'empty',
  }, NOW);

  assert.equal(health.health, 'stale');
});

test('connector without a heartbeat is unknown rather than healthy', () => {
  const health = evaluateFreelanceSourceHealth({ monitoring: 'connector' }, NOW);
  assert.equal(health.health, 'unknown');
  assert.equal(health.label, 'Not checked');
});

test('manual sources do not generate false stale alerts', () => {
  const health = evaluateFreelanceSourceHealth({ monitoring: 'manual' }, NOW);
  assert.equal(health.health, 'manual');
});
