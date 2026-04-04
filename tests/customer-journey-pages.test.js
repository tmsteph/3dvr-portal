import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

describe('portal customer journey pages', () => {
  it('gives the portal home a clear concrete entry path', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /Get in, get moving\./);
    assert.match(html, /Pick one lane and keep the rest out of the way\./);
    assert.match(html, /Open CRM/);
    assert.match(html, /Open Sales/);
    assert.match(html, /Open Web Builder/);
    assert.match(html, /Core workspaces/);
    assert.match(html, /Contacts/);
    assert.match(html, /Messenger/);
    assert.match(html, /Calendar/);
    assert.match(html, /Meetings, follow-ups, and synced schedules\./);
    assert.match(html, /Finance/);
    assert.match(html, /Billing/);
    assert.match(html, /Get started/);
    assert.match(html, /Family &amp; Friends/);
    assert.match(html, /Builder/);
    assert.match(html, /Keep the support lanes nearby/);
    assert.match(html, /Daily Direction/);
    assert.match(html, /Life: 3-minute check-in and one clear next step\./);
    assert.match(html, /Support Group/);
    assert.match(html, /Cell: small-group accountability and weekly momentum\./);
    assert.match(html, /Start Your Thing/);
    assert.match(html, /Start Here: tools and paid help for a project, offer, or business\./);
    assert.match(html, /Search the dock/);
    assert.match(html, /App dock/);
    assert.match(html, /data-app-list/);
    assert.match(html, /shortcut-grid/);
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
    assert.match(html, /Customer path/);
    assert.match(html, /Paid plans, easy to find/);
    assert.match(html, /What hurts most right now\?/);
    assert.match(html, /What do you want next\?/);
    assert.match(html, /How much help do you want\?/);
    assert.match(html, /Best next move/);
    assert.match(html, /Open daily direction/);
    assert.match(html, /Open lead capture/);
    assert.match(html, /Open CRM/);
    assert.match(html, /Open Contacts/);
    assert.match(html, /Open Buyer Journey/);
    assert.match(html, /Open Messenger/);
    assert.match(html, /Open Projects/);
    assert.match(html, /Open Finance/);
    assert.match(html, /All plans/);
    assert.match(html, /Open sign-in/);
    assert.match(html, /Browse apps/);
    assert.match(html, /Move a warm lead into a real customer/);
    assert.match(html, /CRM follow-up/);
    assert.match(html, /Billing handoff/);
    assert.match(html, /Onboarding \+ delivery/);
    assert.match(html, /After billing, start the work cleanly/);
    assert.match(html, /Get started/);
    assert.match(html, /mailto:3dvr\.tech@gmail\.com/);
    assert.match(html, /src="\/start\/router\.js"/);
  });
});
