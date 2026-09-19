import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Campaigns acceptance uses the leased OVH browser lane and never starts a real campaign', async () => {
  const workflow = await readFile(new URL('../.github/workflows/control-bus.yml', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../scripts/ops/campaigns-acceptance.cjs', import.meta.url), 'utf8');

  assert.match(workflow, /campaigns_acceptance/);
  assert.match(workflow, /3dvr-browser-lease acquire general control-bus-campaigns-acceptance/);
  assert.match(workflow, /3dvr-browser-lease acquire training control-bus-campaigns-acceptance/);
  assert.match(workflow, /3dvr-browser-lane@training\.service/);
  assert.match(workflow, /SKIP_GMAIL/);
  assert.match(runner, /SKIP_GMAIL/);
  assert.match(workflow, /3dvr-browser-lease release general/);
  assert.match(runner, /#sendTest/);
  assert.match(runner, /scopeKey=gmail-send/);
  assert.match(runner, /createBrowserContext|createIncognitoBrowserContext/);
  assert.match(runner, /setGeolocation/);
  assert.doesNotMatch(runner, /#sendCampaign/);
  assert.doesNotMatch(runner, /Start campaign/i);

  const userRunner = await readFile(new URL('../scripts/ops/campaigns-user-acceptance.cjs', import.meta.url), 'utf8');
  assert.match(workflow, /campaigns_user_acceptance/);
  assert.match(workflow, /3dvr-browser-lease acquire general control-bus-campaigns-user-acceptance/);
  assert.match(userRunner, /#sendTest/);
  assert.match(userRunner, /scopeKey=gmail-send/);
  assert.match(userRunner, /settleAfterNavigationAction/);
  assert.match(userRunner, /safeEvaluate/);
  assert.match(userRunner, /homeBadge/);
  assert.match(userRunner, /usedTemporarySenderDetails/);
  assert.match(userRunner, /123 Main St, San Diego, CA 92101/);
  assert.match(userRunner, /execution context was destroyed/);
  assert.match(workflow, /raw\.githubusercontent\.com\/tmsteph\/3dvr-portal\/main\/scripts\/ops\/campaigns-user-acceptance\.cjs/);
  assert.match(userRunner, /campaignsOk/);
  assert.doesNotMatch(userRunner, /#sourceAck/);
  assert.doesNotMatch(userRunner, /#sendCampaign/);
  assert.match(workflow, /campaigns_gmail_handoff/);
  assert.match(workflow, /Campaigns Gmail OAuth/);
  assert.match(workflow, /--origin https:\/\/accounts\.google\.com/);
  assert.match(workflow, /3dvr-browser-lease acquire general control-bus-campaigns-gmail-prep/);
});
