import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('invite simulator prepares unsigned local draft artifacts only', async () => {
  const [ui, focusUi] = await Promise.all([
    read('assembly/invite-ui.js'),
    read('assembly/focus-ui.js'),
  ]);

  assert.match(ui, /Unsigned draft — this cannot authorize access\./);
  assert.match(ui, /createWorkspaceInvite/);
  assert.match(ui, /local-owner:\$\{state\.workspace\.id\}/);
  assert.match(ui, /assembly-invite-draft\.json/);
  assert.doesNotMatch(ui, /sealWorkspaceInvite/);
  assert.doesNotMatch(ui, /fetch\(/);
  assert.doesNotMatch(ui, /WebSocket/);
  assert.match(focusUi, /import '\.\/invite-ui\.js';/);
});
