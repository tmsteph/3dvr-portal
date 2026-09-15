import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeAlignmentProfile } from '../src/kernel/alignmentProfile.js';
import { buildMarketPulseCapsuleCandidates, serializeMarketPulseCapsuleCandidates } from '../src/growth/market-pulse-capsules.js';
import { createDefaultMoneyPrinterState } from '../src/money-printer/moneyPrinterCore.js';
import { ingestMarketPulseCapsuleCandidates } from '../src/money-printer/marketPulseIngest.js';
import {
  alignmentPersonalizationKey,
  personalizeMarketPulseCapsulePayload,
  personalizeMarketPulseCandidate,
} from '../src/money-printer/privateAlignmentRanking.js';
import { importLatestMarketPulseCapsules, readMoneyPrinterState } from '../src/money-printer/moneyPrinterStorage.js';

function profile(updatedAt = '2099-09-14T18:00:00.000Z') {
  return normalizeAlignmentProfile({
    source: 'purpose-map',
    keywords: ['audio', 'freelancers', 'opensource'],
    projects: ['Open audio tools for freelancers'],
    updatedAt,
  });
}

function candidate({
  id,
  title,
  pain,
  buyer,
  offer,
  priorityScore = 80,
  alignmentScore = 50,
  mode = 'portfolio',
} = {}) {
  return {
    id: `candidate-${id}`,
    sourceRunId: 'run-1',
    sourceOpportunityId: id,
    title,
    pain,
    buyer,
    offer,
    suggestedPrice: '$300 setup',
    evidence: ['paid demand'],
    marketScore: 80,
    profitScore: 80,
    alignmentScore,
    fulfillmentScore: 80,
    capsule: {
      id: `capsule-${id}`,
      sourceId: `experiment-market-pulse-${id}`,
      mode,
      buyer,
      offer,
      priorityScore,
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

function payload(candidates, personalizationKey = '') {
  return {
    runId: 'run-1',
    generatedAt: '2099-09-14T16:23:00.000Z',
    personalizationKey,
    candidates,
  };
}

function fakeStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
    removeItem(key) { values.delete(key); },
  };
}

test('private alignment raises matching portfolio work and lowers unrelated work without exposing the profile', () => {
  const aligned = candidate({
    id: 'audio',
    title: 'Audio workflow for freelancers',
    pain: 'Freelance audio engineers lose time between disconnected tools.',
    buyer: 'audio freelancers',
    offer: 'Open audio workflow automation',
  });
  const unrelated = candidate({
    id: 'pools',
    title: 'Pool route workflow',
    pain: 'Pool cleaners need route optimization.',
    buyer: 'pool cleaning companies',
    offer: 'Route scheduling automation',
  });
  const personalized = personalizeMarketPulseCapsulePayload(payload([aligned, unrelated]), profile());

  assert.ok(personalized.personalizationKey);
  assert.ok(personalized.candidates[0].alignmentScore > personalized.candidates[1].alignmentScore);
  assert.ok(personalized.candidates[0].capsule.priorityScore > 80);
  assert.ok(personalized.candidates[1].capsule.priorityScore < 80);
  assert.equal('keywords' in personalized.candidates[0], false);
  assert.equal(JSON.stringify(personalized).includes('Open audio tools for freelancers'), false);
});

test('zero-score opportunities stay zero and Profit mode only lightly reacts to private alignment', () => {
  const alignedPortfolio = candidate({
    id: 'aligned-portfolio',
    title: 'Audio tools for freelancers',
    buyer: 'audio freelancers',
    offer: 'Open audio tools',
    priorityScore: 80,
    mode: 'portfolio',
  });
  const alignedProfit = candidate({
    ...alignedPortfolio,
    id: 'aligned-profit',
    priorityScore: 80,
    mode: 'profit',
  });
  const zero = candidate({
    ...alignedPortfolio,
    id: 'zero',
    priorityScore: 0,
  });

  const portfolioResult = personalizeMarketPulseCandidate(alignedPortfolio, profile());
  const profitResult = personalizeMarketPulseCandidate(alignedProfit, profile());
  const zeroResult = personalizeMarketPulseCandidate(zero, profile());

  assert.ok(portfolioResult.capsule.priorityScore > profitResult.capsule.priorityScore);
  assert.equal(zeroResult.capsule.priorityScore, 0);
});

test('the same public run can be re-ranked when a newer private profile becomes available', () => {
  const aligned = candidate({
    id: 'audio',
    title: 'Audio workflow for freelancers',
    buyer: 'audio freelancers',
    offer: 'Open audio workflow automation',
  });
  const unrelated = candidate({
    id: 'pools',
    title: 'Pool route workflow',
    buyer: 'pool companies',
    offer: 'Pool route scheduling',
  });
  const publicPayload = payload([aligned, unrelated]);
  const first = ingestMarketPulseCapsuleCandidates(createDefaultMoneyPrinterState(), publicPayload);
  const personalizedPayload = personalizeMarketPulseCapsulePayload(publicPayload, profile());
  const second = ingestMarketPulseCapsuleCandidates(first.state, personalizedPayload);
  const active = second.state.experiments.find((item) => item.capsule?.status === 'active');

  assert.equal(first.skipped, false);
  assert.equal(second.skipped, false);
  assert.equal(second.state.marketPulseLastImportedRunId, 'run-1');
  assert.equal(second.state.marketPulseLastPersonalizationKey, alignmentPersonalizationKey(profile()));
  assert.equal(active.id, 'experiment-market-pulse-audio');
});

test('signed-in browser import decrypts the Alignment Profile before allocating Market Pulse capsules', async () => {
  const source = {
    runId: 'browser-private-run',
    generatedAt: '2099-09-14T16:23:00.000Z',
    profile: { searchMode: 'portfolio' },
    opportunities: [
      {
        id: 'audio',
        title: 'Audio workflow for freelancers',
        problem: 'Freelance audio engineers lose time between tools.',
        audience: 'audio freelancers',
        solution: 'Open audio workflow automation',
        suggestedPrice: '$300 setup',
        score: 80,
        marketScore: 80,
        profitScore: 80,
        alignmentScore: 50,
        fulfillmentScore: 80,
      },
      {
        id: 'pools',
        title: 'Pool route workflow',
        problem: 'Pool routes are inefficient.',
        audience: 'pool companies',
        solution: 'Pool route scheduling',
        suggestedPrice: '$300 setup',
        score: 80,
        marketScore: 80,
        profitScore: 80,
        alignmentScore: 50,
        fulfillmentScore: 80,
      },
    ],
  };
  const queueRecord = serializeMarketPulseCapsuleCandidates(source, buildMarketPulseCapsuleCandidates(source));
  const alignmentRecord = { ciphertext: 'encrypted-profile' };
  const storage = fakeStorage({ signedIn: 'true' });

  function makeNode(path = [], account = false) {
    return {
      get(key) { return makeNode([...path, key], account); },
      once(callback) {
        if (account && path.join('/') === 'kernel/alignment-profile-v1') callback(alignmentRecord);
        else if (!account && path.join('/') === '3dvr-portal/growth/market-pulse/venture-capsules/latest') callback(queueRecord);
        else callback(null);
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
  function FakeGun() { return gun; }
  const SEA = {
    async decrypt(ciphertext) {
      assert.equal(ciphertext, 'encrypted-profile');
      return JSON.stringify(profile());
    },
  };

  const result = await importLatestMarketPulseCapsules({
    storage,
    GunImpl: FakeGun,
    SEA,
    identity: { readSharedIdentity() { return { signedIn: true }; } },
    timeoutMs: 50,
  });
  const stored = readMoneyPrinterState(storage);
  const active = stored.experiments.find((item) => item.capsule?.status === 'active');

  assert.equal(result.personalized, true);
  assert.equal(active.id, 'experiment-market-pulse-audio');
  assert.ok(stored.marketPulseLastPersonalizationKey);
  assert.equal(JSON.stringify(stored).includes('contributions'), false);
  assert.equal(JSON.stringify(stored).includes('projects\":['), false);
});
