import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('outreach CRM connects profiles, potential messages, and sent touches through Gun', async () => {
  const salesHubHtml = await readFile(new URL('../sales/index.html', import.meta.url), 'utf8');
  const crmHtml = await readFile(new URL('../crm/index.html', import.meta.url), 'utf8');
  const scoreboardHtml = await readFile(new URL('../sales/scoreboard.html', import.meta.url), 'utf8');
  const outreachHtml = await readFile(new URL('../sales/outreach.html', import.meta.url), 'utf8');
  const outreachJs = await readFile(new URL('../sales/outreach.js', import.meta.url), 'utf8');

  assert.match(salesHubHtml, /Outreach CRM/);
  assert.match(crmHtml, /Outreach CRM/);
  assert.match(scoreboardHtml, /Outreach CRM/);

  assert.match(outreachHtml, /Customer profiles/);
  assert.match(outreachHtml, /Potential messages/);
  assert.match(outreachHtml, /Messages sent/);
  assert.match(outreachHtml, /id="artifactForm"/);
  assert.match(outreachHtml, /type="file" multiple accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(outreachHtml, /type="module" src="\/sales\/outreach\.js"/);
  assert.match(outreachHtml, /https:\/\/cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(outreachHtml, /\/gun-init\.js/);

  assert.match(outreachJs, /const CRM_NODE_KEY = '3dvr-crm'/);
  assert.match(outreachJs, /const TOUCH_LOG_NODE_PATH = \['3dvr-portal', 'crm-touch-log'\]/);
  assert.match(outreachJs, /const OUTREACH_ARTIFACT_NODE_PATH = \['3dvr', 'crm', 'outreach-artifacts'\]/);
  assert.match(outreachJs, /touchType: 'outreach-sent'/);
  assert.match(outreachJs, /artifactId/);
  assert.match(outreachJs, /attachmentsJson/);
  assert.match(outreachJs, /readAsDataURL/);
  assert.match(outreachJs, /data:\$\{mime\};base64/);
});
