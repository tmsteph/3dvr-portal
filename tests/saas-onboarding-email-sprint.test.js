import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';

const rootDir = new URL('../', import.meta.url);
const playbookUrl = new URL('docs/saas-onboarding-email-pilot-sprint.md', rootDir);
const sprintPageUrl = new URL('ideas/saas-onboarding-email-sprint.html', rootDir);
const salesDeskUrl = new URL('sales/saas-onboarding-sprint.html', rootDir);
const ideasIndexUrl = new URL('ideas/index.html', rootDir);
const salesIndexUrl = new URL('sales/index.html', rootDir);

/**
 * Verifies existence of a file by URL.
 * @param {URL} url Target file URL.
 * @returns {Promise<boolean>} True if file is accessible, false otherwise.
 */
async function fileExists(url) {
  try {
    await access(url, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe('SaaS Onboarding Email Sprint Playbook', () => {
  it('documents manual concierge delivery steps in docs/saas-onboarding-email-pilot-sprint.md', async () => {
    assert.equal(await fileExists(playbookUrl), true, 'playbook markdown file should exist');
    const playbook = await readFile(playbookUrl, 'utf8');

    assert.match(playbook, /Phase 1: Intake & Baseline Audit/);
    assert.match(playbook, /Baseline Telemetry/);
    assert.match(playbook, /Phase 2: Teardown & Gap Analysis/);
    assert.match(playbook, /Friction Teardown/);
    assert.match(playbook, /Phase 3: Sequence Architecture & Conversion Copywriting/);
    assert.match(playbook, /Email 1: Immediate Value Hook/);
    assert.match(playbook, /Email 2: Activation Trigger/);
    assert.match(playbook, /Email 3: Workflow Blueprint/);
    assert.match(playbook, /Email 4: Advanced Feature Unlock/);
    assert.match(playbook, /Email 5: Founder Check-in/);
    assert.match(playbook, /Email 6: Plan Conversion \/ Expiry/);
    assert.match(playbook, /Email 7: Grace Extension \/ Exit/);
    assert.match(playbook, /Phase 4: Concierge Tool Implementation & Verification/);
    assert.match(playbook, /Customer\.io, Loops, Resend, Postmark/);
    assert.match(playbook, /SPF, DKIM, and DMARC/);
    assert.match(playbook, /Phase 5: Handoff, Metrics Tracking & 30-Day Measurement/);
    assert.match(playbook, /Cohort Tracking Sheet/);
  });

  it('documents the outreach plan to recruit 3-5 paying pilot customers', async () => {
    const playbook = await readFile(playbookUrl, 'utf8');

    assert.match(playbook, /recruit 3-5 paying pilot customers/);
    assert.match(playbook, /\$300 one-time setup fee/);
    assert.match(playbook, /100% money-back satisfaction guarantee/);
    assert.match(playbook, /LinkedIn Signals/);
    assert.match(playbook, /X \/ Twitter/);
    assert.match(playbook, /Product Hunt Launches/);
    assert.match(playbook, /Hacker News/);
    assert.match(playbook, /Touch 1: Signal-Based Problem Observation/);
    assert.match(playbook, /Touch 2: Concrete Value Teardown/);
    assert.match(playbook, /Touch 3: Closing the Loop/);
    assert.match(playbook, /50 Qualified Early-Stage SaaS Accounts/);
    assert.match(playbook, /3-5 Paid Pilot Customers/);
    assert.match(playbook, /Opt-Out Mechanism/);
  });
});

describe('SaaS Onboarding Email Sprint Public Offer', () => {
  it('ships a buyable paid sprint page with Gun-backed intake', async () => {
    assert.equal(await fileExists(sprintPageUrl), true, 'sprint page should exist');
    const html = await readFile(sprintPageUrl, 'utf8');

    assert.match(html, /SaaS Onboarding Email Sprint/);
    assert.match(html, /Turn new signups into active, paying SaaS customers\./);
    assert.match(html, /\$300 setup sprint/);
    assert.match(html, /7-day concierge delivery/);
    assert.match(html, /100% money-back guarantee/);
    assert.match(html, /Baseline Audit &amp; Gap Analysis/);
    assert.match(html, /5-7 Part Activation Sequence/);
    assert.match(html, /Concierge Tool Implementation/);
    assert.match(html, /Cohort Tracking &amp; Review/);
    assert.match(html, /Start \$300 sprint/);
    assert.match(html, /redirect=%2Fbilling%2F%3Fplan%3Dcustom%26amount%3D300/);
    assert.match(html, /label%3DSaaS%2520Onboarding%2520Email%2520Sprint/);
    assert.match(html, /data-audience-key="saas-onboarding-email-sprint"/);
    assert.match(html, /3dvr-audience-tests\/v1\/saas-onboarding-email-sprint\/signups/);
  });

  it('ships a dedicated sales operating desk at sales/saas-onboarding-sprint.html', async () => {
    assert.equal(await fileExists(salesDeskUrl), true, 'sales desk page should exist');
    const html = await readFile(salesDeskUrl, 'utf8');

    assert.match(html, /SaaS Onboarding Email Sprint \| 3DVR Sales/);
    assert.match(html, /1 · Audit/);
    assert.match(html, /2 · Teardown/);
    assert.match(html, /3 · Copywrite/);
    assert.match(html, /4 · Staging/);
    assert.match(html, /5 · Handoff/);
    assert.match(html, /Touch 1: Signal Observation/);
    assert.match(html, /Touch 2: Value Teardown/);
    assert.match(html, /Touch 3: Closing the Loop/);
    assert.match(html, /3-5 Paying Customers/);
    assert.match(html, /Research \+ save lead/);
    assert.match(html, /Draft CRM record/);
    assert.match(html, /Open Email Operator/);
    assert.match(html, /threadId=sales-saas-onboarding/);
    assert.match(html, /tags=early-stage-saas%2Cpilot%2Cpaid%2Conboarding-email/);
  });

  it('links the sprint from Ideas Lab and Sales directory', async () => {
    const [ideas, sales] = await Promise.all([
      readFile(ideasIndexUrl, 'utf8'),
      readFile(salesIndexUrl, 'utf8')
    ]);

    assert.match(ideas, /\/ideas\/saas-onboarding-email-sprint\.html/);
    assert.match(ideas, /SaaS Onboarding Email Sprint/);
    assert.match(sales, /\.\.\/ideas\/saas-onboarding-email-sprint\.html/);
    assert.match(sales, /SaaS Onboarding Sprint/);
    assert.match(sales, /7-day pilot/);
  });
});
