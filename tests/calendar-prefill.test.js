import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('calendar supports prefilled event drafts from other portal apps', async () => {
  const calendarJs = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');

  assert.match(calendarJs, /function readCreateEventPrefillFromQuery\(\)/);
  assert.match(calendarJs, /new URLSearchParams\(window\.location\.search\)/);
  assert.match(calendarJs, /params\.has\('prefill'\)/);
  assert.match(calendarJs, /function applyCreateEventPrefillFromQuery\(\)/);
  assert.match(calendarJs, /prefill\.source === 'sales-research'/);
  assert.match(calendarJs, /Loaded an interview draft from Sales Research/);
  assert.match(calendarJs, /applyCreateEventPrefillFromQuery\(\);/);
});
