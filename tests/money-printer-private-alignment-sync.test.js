import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultMoneyPrinterState } from '../src/money-printer/moneyPrinterCore.js';
import { ingestMarketPulseCapsuleCandidates } from '../src/money-printer/marketPulseIngest.js';
import { personalizeMarketPulseCapsulePayload } from '../src/money-printer/privateAlignmentRanking.js';
import {
  importLatestMarketPulseCapsules,
  MONEY_PRINTER_STORAGE_KEY,
  readMoneyPrinterState,
} from '../src/money-printer/moneyPrinterStorage.js';

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

function candidate(id, title, buyer, offer) {
  return {
    id: `candidate-${id}`,
    sourceRunId: 'run-sync',
    sourceOpportunityId: id,
    title,
    pain: `${buyer} have a workflow problem.`,
    buyer,
    offer,
    suggestedPrice: '$300 setup',
    evidence: ['paid demand'],
    marketScore: 80,
    profitScore: 80,
    alignmentScore: 50,
    fulfillmentScore: 80,
    capsule: {
      id: `capsule-${id}`,
      sourceId: `experiment-market-pulse-${id}`,
      mode: 'portfolio',
      buyer,
      offer,
      priorityScore: 80,
      status: 'queued',
      budgetCapCents: 0,
      policy: {
        maxAutomatedSpendCents: 0,
        externalWrites: 'approval-required',
        irreversibleActions: 'approval-required',
      },
    },
  };
}

function setupImport({ profileOnce }) {
  const publicPayload = {
    runId: 'run-sync',
    generatedAt: '2099-09-14T16:23:00.000Z',
    candidates: [
      candidate('audio', 'Audio workflow for freelancers', 'audio freelancers', 'Open audio workflow automation'),
      candidate('pools', 'Pool route workflow', 'pool companies', 'Pool route scheduling'),
    ],
  };
  const personalizedPayload = personalizeMarketPulseCapsulePayload(publicPayload, {
    source: 'purpose-map',
    keywords: ['audio', 'freelancers', 'opensource'],
    projects: ['Open audio tools for freelancers'],
    updatedAt: '2099-09-14T18:00:00.000Z',
  });
  const initialState = ingestMarketPulseCapsuleCandidates(
    createDefaultMoneyPrinterState(),
    personalizedPayload,
  ).state;
  const storage = fakeStorage({
    signedIn: 'true',
    [MONEY_PRINTER_STORAGE_KEY]: JSON.stringify(initialState),
  });
  const queueRecord = {
    runId: publicPayload.runId,
    generatedAt: publicPayload.generatedAt,
    candidatesJson: JSON.stringify(publicPayload.candidates),
  };
  let profileReads = 0;

  function makeNode(path = [], account = false) {
    return {
      get(key) { return makeNode([...path, key], account); },
      once(callback) {
        if (account && path.join('/') === 'kernel/alignment-profile-v1') {
          profileReads += 1;
          profileOnce(callback);
        } else if (!account && path.join('/') === '3dvr-portal/growth/market-pulse/venture-capsules/latest') {
          callback(queueRecord);
        } else {
          callback(null);
        }
      },
    };
  }

  const user = {
    is: { pub: 'public-key' },
    _: { sea: { priv: 'private-key' } },
    recall() {},
    get(key) { return makeNode([key], true); },
  };
  const gun = {
    get(key) { return makeNode([key], false); },
    user() { return user; },
  };

  return {
    storage,
    initialState,
    getProfileReads: () => profileReads,
    FakeGun: function FakeGun() { return gun; },
  };
}

const identity = { readSharedIdentity() { return { signedIn: true }; } };
const SEA = { async decrypt() { throw new Error('decrypt should not run without a profile record'); } };

test('transient private-profile timeouts preserve personalized ranking and retry the read', async () => {
  const setup = setupImport({ profileOnce() {} });
  const initialKey = setup.initialState.marketPulseLastPersonalizationKey;
  const initialActive = setup.initialState.experiments.find((item) => item.capsule?.status === 'active')?.id;

  const result = await importLatestMarketPulseCapsules({
    storage: setup.storage,
    GunImpl: setup.FakeGun,
    SEA,
    identity,
    timeoutMs: 10,
    profileRetryCount: 1,
    profileRetryDelayMs: 0,
  });
  const stored = readMoneyPrinterState(setup.storage);
  const storedActive = stored.experiments.find((item) => item.capsule?.status === 'active')?.id;

  assert.equal(setup.getProfileReads(), 2);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'Private alignment temporarily unavailable');
  assert.equal(result.retryRecommended, true);
  assert.equal(stored.marketPulseLastPersonalizationKey, initialKey);
  assert.equal(storedActive, initialActive);
});

test('confirmed missing private profile may intentionally return to public ranking', async () => {
  const setup = setupImport({ profileOnce(callback) { callback(null); } });

  const result = await importLatestMarketPulseCapsules({
    storage: setup.storage,
    GunImpl: setup.FakeGun,
    SEA,
    identity,
    timeoutMs: 10,
    profileRetryCount: 1,
    profileRetryDelayMs: 0,
  });
  const stored = readMoneyPrinterState(setup.storage);

  assert.equal(setup.getProfileReads(), 1);
  assert.equal(result.skipped, false);
  assert.equal(result.personalized, false);
  assert.equal(result.retryRecommended, false);
  assert.equal(stored.marketPulseLastPersonalizationKey, '');
});
