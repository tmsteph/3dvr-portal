import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createLaunchRoomAlignmentRuntime } from '../launch-room/alignment-sync.js';

test('Launch Room starts the alignment contribution runtime from its existing module entrypoint', async () => {
  const source = await readFile(new URL('../launch-room/mobile-flow.js', import.meta.url), 'utf8');
  assert.match(source, /import ['"]\.\/alignment-sync\.js['"]/);
});

test('signed-out Launch Room stays local and does not load account runtime scripts', async () => {
  let appendedScripts = 0;
  const windowObj = {
    localStorage: {
      getItem() { return null; }
    },
    AuthIdentity: {
      readSharedIdentity() { return { signedIn: false }; }
    },
    document: {
      scripts: [],
      head: { appendChild() { appendedScripts += 1; } },
      createElement() { return {}; }
    },
    setTimeout
  };

  const runtime = await createLaunchRoomAlignmentRuntime({ windowObj });
  assert.equal(runtime.available, false);
  assert.equal(appendedScripts, 0);
});

test('Launch Room alignment module only writes through encrypted Alignment Profile sync', async () => {
  const source = await readFile(new URL('../launch-room/alignment-sync.js', import.meta.url), 'utf8');
  assert.match(source, /createAlignmentProfileSync/);
  assert.match(source, /buildAlignmentProfileFromLaunchRoomState/);
  assert.doesNotMatch(source, /gun\.get\(/);
});
