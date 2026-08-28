const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'calendar', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'calendar', 'calendar-v2.css'), 'utf8');

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
});

test('mobile calendar stays seven columns without horizontal month panning', () => {
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.calendar-view__grid\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.calendar-view__event-time-full\s*\{\s*display:\s*none;/s);
  assert.match(css, /\.calendar-view__event-time-compact\s*\{\s*display:\s*inline;/s);
});
