import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
});
