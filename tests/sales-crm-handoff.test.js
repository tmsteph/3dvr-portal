import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales hub routes offers into prefilled CRM drafts', async () => {
  const salesHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');
  const crmHtml = await readFile(new URL('../crm/index.html', import.meta.url), 'utf8');

  assert.match(salesHtml, /Today&apos;s close/);
  assert.match(salesHtml, /Draft CRM/);
  assert.match(salesHtml, /\.\.\/crm\/\?draft=1&lead=Builder%20follow-up/);
  assert.match(salesHtml, /\.\.\/crm\/\?draft=1&lead=Embedded%20follow-up/);
  assert.match(salesHtml, /\.\.\/crm\/\?draft=1&lead=Custom%20project%20follow-up/);

  assert.match(crmHtml, /Sales handoff/);
  assert.match(crmHtml, /Builder draft/);
  assert.match(crmHtml, /Embedded draft/);
  assert.match(crmHtml, /Custom draft/);
  assert.match(crmHtml, /fillCrmCreateForm/);
  assert.match(crmHtml, /const draftFromParams = \{/);
  assert.match(crmHtml, /openCrmCreateOverlay\(draftFromParams\)/);
  assert.match(crmHtml, /Use the sales hub to start a CRM draft with the offer, source, and next step already filled in\./);

  assert.ok(
    crmHtml.indexOf('Sales handoff') < crmHtml.indexOf('Three-touch weekly game'),
    'expected the sales handoff section to appear before the weekly challenge'
  );
});
