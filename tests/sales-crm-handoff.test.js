import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales hub routes offers into prefilled CRM drafts', async () => {
  const salesHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');
  const crmHtml = await readFile(new URL('../crm/index.html', import.meta.url), 'utf8');
  const crmAppJs = await readFile(new URL('../crm/app.js', import.meta.url), 'utf8');

  assert.match(salesHtml, /Today&apos;s close/);
  assert.match(salesHtml, /Draft CRM/);
  assert.match(salesHtml, /\.\.\/crm\/\?draft=1&lead=Builder%20follow-up/);
  assert.match(salesHtml, /\.\.\/crm\/\?draft=1&lead=Embedded%20follow-up/);
  assert.match(salesHtml, /\.\.\/crm\/\?draft=1&lead=Custom%20project%20follow-up/);

  assert.match(crmHtml, /Sales handoff/);
  assert.match(crmHtml, /Builder draft/);
  assert.match(crmHtml, /Embedded draft/);
  assert.match(crmHtml, /Custom draft/);
  assert.match(crmHtml, /type="module" src="\.\/app\.js"/);
  assert.doesNotMatch(crmHtml, /const gun = Gun\(window\.__GUN_PEERS__/);
  assert.match(crmAppJs, /SALES_DRAFT_PRESETS/);
  assert.match(crmAppJs, /applyUrlDraftIfNeeded/);
  assert.match(crmAppJs, /lead: \(params\.get\('lead'\) \|\| ''\)\.trim\(\)/);
  assert.match(crmAppJs, /elements\.draftBuilder\?\.addEventListener/);
  assert.match(crmHtml, /Use the sales hub to start a CRM draft with the offer, source, and next step already filled in\./);

  assert.ok(
    crmHtml.indexOf('Sales handoff') < crmHtml.indexOf('Three-touch weekly game'),
    'expected the sales handoff section to appear before the weekly challenge'
  );
});
