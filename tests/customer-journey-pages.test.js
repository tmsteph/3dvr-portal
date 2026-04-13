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
    assert.match(html, /href="start\/#paid-lanes"/);
    assert.match(html, /href="free-trial\.html"/);
    assert.match(html, /href="sign-in\.html\?redirect=%2Fbilling%2F%3Fplan%3Dstarter"/);
    assert.match(html, /href="sign-in\.html\?redirect=%2Fbilling%2F%3Fplan%3Dpro"/);
    assert.match(html, /href="sign-in\.html\?redirect=%2Fbilling%2F%3Fplan%3Dbuilder"/);
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
    assert.doesNotMatch(html, /https:\/\/3dvr\.tech\/subscribe\/free-plan\.html/);
    assert.doesNotMatch(html, /https:\/\/3dvr\.tech\/subscribe\/family-friends\.html/);
    assert.doesNotMatch(html, /https:\/\/3dvr\.tech\/subscribe\/founder-plan\.html/);
    assert.doesNotMatch(html, /https:\/\/3dvr\.tech\/subscribe\/builder-plan\.html/);
  });

  it('keeps the portal homepage calm on very narrow mobile screens', async () => {
    const css = await readFile(new URL('../index-style.css', import.meta.url), 'utf8');
    const globalCss = await readFile(new URL('../styles/global.css', import.meta.url), 'utf8');

    assert.match(globalCss, /-webkit-text-size-adjust:\s*100%/);
    assert.match(globalCss, /text-size-adjust:\s*100%/);
    assert.match(css, /@media \(max-width: 380px\)/);
    assert.match(css, /\.hero-actions \.cta\s*\{/);
    assert.match(css, /font-size:\s*clamp\(2rem,\s*8\.8vw,\s*2\.35rem\)/);
  });

  it('keeps the free trial page tied to the portal account journey', async () => {
    const html = await readFile(new URL('../free-trial.html', import.meta.url), 'utf8');
    assert.match(html, /Get organized and take your next step/);
    assert.match(html, /Create or use one portal account/);
    assert.match(html, /Start with daily direction/);
    assert.match(html, /Send free-plan link/);
    assert.match(html, /Start here/);
    assert.match(html, /Use the email you want attached to your portal account/);
    assert.match(html, /Sign in or create account/);
    assert.match(html, /Open billing center/);
    assert.match(html, /Open start flow/);
    assert.doesNotMatch(html, /open Life/i);
  });

  it('turns the start page into a compact onboarding router with easy plan access', async () => {
    const html = await readFile(new URL('../start/index.html', import.meta.url), 'utf8');
    assert.match(html, /One account\. One path\. One next move\./);
    assert.match(html, /3 clear paths/);
    assert.match(html, /Start where you actually are/);
    assert.match(html, /Start free/);
    assert.match(html, /Choose a paid lane/);
    assert.match(html, /Already paying\?/);
    assert.match(html, /Manage what is already active/);
    assert.match(html, /Paid lanes/);
    assert.match(html, /Continue with \$5/);
    assert.match(html, /Continue with \$20/);
    assert.match(html, /Continue with \$50/);
    assert.match(html, /Continue with \$200/);
    assert.match(html, /Need help choosing\?/);
    assert.match(html, /What hurts most right now\?/);
    assert.match(html, /What do you want next\?/);
    assert.match(html, /How much help do you want\?/);
    assert.match(html, /Best next move/);
    assert.match(html, /Open sign-in/);
    assert.match(html, /Open billing/);
    assert.match(html, /Open Daily Direction/);
    assert.match(html, /Open Projects/);
    assert.match(html, /Open Contacts/);
    assert.match(html, /Open Messenger/);
    assert.match(html, /Open Finance/);
    assert.match(html, /One portal account/);
    assert.match(html, /Switch plans later in Stripe/);
    assert.match(html, /Open sign-in/);
    assert.match(html, /Browse apps/);
    assert.match(html, /Returning customers should not have to wade back through plan education\./);
    assert.match(html, /After billing, start the work cleanly/);
    assert.match(html, /mailto:3dvr\.tech@gmail\.com/);
    assert.match(html, /src="\/start\/router\.js"/);
  });
});
