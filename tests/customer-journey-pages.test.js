import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('portal customer journey pages', () => {
  it('gives the portal home a clear concrete entry path', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /Pick one clear starting point/);
    assert.match(html, /Start with a daily check-in when you need clarity\./);
    assert.match(html, /Daily check-in/);
    assert.match(html, /Small group/);
    assert.match(html, /View paid plans/);
    assert.match(html, /Get started/);
    assert.match(html, /Family &amp; Friends/);
    assert.match(html, /Builder/);
    assert.match(html, /Browse apps/);
    assert.match(html, /Choose the kind of help you need/);
    assert.match(html, /Choose daily direction when you need clarity\./);
    assert.match(html, /Daily Direction/);
    assert.match(html, /Opens Life for check-ins, reflection, and one clear next step\./);
    assert.match(html, /Support Group/);
    assert.match(html, /Opens Cell to create or join a small group for accountability and weekly momentum\./);
    assert.match(html, /Start Your Thing/);
    assert.match(html, /Choose the tools and paid support that help you launch a page, offer, service, or project\./);
  });

  it('keeps the free trial page tied to the portal account journey', async () => {
    const html = await readFile(new URL('../free-trial.html', import.meta.url), 'utf8');
    assert.match(html, /Get organized and take your next step/);
    assert.match(html, /Create or use one portal account/);
    assert.match(html, /Start with daily direction/);
    assert.match(html, /Send free-plan link/);
    assert.match(html, /Sign in or create account/);
    assert.match(html, /Open billing center/);
    assert.match(html, /Open start flow/);
    assert.doesNotMatch(html, /open Life/i);
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
    assert.match(html, /Open daily direction/);
    assert.match(html, /Open support group/);
    assert.match(html, /Open Projects/);
    assert.match(html, /All plans/);
    assert.match(html, /Open sign-in/);
    assert.match(html, /Browse apps/);
    assert.match(html, /Get grounded, get support, then launch/);
    assert.match(html, /Get started/);
    assert.match(html, /mailto:3dvr\.tech@gmail\.com/);
    assert.match(html, /src="\/start\/router\.js"/);
  });
});
