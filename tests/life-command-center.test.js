import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../life/index.html', import.meta.url), 'utf8');
const commandCenter = fs.readFileSync(new URL('../life/command-center.js', import.meta.url), 'utf8');

test('Day exposes the five command-center buckets', () => {
  for (const label of ['Today', 'Next', 'Waiting On', 'Scheduled', 'Someday']) {
    assert.match(html, new RegExp(`>${label.replace('Waiting On', 'Waiting')}(?:\\s|<)`));
  }
  assert.match(html, /id="commandCapture"/);
  assert.match(html, /id="commandItems"/);
  assert.match(html, /command-center\.js/);
});

test('command center persists account-scoped local state', () => {
  assert.match(commandCenter, /3dvr\.command-center\.v1/);
  assert.match(commandCenter, /userPubKey/);
  assert.match(commandCenter, /localStorage\.setItem\(storageKey/);
  assert.match(commandCenter, /portal-life-checkins/);
  assert.match(commandCenter, /importLatestDailyStep/);
});

test('Daily Direction remains available below the command center', () => {
  for (const id of ['dailyCheckin', 'lifeForm', 'moodScore', 'todayText', 'trueTaskText', 'latestStep']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /\.\/app\.js/);
});
