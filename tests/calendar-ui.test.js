import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('calendar presents a schedule-first workspace with secondary tools below', async () => {
  const html = await readFile(new URL('../calendar/index.html', import.meta.url), 'utf8');

  assert.match(html, /<header class="calendar-header">/);
  assert.match(html, /<h1 class="calendar-header__title">Calendar<\/h1>/);
  assert.match(html, /<nav class="calendar-header__actions" aria-label="Calendar tools">/);
  assert.match(html, />Share<\/a>/);
  assert.match(html, />Connections<\/a>/);
  assert.match(html, /<section class="panel panel--primary" aria-labelledby="calendar-view-title">/);
  assert.match(html, /<div class="calendar-workspace">/);
  assert.match(html, /<h2 id="calendar-view-title" data-calendar-view-title>Month<\/h2>/);
  assert.match(html, /data-calendar-view-mode="month"/);
  assert.match(html, /data-calendar-view-mode="week"/);
  assert.match(html, />Week<\/button>/);
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
    'expected the calendar view to appear before the event planner'
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

test('calendar selected-day details expose a confirmed delete action for local events', async () => {
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../calendar/calendar-v2.css', import.meta.url), 'utf8');

  assert.match(js, /deleteButton\.dataset\.action = 'delete-event'/);
  assert.match(js, /deleteButton\.textContent = 'Delete'/);
  assert.match(js, /function confirmAndDeleteEvent\(id\)/);
  assert.match(js, /window\.confirm\(`/);
  assert.match(js, /handleCalendarDetailsClick[\s\S]*?confirmAndDeleteEvent\(eventId\)/);
  assert.match(css, /\.calendar-view__details-delete/);
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

test('calendar Google OAuth refreshes tokens and imports the upcoming schedule after connect', async () => {
  const html = await readFile(new URL('../calendar/index.html', import.meta.url), 'utf8');
  const oauth = await readFile(new URL('../calendar/oauth.js', import.meta.url), 'utf8');
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');

  assert.match(oauth, /async function ensureFreshConnection\(provider/);
  assert.match(oauth, /action: 'refresh'/);
  assert.match(js, /async function importUpcomingScheduleFromProvider\(provider, anchorDate = new Date\(\)\)/);
  assert.match(js, /Importing your upcoming schedule/);
  assert.match(js, /await getFreshConnectionOrWarn\(provider/);
  assert.match(js, /windowEnd\.setMonth\(windowEnd\.getMonth\(\) \+ 3\)/);
  assert.match(js, /async function refreshConnectedProviderCalendars\(\)/);
  assert.match(html, /name=\"maxResults\" min=\"1\" max=\"100\" value=\"100\"/);
});


test('calendar Week view pans naturally and arrows move one day at a time', async () => {
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');
  const css = await readFile(new URL('../calendar/calendar-v2.css', import.meta.url), 'utf8');

  assert.match(js, /ROLLING_WEEK_VISIBLE_DAYS = 7/);
  assert.match(js, /function renderRollingWeek\(events = state\.localEvents\)/);
  assert.match(js, /function handleRollingCalendarScroll\(\)/);
  assert.match(js, /function syncRollingAnchorFromScroll\(\)/);
  assert.match(js, /function rollingCellScrollLeft\(cell\)/);
  assert.doesNotMatch(js, /anchorCell\.offsetLeft/);
  assert.match(js, /next\.setDate\(next\.getDate\(\) \+ offset\)/);
  assert.doesNotMatch(js, /offset \* ROLLING_WEEK_VISIBLE_DAYS/);
  assert.match(js, /function startRollingCalendarDrag\(event\)/);
  assert.match(js, /function moveRollingCalendarDrag\(event\)/);
  assert.match(js, /suppressCalendarClickAfterDrag/);
  assert.match(css, /\.calendar-view__grid\[data-calendar-view="week"\][\s\S]*?overflow-x:\s*auto;/);
  assert.match(css, /grid-auto-columns:\s*calc\(\(100% - 42px\) \/ 7\)/);
  assert.match(css, /scrollbar-width:\s*none/);
  assert.match(css, /::-webkit-scrollbar/);
  assert.match(css, /cursor:\s*grab/);
  assert.match(css, /scroll-behavior:\s*auto/);
});

test('calendar repairs stale untitled imports and removes legacy placeholder events', async () => {
  const js = await readFile(new URL('../calendar/calendar.js', import.meta.url), 'utf8');

  assert.match(js, /function remoteEventTitle\(provider, raw\)/);
  assert.match(js, /raw\.summary/);
  assert.match(js, /raw\.subject/);
  assert.match(js, /async function refreshUntitledImportedEvents\(\)/);
  assert.match(js, /function pruneLegacyAutoSeedEvents\(\)/);
  assert.doesNotMatch(js, /\n\s*ensureDefaultTodayEvent\(\);/);
});
