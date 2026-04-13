import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

test('CRM page exposes workflow filters and import controls for fast lead retrieval', async () => {
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
  assert.match(html, /id="crmPickDeviceContacts"/);
  assert.match(html, /id="crmImportFile"/);
  assert.match(html, /id="crmImportGoogleContacts"/);
  assert.match(html, /id="crmImportMicrosoftContacts"/);
  assert.match(html, /id="crmImportStatus"/);
  assert.match(html, /Phone contact import/);
  assert.match(html, /Import Google contacts/);
  assert.match(html, /Import Microsoft contacts/);
  assert.match(html, /Import VCF \/ CSV/);
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

test('CRM app includes keyboard search shortcut, workflow filters, and import wiring', async () => {
  const js = await read('crm/app.js');
  assert.match(js, /personWorkflowFilter\?\.addEventListener\('change', applyFilter\)/);
  assert.match(js, /event\.key === '\/' && !isTypingContext/);
  assert.match(js, /data-contact-id=/);
  assert.match(js, /workflowFilter === 'linked'/);
  assert.match(js, /crm-outreach-drafts/);
  assert.match(js, /renderSalesMoves/);
  assert.match(js, /saveLeadDraft/);
  assert.match(js, /renderTimeline/);
  assert.match(js, /supportsDeviceContactPicker\(window\.navigator\)/);
  assert.match(js, /pickDeviceContacts\(/);
  assert.match(js, /parseContactFileText\(/);
  assert.match(js, /function handleImportPicker\(\)/);
  assert.match(js, /function handleImportFiles\(event\)/);
  assert.match(js, /function importOauthContacts\(provider\)/);
  assert.match(js, /runtime\.listContacts/);
});

test('Contacts page exposes CRM link filter and phone import controls', async () => {
  const html = await read('contacts/index.html');
  assert.match(html, /id="filterCrmLink"/);
  assert.match(html, /value="linked"/);
  assert.match(html, /value="unlinked"/);
  assert.match(html, /id="btnPickDeviceContacts"/);
  assert.match(html, /id="btnImportGoogleContacts"/);
  assert.match(html, /id="btnImportMicrosoftContacts"/);
  assert.match(html, /id="contactsImportStatus"/);
  assert.match(html, /Phone import/);
  assert.match(html, /Cloud import/);
  assert.match(html, /Import VCF \/ CSV/);
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

test('Contacts app wires shared import helpers and status messaging', async () => {
  const html = await read('contacts/index.html');
  assert.match(html, /CONTACT_IMPORT_ACCEPT/);
  assert.match(html, /buildContactCrmRecord/);
  assert.match(html, /bulkImport\.accept = CONTACT_IMPORT_ACCEPT/);
  assert.match(html, /supportsDeviceContactPicker\(window\.navigator\)/);
  assert.match(html, /pickDeviceContacts\(/);
  assert.match(html, /parseContactFileText\(/);
  assert.match(html, /source\/contacts-workspace/);
  assert.match(html, /function setContactsImportStatus\(message = '', tone = 'info'\)/);
  assert.match(html, /function importContactsIntoWorkspace\(records, \{ sourceLabel = 'Phone import' \} = \{\}\)/);
  assert.match(html, /function importProviderContacts\(provider\)/);
  assert.match(html, /runtime\.listContacts/);
});
