import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('calendar hub presents a clear hero, month-first workspace, and side rail', async () => {
  const html = await readFile(new URL('../calendar/index.html', import.meta.url), 'utf8');

  assert.match(html, /<header class="calendar-header">/);
  assert.match(html, /<div class="calendar-header__actions" aria-label="Calendar shortcuts">/);
  assert.match(html, /Jump to month view/);
  assert.match(html, /<div class="calendar-header__highlights" aria-label="Calendar highlights">/);
  assert.match(html, /Local first/);
  assert.match(html, /Fast capture/);
  assert.match(html, /Sync later/);
  assert.match(html, /<section class="panel panel--primary" aria-labelledby="local-calendar-title">/);
  assert.match(html, /<div class="calendar-quickstats" aria-label="Calendar summary">/);
  assert.match(html, /<div class="calendar-workspace">/);
  assert.match(html, /<aside class="calendar-planner" aria-labelledby="calendar-planner-title">/);
  assert.match(html, /Quick planner/);
  assert.match(html, /Open planner/);
  assert.match(html, /<section class="calendar-activity" aria-labelledby="calendar-activity-title">/);
  assert.match(html, /Imported events and status updates/);
  assert.match(html, /<aside class="calendar-rail">/);
  assert.match(html, /<section class="panel" aria-labelledby="connections-title">/);
  assert.match(html, /<section class="panel" aria-labelledby="event-sync-title">/);
  assert.match(html, /Monthly overview/);
  assert.match(html, /Optional account connections/);
  assert.match(html, /Import from external calendars/);
  assert.match(html, /Connect Google with OAuth/);
  assert.match(html, /Connect Microsoft with OAuth/);
  assert.match(html, /<script src="\.\/oauth\.js"><\/script>/);

  assert.ok(
    html.indexOf('panel--primary') < html.indexOf('calendar-rail'),
    'expected the primary calendar workspace to appear before the right rail'
  );
  assert.ok(
    html.indexOf('calendar-workspace') < html.indexOf('calendar-activity'),
    'expected the month workspace to appear before the lower activity section'
  );
});

test('calendar runtime updates the quick summary strip from event and connection state', async () => {
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');

  assert.match(js, /const calendarQuickUpcoming = document\.getElementById\('calendarQuickUpcoming'\);/);
  assert.match(js, /const calendarQuickConnected = document\.getElementById\('calendarQuickConnected'\);/);
  assert.match(js, /const calendarQuickSelected = document\.getElementById\('calendarQuickSelected'\);/);
  assert.match(js, /function updateCalendarQuickStats\(events = state\.localEvents\)/);
  assert.match(js, /state\.connections\.has\(provider\)/);
  assert.match(js, /getEventsForSelectedDate\(events\)/);
});

test('calendar stylesheet keeps the month view reachable on smaller screens', async () => {
  const css = await readFile(new URL('../calendar/calendar.css', import.meta.url), 'utf8');

  assert.match(css, /\.calendar-header__action \{/);
  assert.match(css, /\.calendar-view \{[\s\S]*scroll-margin-top: 20px;/);
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.calendar-header__highlights \{[\s\S]*?overflow-x: auto;/);
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?\.calendar-quickstats \{[\s\S]*?overflow-x: auto;/);
  assert.match(css, /@media \(max-width: 540px\) \{[\s\S]*?\.calendar-header__action \{[\s\S]*?width: 100%;/);
});
