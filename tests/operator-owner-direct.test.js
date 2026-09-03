import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { forgeEditId } from '../operator/forge-status.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Forge edit id is recovered from the Operator status URL', () => {
  assert.equal(
    forgeEditId('/forge/record.html?kind=edit&id=operator-task-123'),
    'operator-task-123'
  );
});

test('Operator owner edits wait for Forge instead of duplicating into a second queue', () => {
  const source = read('operator/actions.js');
  assert.match(source, /waitForForgeEdit\(forgeOutcome\.url\)/);
  assert.match(source, /Commit and push the completed change to GitHub/);
  assert.doesNotMatch(source, /queueOperatorAgentEdit/);
});

test('Operator passes verified developer access into code actions', () => {
  const source = read('operator/app.js');
  assert.match(source, /runOperatorAction\(data\.action,\{developerAccess:data\.developerAccess\}\)/);
  assert.match(source, /response\.status===429/);
});

test('Operator page mounts portal feedback after the main app', () => {
  const source = read('operator/index.html');
  const mainEnd = source.indexOf('</main>');
  const footer = source.indexOf('<footer aria-label="Portal feedback"></footer>');
  assert.ok(mainEnd >= 0 && footer > mainEnd);
});
