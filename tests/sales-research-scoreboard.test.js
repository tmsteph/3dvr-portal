import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('sales research desk wires the shared queue and live segment scoreboard', async () => {
  const researchHtml = await readFile(new URL('../sales/research.html', import.meta.url), 'utf8');
  const researchJs = await readFile(new URL('../sales/research.js', import.meta.url), 'utf8');
  const trainingHtml = await readFile(new URL('../sales/training/index.html', import.meta.url), 'utf8');

  assert.match(researchHtml, /https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(researchHtml, /\/gun-init\.js/);
  assert.match(researchHtml, /\/sales\/research\.js/);
  assert.match(researchHtml, /Queue opener/);
  assert.match(researchHtml, /researchQueueStatus/);
  assert.match(researchHtml, /Live Segment Scoreboard/);
  assert.match(researchHtml, /Watch which segment actually moves in CRM/);
  assert.match(researchHtml, /Engaged is a reply proxy based on CRM status beyond awareness, lead, and prospect\./);

  assert.match(researchJs, /const GUN_QUEUE_NODE_PATH = \['3dvr-portal', 'sales-training', 'today-queue'\]/);
  assert.match(researchJs, /const CRM_NODE_KEY = '3dvr-crm'/);
  assert.match(researchJs, /Market research desk/);
  assert.match(researchJs, /Warm - Awareness/);
  assert.match(researchJs, /String\(record\.status \|\| ''\)\.trim\(\) === 'Won'/);
  assert.match(researchJs, /data-queue-playbook-id/);

  assert.match(trainingHtml, /source: String\(item\.source \|\| ''\)\.trim\(\)/);
  assert.match(trainingHtml, /segment: String\(item\.segment \|\| ''\)\.trim\(\)/);
  assert.match(trainingHtml, /Reach-Out Desk/);
});
