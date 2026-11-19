import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// Regression: on 2026-11-09 Thomas reported that while the homepage
// Operator was busy he could not type or send his next question at all,
// because setBusy() disabled the input and the submit button for the
// whole turn. The composer must stay live; sends during a turn queue
// visibly and dispatch FIFO when the turn finishes.
test('homepage composer is never disabled while Operator is busy', async () => {
  const client = await read('home-operator.js');

  assert.doesNotMatch(client, /\.disabled\s*=/);
  assert.match(client, /const setBusy = busy => \{/);
  assert.match(client, /input\.placeholder = busy \? 'Operator is working on this page…' : idlePlaceholder/);
});

test('homepage sends during a turn queue visibly and dispatch FIFO', async () => {
  const client = await read('home-operator.js');

  assert.match(client, /let turnInFlight = false;/);
  assert.match(client, /const pendingPrompts = \[\];/);
  assert.match(client, /const queueRegion = installQueueRegion\(\);/);
  assert.match(client, /region\.id = 'homeOperatorQueue';/);
  assert.match(client, /const renderQueue = \(\) => \{/);
  assert.match(client, /badge\.textContent = 'Queued';/);

  // The submit handler queues behind a running turn instead of dropping
  // or blocking the message.
  assert.match(client, /if \(turnInFlight\) \{\n\s*pendingPrompts\.push\(prompt\);\n\s*renderQueue\(\);/);

  // The turn wrapper owns the busy lifecycle and hands off to the next
  // queued prompt in order.
  assert.match(client, /const runTurn = async prompt => \{\n\s*turnInFlight = true;/);
  assert.match(client, /const next = pendingPrompts\.shift\(\);\n\s*if \(next !== undefined\) \{\n\s*renderQueue\(\);\n\s*void runTurn\(next\);/);

  // Queued prompts enter history only when they dispatch, so a queued
  // message is never persisted as sent before its turn runs.
  assert.match(client, /history\.push\(\{ role: 'user', content: prompt \}\);\n\s*persistHistory\(\);\n\s*setBusy\(true\);/);
});

// Regression: the same report said clicking into the composer took
// several clicks, as if something had to load first. Profiling showed
// every window focus re-ran a full history sync (re-read, decrypt,
// merge, rewrite, re-encrypt of the whole store): ~4.8s of long tasks
// after one focus event with a 142-conversation store. Syncs are now
// throttled, no-change syncs skip the rewrite/save, the first sync
// waits for idle, and the composer is wired before Gun/Score startup.
test('homepage history sync cannot stall the composer on focus', async () => {
  const client = await read('home-operator.js');

  assert.match(client, /const SYNC_MIN_INTERVAL_MS = 60_000;/);
  assert.match(client, /if \(startedAt - lastSyncStartedAt < SYNC_MIN_INTERVAL_MS\) return Promise\.resolve\(\);/);
  assert.match(client, /if \(storeSignature\(merged\) === storeSignature\(local\)\) return;/);
  assert.match(client, /window\.requestIdleCallback\(\(\) => \{ void syncHomeHistory\(\); \}, \{ timeout: 2500 \}\);/);

  const submitWiring = client.indexOf("form.addEventListener('submit'");
  const accountInstall = client.lastIndexOf('installAccountStatus();');
  assert.ok(submitWiring > 0, 'submit handler is wired');
  assert.ok(accountInstall > submitWiring, 'account startup runs after the composer is wired');
});
