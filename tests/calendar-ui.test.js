import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('calendar presents a month-first workspace with secondary tools below', async () => {
  const html = await readFile(new URL('../calendar/index.html', import.meta.url), 'utf8');

  assert.match(html, /<header class="calendar-header">/);
  assert.match(html, /<h1 class="calendar-header__title">Calendar<\/h1>/);
  assert.match(html, /<nav class="calendar-header__actions" aria-label="Calendar tools">/);
  assert.match(html, />Share<\/a>/);
  assert.match(html, />Connections<\/a>/);
  assert.match(html, /<section class="panel panel--primary" aria-labelledby="calendar-view-title">/);
  assert.match(html, /<div class="calendar-workspace">/);
  assert.match(html, /<h2 id="calendar-view-title">Month<\/h2>/);
  assert.match(html, /<aside class="calendar-planner" aria-labelledby="calendar-planner-title">/);
  assert.match(html, /<h2 id="calendar-planner-title">Add event<\/h2>/);
  assert.match(html, /data-label-open="\+ Add event"/);
  assert.match(html, /<details class="calendar-activity">/);
  assert.match(html, /Event list & sync log/);
  assert.match(html, /<aside class="calendar-rail" aria-label="Calendar tools">/);
  assert.match(html, /<h2 id="share-calendar-title">Share<\/h2>/);
  assert.match(html, /<h2 id="connections-title">Connections<\/h2>/);
  assert.match(html, /<h2 id="event-sync-title">Import<\/h2>/);
  assert.match(html, /Connect Google/);
  assert.match(html, /Connect Microsoft/);
  assert.match(html, /<script src="\.\/oauth\.js"><\/script>/);

  assert.ok(
    html.indexOf('calendar-stage') < html.indexOf('calendar-planner'),
    'expected the month to appear before the event planner'
  );
  assert.ok(
    html.indexOf('panel--primary') < html.indexOf('calendar-rail'),
    'expected the primary calendar workspace to appear before secondary tools'
  );
});

test('calendar month cells show time ranges and useful event titles', async () => {
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../calendar/calendar-v2.css', import.meta.url), 'utf8');

  assert.match(js, /const timeLabel = formatCalendarRange\(event\);/);
  assert.match(js, /function formatCompactCalendarRange\(event\)/);
  assert.match(js, /calendar-view__event-time-compact/);
  assert.match(js, /title\.className = 'calendar-view__event-title';/);
  assert.match(css, /\.calendar-view__event-title \{/);
  assert.match(css, /\.calendar-view__event-time-compact\s*\{\s*display:\s*none;/s);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.calendar-view__event-time-compact\s*\{\s*display:\s*inline;/);
});

test('calendar keeps event creation and advanced settings progressive', async () => {
  const html = await readFile(new URL('../calendar/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');

  assert.match(html, /data-create-event-container hidden/);
  assert.match(html, /<details class="form-options">/);
  assert.match(html, /<summary>Repeat & reminders<\/summary>/);
  assert.match(html, /<details class="connection-card__details">\s*<summary>Advanced<\/summary>/s);
  assert.match(html, /<details class="sync-controls__range">\s*<summary>Time range<\/summary>/s);
  assert.match(js, /function renderSelectedDayDetails\(\)/);
  assert.match(js, /function toggleCreateEventForm\(\)/);
});

test('calendar stylesheet keeps seven columns usable on smaller screens', async () => {
  const css = await readFile(new URL('../calendar/calendar-v2.css', import.meta.url), 'utf8');

  assert.match(css, /\.calendar-view__grid\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.calendar-view__day-names,\s*\.calendar-view__days\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.calendar-activity__grid,\s*\.calendar-rail\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /@media \(max-width: 430px\)[\s\S]*?\.calendar-view__event-title\s*\{\s*display:\s*none;/);
});

test('calendar month cells expose useful event details to assistive tech', async () => {
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');

  assert.match(js, /item\.setAttribute\('aria-label'/);
  assert.match(js, /eventsForDay\.slice\(0, 3\)\.forEach\(event =>/);
  assert.match(js, /labelParts\.push/);
});

test('calendar supports no-login secret share links with view or edit permission', async () => {
  const html = await readFile(new URL('../calendar/index.html', import.meta.url), 'utf8');
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');

  assert.match(html, /<h2 id="share-calendar-title">Share<\/h2>/);
  assert.match(html, /Create link/);
  assert.match(html, /option value="view">View only/);
  assert.match(html, /option value="edit">Can edit/);
  assert.match(html, /data-share-access/);
  assert.match(js, /function readCalendarShareToken\(\)/);
  assert.match(js, /window\.location\.hash/);
  assert.match(js, /3dvr-calendar-share:/);
  assert.match(js, /function sharePermissionFromToken\(token = SHARE_TOKEN\)/);
  assert.match(js, /startsWith\('cale_'\)/);
  assert.match(js, /const prefix = permission === 'edit' \? 'cale' : 'calv'/);
  assert.match(js, /function canEditCalendar\(\)/);
  assert.match(js, /function revokeShareToken\(token\)/);
  assert.match(js, /setupGunSync\(\{ pushInitial: false \}\)/);
});

test('calendar Google OAuth refreshes tokens and imports the current month after connect', async () => {
  const oauth = await readFile(new URL('../calendar/oauth.js', import.meta.url), 'utf8');
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');

  assert.match(oauth, /async function ensureFreshConnection\(provider/);
  assert.match(oauth, /action: 'refresh'/);
  assert.match(js, /async function importCurrentMonthFromProvider\(provider\)/);
  assert.match(js, /Importing this month/);
  assert.match(js, /await getFreshConnectionOrWarn\(provider/);
});
