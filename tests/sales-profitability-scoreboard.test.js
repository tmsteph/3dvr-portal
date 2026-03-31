import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('profitability desk ties the roadmap to the live sales system', async () => {
  const salesHubHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');
  const researchHtml = await readFile(new URL('../sales/research.html', import.meta.url), 'utf8');
  const scoreboardHtml = await readFile(new URL('../sales/scoreboard.html', import.meta.url), 'utf8');
  const scoreboardJs = await readFile(new URL('../sales/scoreboard.js', import.meta.url), 'utf8');

  assert.match(salesHubHtml, /Profitability/);
  assert.match(salesHubHtml, /Open profitability desk/);
  assert.match(researchHtml, /Open profitability desk/);
  assert.match(researchHtml, /Run the profitability week/);

  assert.match(scoreboardHtml, /Profitability Desk/);
  assert.match(scoreboardHtml, /Weekly operator view/);
  assert.match(scoreboardHtml, /See the week in one screen\./);
  assert.match(scoreboardHtml, /data-live-metric="outreach"/);
  assert.match(scoreboardHtml, /data-live-metric="replies"/);
  assert.match(scoreboardHtml, /data-live-metric="wins"/);
  assert.match(scoreboardHtml, /data-live-metric="queueOpen"/);
  assert.match(scoreboardHtml, /data-live-metric="deposits"/);
  assert.match(scoreboardHtml, /data-live-metric="builderCustomers"/);
  assert.match(scoreboardHtml, /data-live-metric="embeddedCustomers"/);
  assert.match(scoreboardHtml, /data-live-metric="mrr"/);
  assert.match(scoreboardHtml, /Save weekly plan/);
  assert.match(scoreboardHtml, /One product move/);
  assert.match(scoreboardHtml, /One revenue move/);
  assert.match(scoreboardHtml, /One system move/);
  assert.match(scoreboardHtml, /Builder MRR \+ Embedded MRR/);
  assert.match(scoreboardHtml, /\/sales\/scoreboard\.js/);
  assert.match(scoreboardHtml, /https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(scoreboardHtml, /\/gun-init\.js/);

  assert.match(scoreboardJs, /const GUN_QUEUE_NODE_PATH = \['3dvr-portal', 'sales-training', 'today-queue'\]/);
  assert.match(scoreboardJs, /const TOUCH_LOG_NODE_PATH = \['3dvr-portal', 'crm-touch-log'\]/);
  assert.match(scoreboardJs, /const SCOREBOARD_NODE_PATH = \['3dvr-portal', 'sales-scoreboard', 'weekly'\]/);
  assert.match(scoreboardJs, /reply-received/);
  assert.match(scoreboardJs, /closed-won/);
  assert.match(scoreboardJs, /const estimatedMrr = \(plan\.builderCustomers \* 50\) \+ \(plan\.embeddedCustomers \* 200\)/);
  assert.match(scoreboardJs, /Shared weekly ledger saved for/);
});
