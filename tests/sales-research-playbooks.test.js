import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales research desk includes segment playbooks and richer CRM draft context', async () => {
  const researchHtml = await readFile(new URL('../sales/research.html', import.meta.url), 'utf8');
  const crmAppJs = await readFile(new URL('../crm/app.js', import.meta.url), 'utf8');

  assert.match(researchHtml, /Outreach Playbooks/);
  assert.match(researchHtml, /Copy opener/);
  assert.match(researchHtml, /Copy full playbook/);
  assert.match(researchHtml, /data-copy-playbook-id="professional-services-opener"/);
  assert.match(researchHtml, /data-copy-playbook-id="local-service-opener"/);
  assert.match(researchHtml, /data-copy-playbook-id="support-team-opener"/);
  assert.match(researchHtml, /segment=Creative%20studio%20or%20agency/);
  assert.match(researchHtml, /segment=Owner-led%20service%20business/);
  assert.match(researchHtml, /segment=Educator%20or%20community%20org/);
  assert.match(researchHtml, /signal=High%20formation%20plus%20customer-growth%20pain/);
  assert.match(researchHtml, /experiment=Send%2010%20professional-service%20Builder%20notes/);
  assert.match(researchHtml, /playbookCopyStatus/);

  assert.match(crmAppJs, /lead: \(params\.get\('lead'\) \|\| ''\)\.trim\(\)/);
  assert.match(crmAppJs, /marketSegment: \(params\.get\('segment'\) \|\| ''\)\.trim\(\)/);
  assert.match(crmAppJs, /primaryPain: \(params\.get\('pain'\) \|\| ''\)\.trim\(\)/);
  assert.match(crmAppJs, /offerAmount: \(params\.get\('offer'\) \|\| params\.get\('amount'\) \|\| ''\)\.trim\(\)/);
  assert.match(crmAppJs, /lastSignal: \(params\.get\('signal'\) \|\| ''\)\.trim\(\)/);
  assert.match(crmAppJs, /nextExperiment: \(params\.get\('experiment'\) \|\| ''\)\.trim\(\)/);
  assert.match(crmAppJs, /Object\.values\(draft\)\.some\(value => Boolean\(value\)\)/);
  assert.match(crmAppJs, /name: draft\.lead \|\| draft\.name/);
});
