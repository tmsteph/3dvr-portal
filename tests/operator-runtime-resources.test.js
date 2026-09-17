import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  createWorker,
  touchWorkerHeartbeat,
  workerIsStale
} from '../src/operator-runtime/worker-registry.js';
import {
  evaluateResourcePressure,
  normalizeResourceTelemetry
} from '../src/operator-runtime/resource-telemetry.js';

const NOW = Date.parse('2026-09-17T18:00:00.000Z');

test('host pressure blocks new browser workers before OVH loses recovery headroom', () => {
  const result = evaluateResourcePressure({
    memoryTotalMb: 7782,
    memoryAvailableMb: 729,
    swapTotalMb: 4096,
    swapUsedMb: 3991,
    browserProcesses: 53,
    load1: 2.43,
    cpuCount: 4,
    observedAt: '2026-09-17T18:00:00.000Z'
  });

  assert.equal(result.level, 'critical');
  assert.equal(result.admitBrowserWorker, false);
  assert.deepEqual(result.reasons, ['memory-reserve', 'swap-pressure', 'browser-process-pressure']);
});

test('healthy host telemetry admits a bounded browser worker', () => {
  const result = evaluateResourcePressure({
    memoryTotalMb: 8192,
    memoryAvailableMb: 4096,
    swapTotalMb: 4096,
    swapUsedMb: 1024,
    browserProcesses: 12,
    load1: 1,
    cpuCount: 4
  });

  assert.equal(result.level, 'healthy');
  assert.equal(result.admitBrowserWorker, true);
  assert.equal(normalizeResourceTelemetry(result.telemetry).loadPerCpu, 0.25);
});

test('worker heartbeats expose stale workers without breaking legacy workers', () => {
  const legacy = createWorker({ id: 'legacy', name: 'Legacy Worker' });
  const stale = createWorker({
    id: 'action-1',
    name: 'Action Worker',
    class: 'action',
    lastHeartbeatAt: '2026-09-17T17:00:00.000Z'
  });

  assert.equal(workerIsStale(legacy, { now: NOW }), false);
  assert.equal(workerIsStale(stale, { now: NOW, staleAfterMs: 5 * 60_000 }), true);

  const refreshed = touchWorkerHeartbeat(stale, { at: '2026-09-17T18:00:00.000Z' });
  assert.equal(workerIsStale(refreshed, { now: NOW }), false);
  assert.equal(refreshed.updatedAt, '2026-09-17T18:00:00.000Z');
});

test('host telemetry probe emits scheduler-ready JSON on Linux', () => {
  const script = new URL('../scripts/ops/operator-runtime-health.sh', import.meta.url).pathname;
  const result = spawnSync('bash', [script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const telemetry = JSON.parse(result.stdout);
  assert.ok(telemetry.memoryTotalMb > 0);
  assert.ok(telemetry.memoryAvailableMb >= 0);
  assert.ok(telemetry.cpuCount >= 1);
  assert.ok(telemetry.browserProcesses >= 0);
});
