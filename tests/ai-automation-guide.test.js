import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const page = await readFile(new URL('../guides/ai-automation/index.html', import.meta.url), 'utf8');

test('AI automation guide teaches the intended setup order', () => {
  const gmail = page.indexOf('Connect Gmail');
  const desktop = page.indexOf('Connect Remote Desktop Commander');
  const mission = page.indexOf('Give the AI a setup mission');
  const browser = page.indexOf('Let it install agent-browser');
  const bitwarden = page.indexOf('Add Bitwarden');
  const scheduled = page.indexOf('Add Scheduled Tasks');
  assert.ok(gmail < desktop && desktop < mission && mission < browser && browser < bitwarden && bitwarden < scheduled);
});

test('AI automation guide keeps the stack portable', () => {
  assert.match(page, /ChatGPT or Claude/);
  assert.match(page, /Claude Free can use connectors/);
  assert.match(page, /direct connector first → browser automation second/);
  assert.match(page, /Do not hard-code passwords or secrets/);
  assert.match(page, /npm install -g agent-browser/);
  assert.match(page, /three active scheduled tasks/);
  assert.match(page, /Event-triggered tasks/);
});
