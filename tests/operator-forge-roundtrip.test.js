import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  forgeUrlWithReturn,
  operatorReturnPath,
  requestedOperatorConversation,
  safeOperatorReturn
} from '../operator/forge-roundtrip.js';

test('Operator Forge links carry the active conversation return path', () => {
  assert.equal(
    forgeUrlWithReturn('/forge/record.html?kind=edit&id=task-1', 'conversation-123'),
    '/forge/record.html?kind=edit&id=task-1&returnTo=%2Foperator%2F%3Fconversation%3Dconversation-123'
  );
  assert.equal(operatorReturnPath('conversation-123'), '/operator/?conversation=conversation-123');
  assert.equal(requestedOperatorConversation('?conversation=conversation-123'), 'conversation-123');
});

test('Forge only accepts local Operator return paths', () => {
  assert.equal(
    safeOperatorReturn('?returnTo=%2Foperator%2F%3Fconversation%3Dconversation-123'),
    '/operator/?conversation=conversation-123'
  );
  assert.equal(safeOperatorReturn('?returnTo=https%3A%2F%2Fevil.example%2Foperator%2F'), '/operator/');
  assert.equal(safeOperatorReturn('?returnTo=%2Fforge%2F'), '/operator/');
});

test('Forge surfaces Operator as the primary return navigation', async () => {
  const [forge, record, roundtrip] = await Promise.all([
    readFile(new URL('../forge/index.html', import.meta.url), 'utf8'),
    readFile(new URL('../forge/record.html', import.meta.url), 'utf8'),
    readFile(new URL('../forge/return-to-operator.js', import.meta.url), 'utf8')
  ]);

  assert.match(forge, /data-return-operator>← Operator<\/a>/);
  assert.match(forge, /Back to Operator/);
  assert.match(record, /data-return-operator>← Operator<\/a>/);
  assert.match(record, /data-forge-home>Forge<\/a>/);
  assert.match(roundtrip, /safeOperatorReturn/);
});

test('Operator restores a requested conversation and decorates Forge outcomes', async () => {
  const app = await readFile(new URL('../operator/app.js', import.meta.url), 'utf8');

  assert.match(app, /requestedOperatorConversation\(window\.location\.search\)/);
  assert.match(app, /store\.activeId=requestedConversation/);
  assert.match(app, /forgeUrlWithReturn\(outcome\?\.url\|\|'',store\.activeId\)/);
});
