import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

test('CRM page exposes workflow filters for fast lead retrieval', async () => {
  const html = await read('crm/index.html');
  assert.match(html, /id="filterAllRecords"/);
  assert.match(html, /id="filterWarmLeads"/);
  assert.match(html, /id="personWorkflowFilter"/);
  assert.match(html, /Today's Sales Moves/);
  assert.match(html, /id="salesMovesFollowUpCount"/);
  assert.match(html, /id="salesMovesHotDraftCount"/);
  assert.match(html, /id="salesMovesWarmStaleCount"/);
  assert.match(html, /id="salesMovesRepliesCount"/);
  assert.match(html, /id="warmth"/);
  assert.match(html, /id="fit"/);
  assert.match(html, /id="urgency"/);
  assert.match(html, /id="lastContacted"/);
  assert.match(html, /id="nextBestAction"/);
  assert.match(html, /id="objection"/);
  assert.match(html, /id="crmDetailDrafts"/);
  assert.match(html, /id="crmDetailTimeline"/);
  assert.match(html, /id="crmResearchProfessionalServices"/);
  assert.match(html, /id="crmResearchLocalServices"/);
  assert.match(html, /id="crmResearchSupportTeams"/);
  assert.match(html, /id="crmTaxonomyTags"/);
  assert.match(html, /segment\/pro-services/);
  assert.match(html, /offer\/embedded/);
  assert.match(html, /data-contacts-link/);
  assert.doesNotMatch(html, /space=org-3dvr/);
  assert.match(html, /value="linked"/);
  assert.match(html, /value="unlinked"/);
  assert.match(html, /value="overdue"/);
  assert.match(html, /value="stale-14"/);
});

test('CRM app includes keyboard search shortcut and person workflow filter wiring', async () => {
  const js = await read('crm/app.js');
  assert.match(js, /personWorkflowFilter\?\.addEventListener\('change', applyFilter\)/);
  assert.match(js, /event\.key === '\/' && !isTypingContext/);
  assert.match(js, /data-contact-id=/);
  assert.match(js, /workflowFilter === 'linked'/);
  assert.match(js, /crm-outreach-drafts/);
  assert.match(js, /renderSalesMoves/);
  assert.match(js, /saveLeadDraft/);
  assert.match(js, /renderTimeline/);
});

test('Contacts page exposes CRM link filter', async () => {
  const html = await read('contacts/index.html');
  assert.match(html, /id="filterCrmLink"/);
  assert.match(html, /value="linked"/);
  assert.match(html, /value="unlinked"/);
});

test('CRM and Contacts preserve space-aware link context', async () => {
  const crmJs = await read('crm/app.js');
  const contactsHtml = await read('contacts/index.html');
  assert.match(crmJs, /function getPreferredContactsSpace()/);
  assert.match(crmJs, /return signedIn \? 'personal' : ORG_CONTACTS_SPACE/);
  assert.match(crmJs, /url\.searchParams\.set\('space', space\)/);
  assert.match(crmJs, /url\.searchParams\.set\('contact', contactId\)/);
  assert.match(contactsHtml, /function crmContactHref\(contactId = ''\)/);
  assert.match(contactsHtml, /\?contact=\$\{encodeURIComponent\(id\)\}/);
});
