import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { mergeSquatPayload, mergeSquatStats } from '../squat-timer/sync.js';

test('squat timer persists its session so a refresh resumes instead of resetting', async () => {
  const js = await readFile(new URL('../squat-timer/app.js', import.meta.url), 'utf8');

  assert.match(js, /squatTimer\.session\.v1/);
  assert.match(js, /function saveSession/);
  assert.match(js, /function restoreSession/);
  assert.match(js, /endAt: running \? endAt : null/);
  assert.match(js, /function reloadFromStorage/);
  assert.match(js, /window\.SquatTimer =/);
});

test('squat timer ships account sync wired like the other portal tools', async () => {
  const html = await readFile(new URL('../squat-timer/index.html', import.meta.url), 'utf8');
  const sync = await readFile(new URL('../squat-timer/sync.js', import.meta.url), 'utf8');
  const serviceWorker = await readFile(new URL('../service-worker.js', import.meta.url), 'utf8');

  assert.match(html, /id="syncStatus"/);
  assert.match(html, /gun\/gun\.js/);
  assert.match(html, /gun\/sea\.js/);
  assert.match(html, /auth-identity\.js/);
  assert.match(html, /type="module" src="\.\/sync\.js"/);

  assert.match(sync, /squat-timer-v1/);
  assert.match(sync, /SEA\.encrypt/);
  assert.match(sync, /SEA\.decrypt/);
  assert.match(sync, /user\.recall/);

  assert.match(serviceWorker, /'\/squat-timer\/sync\.js'/);
});

test('stats merge keeps the larger per-day count and never loses a streak day', () => {
  const merged = mergeSquatStats(
    {
      days: { '2026-11-02': { sets: 2, squats: 20 }, '2026-11-01': { sets: 1, squats: 10 } },
      totalSets: 3,
      totalSquats: 30,
      lastSetAt: '2026-11-02T20:00:00.000Z'
    },
    {
      days: { '2026-11-02': { sets: 1, squats: 10 }, '2026-10-31': { sets: 3, squats: 30 } },
      totalSets: 4,
      totalSquats: 40,
      lastSetAt: '2026-10-31T18:00:00.000Z'
    }
  );

  assert.deepEqual(merged.days['2026-11-02'], { sets: 2, squats: 20 });
  assert.deepEqual(merged.days['2026-11-01'], { sets: 1, squats: 10 });
  assert.deepEqual(merged.days['2026-10-31'], { sets: 3, squats: 30 });
  assert.equal(merged.totalSets, 6);
  assert.equal(merged.totalSquats, 60);
  assert.equal(merged.lastSetAt, '2026-11-02T20:00:00.000Z');
});

test('payload merge takes settings from the side that changed them last', () => {
  const merged = mergeSquatPayload(
    {
      settings: { intervalMin: 45, reps: 10, sound: true, vibrate: true },
      stats: { days: {}, totalSets: 0, totalSquats: 0, lastSetAt: null },
      settingsAt: '2026-11-02T10:00:00.000Z',
      statsAt: null
    },
    {
      settings: { intervalMin: 30, reps: 15, sound: false, vibrate: true },
      stats: { days: {}, totalSets: 0, totalSquats: 0, lastSetAt: null },
      settingsAt: '2026-11-02T12:00:00.000Z',
      statsAt: null
    }
  );

  assert.deepEqual(merged.settings, { intervalMin: 30, reps: 15, sound: false, vibrate: true });
  assert.equal(merged.settingsAt, '2026-11-02T12:00:00.000Z');
});
