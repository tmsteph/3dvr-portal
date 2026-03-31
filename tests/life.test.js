import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('life app', () => {
  it('ships the Life portal app with Gun-backed check-ins and the new free-plan framing', async () => {
    const lifeHtml = await readFile(new URL('../life/index.html', import.meta.url), 'utf8');
    const lifeJs = await readFile(new URL('../life/app.js', import.meta.url), 'utf8');
    const portalIndex = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const freeTrial = await readFile(new URL('../free-trial.html', import.meta.url), 'utf8');
    const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

    assert.match(lifeHtml, /Life \| 3dvr Portal/);
    assert.match(lifeHtml, /Find your passions and organize your life/);
    assert.match(lifeHtml, /id="lifeForm"/);
    assert.match(lifeHtml, /id="weeklyText"/);
    assert.match(lifeHtml, /Open Cell/);
    assert.match(lifeHtml, /Open CRM/);
    assert.match(lifeHtml, /Stored under <code>3dvr-portal\/life<\/code> in Gun/);

    assert.match(lifeJs, /3dvr-portal\/life\/entries/);
    assert.match(lifeJs, /ensureGuestIdentity/);
    assert.match(lifeJs, /portal-life-checkins/);
    assert.match(lifeJs, /Saved to Life and queued for Gun sync/);

    assert.match(portalIndex, /<span class="app-card__title">Life<\/span>/);
    assert.match(portalIndex, /Track daily check-ins, weekly reflection, and the five parts of your life/);

    assert.match(freeTrial, /continue in the portal start flow/);
    assert.match(freeTrial, /Start with daily direction/);
    assert.match(freeTrial, /href="\/start\/"/);

    assert.match(readme, /\[Life\]\(https:\/\/3dvr-portal\.vercel\.app\/life\/\)/);
    assert.match(readme, /gun\.get\('3dvr-portal'\)\.get\('life'\)\.get\('entries'\)/);
  });
});
