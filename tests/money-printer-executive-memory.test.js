import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  appendExecutiveDecision,
  appendExecutiveFeedback,
  ensureMoneyPrinterWorkspace,
  loadMoneyPrinterWorkspace,
  saveExecutiveProfile
} from '../src/money-printer/moneyPrinterFileStorage.js';
import {
  createDefaultExecutiveProfile,
  formatExecutiveProfile
} from '../src/money-printer/moneyPrinterExecutiveMemory.js';
import { buildStatePayload } from '../src/money-printer/moneyPrinterModelProvider.js';

test('initializes a persistent 3DVR executive constitution', async () => {
  const root = await mkdtemp(path.join(tmpdir(), '3dvr-executive-'));
  try {
    const { paths } = await ensureMoneyPrinterWorkspace(root);
    const profile = JSON.parse(await readFile(paths.executivePath, 'utf8'));

    assert.equal(profile.name, '3DVR Executive Constitution');
    assert.match(profile.currentDirection, /useful enough to run real work/i);
    assert.equal(profile.taste.some(item => /glanceable/i.test(item)), true);
    assert.equal(profile.antiPatterns.some(item => /activity.*progress/i.test(item)), true);
    assert.equal(profile.authority.red.includes('Never execute unattended'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('founder feedback and executive decisions persist and enter model context', async () => {
  const root = await mkdtemp(path.join(tmpdir(), '3dvr-executive-'));
  try {
    await ensureMoneyPrinterWorkspace(root);
    const profile = createDefaultExecutiveProfile();
    profile.currentDirection = 'Make the CRM obvious enough to use without instructions.';
    await saveExecutiveProfile(root, profile);
    await appendExecutiveFeedback(root, {
      kind: 'prefer',
      text: 'One obvious action per screen.',
      reason: 'The interface should be understandable at a glance.'
    });
    await appendExecutiveFeedback(root, {
      kind: 'avoid',
      text: 'Do not add explanatory copy when layout can carry the meaning.'
    });
    await appendExecutiveDecision(root, {
      decision: 'Polish the existing CRM flow before adding another app.',
      why: 'It compounds an existing business workflow and reduces fragmentation.',
      nextAction: 'User-test the CRM primary flow.',
      confidence: 0.86,
      whatNotToDo: ['Do not start a replacement CRM.']
    });

    const loaded = await loadMoneyPrinterWorkspace(root);
    const payload = buildStatePayload(loaded.state);

    assert.equal(loaded.executiveFeedback.length, 2);
    assert.equal(loaded.executiveDecisions.length, 1);
    assert.equal(payload.executiveProfile.currentDirection, profile.currentDirection);
    assert.match(payload.executiveFeedback[0].text, /one obvious action/i);
    assert.match(payload.executiveDecisions[0].decision, /Polish the existing CRM/i);
    assert.match(formatExecutiveProfile(loaded.executiveProfile), /Current direction: Make the CRM obvious/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
