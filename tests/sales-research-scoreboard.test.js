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
  assert.match(researchHtml, /Reply and win counts come from the shared CRM touch log, not from status guesses\./);

  assert.match(researchJs, /const GUN_QUEUE_NODE_PATH = \['3dvr-portal', 'sales-training', 'today-queue'\]/);
  assert.match(researchJs, /const CRM_NODE_KEY = '3dvr-crm'/);
  assert.match(researchJs, /const TOUCH_LOG_NODE_PATH = \['3dvr-portal', 'crm-touch-log'\]/);
  assert.match(researchJs, /Market research desk/);
  assert.match(researchJs, /reply-received/);
  assert.match(researchJs, /closed-won/);
  assert.match(researchJs, /itemsJson: serializeQueueForGun\(currentQueue\)/);
  assert.match(researchJs, /const rawJson = typeof data\.itemsJson === 'string' \? data\.itemsJson\.trim\(\) : ''/);
  assert.match(researchJs, /data-queue-playbook-id/);

  assert.match(trainingHtml, /TOUCH_LOG_NODE_PATH = \['3dvr-portal', 'crm-touch-log'\]/);
  assert.match(trainingHtml, /source: String\(item\.source \|\| ''\)\.trim\(\)/);
  assert.match(trainingHtml, /segment: String\(item\.segment \|\| ''\)\.trim\(\)/);
  assert.match(trainingHtml, /touchTypeLabel: 'Outreach sent'/);
  assert.match(trainingHtml, /Reach-Out Desk/);
});
