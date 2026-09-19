import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Campaigns acceptance uses the leased OVH browser lane and never starts a real campaign', async () => {
  const workflow = await readFile(new URL('../.github/workflows/control-bus.yml', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../scripts/ops/campaigns-acceptance.cjs', import.meta.url), 'utf8');

  assert.match(workflow, /campaigns_acceptance/);
  assert.match(workflow, /3dvr-browser-lease acquire general control-bus-campaigns-acceptance/);
  assert.match(workflow, /3dvr-browser-lease release general/);
  assert.match(runner, /#sendTest/);
  assert.match(runner, /scopeKey=gmail-send/);
  assert.match(runner, /createBrowserContext|createIncognitoBrowserContext/);
  assert.match(runner, /setGeolocation/);
  assert.doesNotMatch(runner, /#sendCampaign/);
  assert.doesNotMatch(runner, /Start campaign/i);
});
