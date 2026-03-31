import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('crm detail actions include an email operator outreach handoff', async () => {
  const crmAppJs = await readFile(new URL('../crm/app.js', import.meta.url), 'utf8');

  assert.match(crmAppJs, /function buildEmailOperatorHref\(record = \{\}\)/);
  assert.match(crmAppJs, /params\.set\('draft', '1'\)/);
  assert.match(crmAppJs, /params\.set\('threadId', `crm-\$\{record\.id\}`\)/);
  assert.match(crmAppJs, /params\.set\('recordId', record\.id\)/);
  assert.match(crmAppJs, /params\.set\('source', 'crm'\)/);
  assert.match(crmAppJs, /Queue outreach/);
  assert.match(crmAppJs, /\.\.\/email-operator\/index\.html\?/);
});
