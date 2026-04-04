import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('calendar hub presents a clear hero, primary workspace, and side rail', async () => {
  const html = await readFile(new URL('../calendar/index.html', import.meta.url), 'utf8');

  assert.match(html, /<header class="calendar-header">/);
  assert.match(html, /<div class="calendar-header__highlights" aria-label="Calendar highlights">/);
  assert.match(html, /Local first/);
  assert.match(html, /Fast capture/);
  assert.match(html, /Sync later/);
  assert.match(html, /<section class="panel panel--primary" aria-labelledby="local-calendar-title">/);
  assert.match(html, /<aside class="calendar-rail">/);
  assert.match(html, /<section class="panel" aria-labelledby="connections-title">/);
  assert.match(html, /<section class="panel" aria-labelledby="event-sync-title">/);
  assert.match(html, /Monthly overview/);
  assert.match(html, /Optional account connections/);
  assert.match(html, /Import from external calendars/);
  assert.match(html, /Connect Google with OAuth/);
  assert.match(html, /Connect Microsoft with OAuth/);
  assert.match(html, /<script src="\/oauth\.js"><\/script>/);

  assert.ok(
    html.indexOf('panel--primary') < html.indexOf('calendar-rail'),
    'expected the primary calendar workspace to appear before the right rail'
  );
});
