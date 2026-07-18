import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { migrateLegacyCheckins } from '../life/privacy-migration.js';

function makeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    snapshot(key) {
      return values.get(key);
    }
  };
}

function storedEntries(entries) {
  return JSON.stringify(entries);
}

describe('life app', () => {
  it('ships a private-by-default Daily Direction app with device-local check-ins', async () => {
    const lifeHtml = await readFile(new URL('../life/index.html', import.meta.url), 'utf8');
    const lifeJs = await readFile(new URL('../life/app.js', import.meta.url), 'utf8');
    const portalIndex = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const freeTrial = await readFile(new URL('../free-trial.html', import.meta.url), 'utf8');
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

    assert.match(lifeHtml, /Daily Direction \| 3dvr Portal/);
    assert.match(lifeHtml, /Take one small step\./);
    assert.match(lifeHtml, /You do not need a big plan/);
    assert.match(lifeHtml, /id="lifeForm"/);
    assert.match(lifeHtml, /id="moodScore"/);
    assert.match(lifeHtml, /What needs care\?/);
    assert.match(lifeHtml, /id="trueTaskText"/);
    assert.match(lifeHtml, /data-need="My body needs care\."/);
    assert.match(lifeHtml, /data-step="Drink water\."/);
    assert.match(lifeHtml, /Do this next/);
    assert.match(lifeHtml, /Your next step is saved\./);
    assert.match(lifeHtml, /Share with someone I trust/);
    assert.match(lifeHtml, /href="sms:\?&body=/);
    assert.doesNotMatch(lifeHtml, /Thomas/);
    assert.doesNotMatch(lifeHtml, /gun(\.min)?\.js|gun-init\.js|sea\.js|score\.js/);
    assert.match(lifeHtml, /Copy my next step/);
    assert.match(lifeHtml, /Save my free link/);
    assert.match(lifeHtml, /See support options/);
    assert.match(lifeHtml, /Last notes/);
    assert.match(lifeHtml, /Saved privately on this device/);
    assert.doesNotMatch(lifeHtml, /Life OS/);
    assert.doesNotMatch(lifeHtml, /What am I avoiding\?/);
    assert.doesNotMatch(lifeHtml, /Weekly reflection/);
    assert.doesNotMatch(lifeHtml, /Category balance/);

    assert.match(lifeJs, /portal-life-checkins/);
    assert.doesNotMatch(lifeJs, /get\(['"]3dvr-portal['"]\)/);
    assert.doesNotMatch(lifeJs, /get\(['"]life['"]\)/);
    assert.doesNotMatch(lifeJs, /get\(['"]entries['"]\)/);
    assert.doesNotMatch(lifeJs, /entriesRoot/);
    assert.doesNotMatch(lifeJs, /\.map\(\)\s*\.on\(/);
    assert.doesNotMatch(lifeJs, /Gun\s*\(/);
    assert.match(lifeJs, /escapeHtml\(getEntryStep\(entry\)\)/);
    assert.match(lifeJs, /escapeHtml\(getEntryNeed\(entry\)\)/);
    assert.match(lifeJs, /alignment/);
    assert.match(lifeJs, /avoidance/);
    assert.match(lifeJs, /trueTask/);
    assert.match(lifeJs, /vision/);
    assert.match(lifeJs, /mission/);
    assert.match(lifeJs, /value\.projects/);
    assert.match(lifeJs, /Saved privately on this device\. Do one small step\./);
    assert.match(lifeJs, /function buildStepMessage/);
    assert.match(lifeJs, /I tried Daily Direction\. My next step is:/);
    assert.match(lifeJs, /shareTrustedLink/);
    assert.match(lifeJs, /function updateResponseLoop/);
    assert.match(lifeJs, /copyStepButton/);
    assert.match(lifeJs, /copyFreeLinkButton/);

    assert.match(portalIndex, /<span class="app-card__title">Daily Direction<\/span>/);
    assert.match(portalIndex, /Check in, name what needs care, and pick one small step\./);

    assert.match(freeTrial, /Try it now/);
    assert.match(freeTrial, /Start Daily Direction/);
    assert.match(freeTrial, /Email me my free link/);
    assert.match(freeTrial, /Email is optional\. You can start Daily Direction now\./);
    assert.match(freeTrial, /href="\/life\/index\.html"/);

    assert.match(readme, /\[Life\]\(https:\/\/3dvr-portal\.vercel\.app\/life\/\)/);
    assert.match(readme, /browser storage under `portal-life-checkins`/);
  });

  it('retains only matching legacy authors during the first migration', () => {
    const storage = makeStorage({
      userId: 'guest-local',
      'portal-life-checkins': storedEntries([
        { id: 'mine', author: 'guest-local', trueTask: 'Keep mine' },
        { id: 'other', author: 'guest-other', trueTask: 'Remove theirs' },
        { id: 'unknown', trueTask: 'Remove unknown' }
      ]),
      'portal-life-draft': '{"today":"Keep this draft"}'
    });

    const result = migrateLegacyCheckins(storage);

    assert.deepEqual(result.entries.map((entry) => entry.id), ['mine']);
    assert.equal(result.removedCount, 2);
    assert.equal(storage.snapshot('portal-life-checkins'), storedEntries([
      { id: 'mine', author: 'guest-local', trueTask: 'Keep mine' }
    ]));
    assert.equal(storage.snapshot('portal-life-checkins-migration'), 'v1');
    assert.equal(storage.snapshot('portal-life-draft'), '{"today":"Keep this draft"}');
  });

  it('removes all legacy entries when no local identity can be recovered', () => {
    const storage = makeStorage({
      'portal-life-checkins': storedEntries([
        { id: 'authored', author: 'guest-other' },
        { id: 'unattributed' }
      ])
    });

    const result = migrateLegacyCheckins(storage);

    assert.deepEqual(result.entries, []);
    assert.equal(result.removedCount, 2);
    assert.equal(storage.snapshot('portal-life-checkins'), '[]');
  });

  it('preserves new device-local entries after migration and filters later mismatches', () => {
    const storage = makeStorage({
      guestId: 'guest-local',
      'portal-life-checkins': storedEntries([
        { id: 'local', trueTask: 'Keep local' },
        { id: 'wrong', author: 'guest-other', trueTask: 'Remove wrong owner' }
      ])
    });

    const first = migrateLegacyCheckins(storage);
    assert.deepEqual(first.entries.map((entry) => entry.id), []);

    const postMigration = JSON.parse(storage.snapshot('portal-life-checkins'));
    postMigration.push({ id: 'new-local', trueTask: 'Keep after migration' });
    storage.setItem('portal-life-checkins', JSON.stringify(postMigration));

    const second = migrateLegacyCheckins(storage);
    assert.deepEqual(second.entries.map((entry) => entry.id), ['new-local']);
    assert.equal(second.migrated, false);
  });

  it('runs migration before rendering and keeps the privacy boundaries in place', async () => {
    const app = await readFile(new URL('../life/app.js', import.meta.url), 'utf8');
    const migrationCall = app.indexOf('migrateLegacyCheckins(window.localStorage)');
    const renderCall = app.indexOf('render();', migrationCall);

    assert.ok(migrationCall >= 0);
    assert.ok(renderCall > migrationCall);
    assert.doesNotMatch(app, /Gun\s*\(|fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/);
    assert.doesNotMatch(app, /3dvr-portal.*life|life.*entries|\.map\(\)\.on\(/);
    assert.doesNotMatch(await readFile(new URL('../life/index.html', import.meta.url), 'utf8'), /gun(\.min)?\.js|gun-init\.js|sea\.js|score\.js/);
  });
});
