import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const operatorDir = new URL('../growth-operator/', import.meta.url);

test('growth operator exposes simple campaign presets for common money paths', async () => {
  const html = await readFile(new URL('index.html', operatorDir), 'utf8');
  const js = await readFile(new URL('campaigns.js', operatorDir), 'utf8');

  assert.match(html, /What do you want to get paid for\?/);
  assert.match(html, /data-campaign="av-freelance"/);
  assert.match(html, /data-campaign="web-design"/);
  assert.match(html, /data-campaign="lead-generation"/);
  assert.match(html, /data-campaign="market-research"/);
  assert.match(html, /data-campaign="my-skill"/);
  assert.match(html, /id="campaignFindButton"/);
  assert.match(html, /type="module" src="campaigns\.js"/);

  assert.match(js, /CAMPAIGN_PRESETS = Object\.freeze/);
  assert.match(js, /'av-freelance'/);
  assert.match(js, /'web-design'/);
  assert.match(js, /'lead-generation'/);
  assert.match(js, /'market-research'/);
  assert.match(js, /'my-skill'/);
});

test('campaign research reuses the existing CRM and outbound pipeline with conservative outreach rules', async () => {
  const js = await readFile(new URL('campaigns.js', operatorDir), 'utf8');

  assert.match(js, /maximum 10 prospects/);
  assert.match(js, /Research public information only/);
  assert.match(js, /Never guess or synthesize email addresses/);
  assert.match(js, /Do not mass email or blast generic lists/);
  assert.match(js, /existing campaign caps/);
  assert.match(js, /unified 3dvr-crm records/);
  assert.match(js, /existing Growth Operator \/ outreach pipeline/);
  assert.match(js, /agentOps'\)\.get\(AGENT_OWNER_ALIAS\)\.get\('taskQueue'/);
});

test('my skill campaign carries Launch Room context into the money path', async () => {
  const js = await readFile(new URL('campaigns.js', operatorDir), 'utf8');
  const modes = await readFile(new URL('../launch-room/modes.js', import.meta.url), 'utf8');

  assert.match(js, /3dvr\.launch-room\.movement-brief\.v1/);
  assert.match(js, /function loadLaunchRoomBrief/);
  assert.match(js, /First audience:/);
  assert.match(js, /Tiny first project:/);
  assert.match(js, /setCampaignSeed/);
  assert.match(js, /campaignSeed = 'false'/);
  assert.match(modes, /Make this earn money/);
  assert.match(modes, /growth-operator\/\?campaign=my-skill/);
});
