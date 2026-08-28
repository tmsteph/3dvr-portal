import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../calendar/index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../calendar/calendar-v2.css', import.meta.url), 'utf8');

test('calendar keeps the month as the primary full-width workspace', () => {
  assert.match(html, /<link rel="stylesheet" href="\.\/calendar-v2\.css">/);
  assert.match(html, /<h1 class="calendar-header__title">Calendar<\/h1>/);
  assert.match(css, /\.calendar-shell\s*\{[^}]*display:\s*grid;/s);
  assert.match(css, /\.calendar-workspace\s*\{[^}]*display:\s*grid;/s);
  assert.doesNotMatch(css, /\.calendar-workspace\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.45fr\)/s);
  assert.match(css, /\.calendar-view__day-names,\s*\.calendar-view__days\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/s);
});

test('secondary calendar tools stay below the month and advanced settings are collapsed', () => {
  assert.match(html, /<aside class="calendar-rail"/);
  assert.match(html, /<details class="connection-card__details">\s*<summary>Advanced<\/summary>/s);
  assert.match(html, /<details class="calendar-activity">\s*<summary>Event list & sync log<\/summary>/s);
  assert.match(html, /<details class="form-options">\s*<summary>Repeat & reminders<\/summary>/s);
  assert.ok(
    html.indexOf('panel--primary') < html.indexOf('calendar-rail'),
    'expected calendar tools to follow the primary month workspace'
  );
});

test('mobile calendar stays seven columns without horizontal month panning', () => {
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.calendar-view__grid\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.calendar-view__event-time-full\s*\{\s*display:\s*none;/s);
  assert.match(css, /\.calendar-view__event-time-compact\s*\{\s*display:\s*inline;/s);
});
