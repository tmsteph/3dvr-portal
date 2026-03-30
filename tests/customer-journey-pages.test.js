import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('portal customer journey pages', () => {
  it('gives the portal home a clear concrete entry path', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /Pick one clear starting point/);
    assert.match(html, /Open Life for a daily check-in\./);
    assert.match(html, /Daily check-in/);
    assert.match(html, /Small group/);
    assert.match(html, /View paid plans/);
    assert.match(html, /Life starter/);
    assert.match(html, /Family &amp; Friends/);
    assert.match(html, /Builder/);
    assert.match(html, /Browse apps/);
    assert.match(html, /Choose the kind of help you need/);
    assert.match(html, /Start Your Thing/);
    assert.match(html, /Log how you feel, what happened today, and what matters tomorrow\./);
  });

  it('keeps the free trial page tied to the portal account journey', async () => {
    const html = await readFile(new URL('../free-trial.html', import.meta.url), 'utf8');
    assert.match(html, /Find your passions and organize your life/);
    assert.match(html, /Create or use one portal account/);
    assert.match(html, /Send free-plan link/);
    assert.match(html, /Sign in or create account/);
    assert.match(html, /Open billing center/);
  });

  it('turns the start page into a compact onboarding router with easy plan access', async () => {
    const html = await readFile(new URL('../start/index.html', import.meta.url), 'utf8');
    assert.match(html, /Pick a path in under a minute/);
    assert.match(html, /3-question router/);
    assert.match(html, /Paid plans, easy to find/);
    assert.match(html, /What hurts most right now\?/);
    assert.match(html, /What do you want next\?/);
    assert.match(html, /How much help do you want\?/);
    assert.match(html, /Best next move/);
    assert.match(html, /Open Life/);
    assert.match(html, /Open Cell/);
    assert.match(html, /Open Projects/);
    assert.match(html, /All plans/);
    assert.match(html, /Open sign-in/);
    assert.match(html, /Browse apps/);
    assert.match(html, /Relief, people, then launch/);
    assert.match(html, /mailto:3dvr\.tech@gmail\.com/);
    assert.match(html, /src="\/start\/router\.js"/);
  });
});
