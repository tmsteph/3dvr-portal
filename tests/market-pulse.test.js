import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMarketPulse,
  deserializeMarketPulseFromGun,
  runMarketPulseCycle,
  serializeMarketPulseForGun,
} from '../src/growth/market-pulse.js';

const demand = {
  keywords: ['lead follow up'],
  warnings: [],
  signals: [
    {
      id: 'signal-1',
      source: 'reddit:r/smallbusiness',
      title: 'Client follow-up keeps falling through the cracks',
      summary: 'Owner operators need a simple reminder and quote workflow.',
      url: 'https://example.com/signal-1',
      popularity: 88,
      comments: 35,
      keyword: 'lead follow up',
    },
  ],
};

test('buildMarketPulse creates approved directory data while gating outreach', () => {
  const pulse = buildMarketPulse(demand, {
    generatedAt: '2026-05-14T10:00:00.000Z',
    runId: 'market-pulse-test',
    market: 'local service businesses',
    keywords: ['lead follow up'],
  });

  assert.equal(pulse.runId, 'market-pulse-test');
  assert.equal(pulse.signalsAnalyzed, 1);
  assert.ok(pulse.marketFit.score > 0);
  assert.match(pulse.marketFit.nextAction, /social probe|keyword/i);
  assert.equal(pulse.directoryListings.length, 1);
  assert.equal(pulse.directoryListings[0].approved, true);
  assert.equal(pulse.outreachDrafts[0].approvalStatus, 'required');
  assert.ok(pulse.socialProbeDrafts.some((item) => item.channel === 'reddit'));
  assert.ok(pulse.socialProbeDrafts.some((item) => item.channel === 'facebook-groups'));
  assert.ok(pulse.socialProbeDrafts.some((item) => item.channel === 'tiktok-comments'));
  assert.ok(pulse.socialProbeDrafts.every((item) => item.approvalStatus === 'required' || item.risk === 'external_read'));
  assert.equal(pulse.reactionSnapshots[0].channel, 'reddit');
  assert.ok(pulse.reactionSnapshots[0].marketFitScore > 0);
  assert.equal(pulse.outreachDrafts[0].risk, 'external_write');
  assert.match(pulse.automationPolicy.outreach, /requires human approval/i);
  assert.match(pulse.automationPolicy.socialPosting, /human approval/i);
});

test('market pulse gun serialization keeps dashboard arrays recoverable', () => {
  const pulse = buildMarketPulse(demand, {
    generatedAt: '2026-05-14T10:00:00.000Z',
    runId: 'market-pulse-test',
  });
  const serialized = serializeMarketPulseForGun(pulse);
  const restored = deserializeMarketPulseFromGun(serialized);

  assert.equal(serialized.runId, 'market-pulse-test');
  assert.equal(restored.directoryListings.length, 1);
  assert.equal(restored.outreachDrafts.length, 1);
  assert.equal(restored.socialProbeDrafts.length > 0, true);
  assert.equal(restored.reactionSnapshots.length, 1);
  assert.equal(restored.marketFit.verdict.length > 0, true);
  assert.equal(restored.tests.length, 2);
  assert.match(restored.automationPolicy.marketResearch, /runner|scheduler/i);
});

test('runMarketPulseCycle writes approved listings through the injected client', async () => {
  const writes = [];
  const result = await runMarketPulseCycle({
    demand,
    client: {
      async writePulse(pulse) {
        writes.push(pulse);
        return {
          runId: pulse.runId,
          directoryListingsPublished: pulse.directoryListings.filter((item) => item.approved).length,
        };
      },
    },
    now: () => new Date('2026-05-14T12:00:00.000Z'),
  });

  assert.equal(writes.length, 1);
  assert.equal(result.persist.directoryListingsPublished, 1);
  assert.equal(result.dryRun, false);
});

test('runMarketPulseCycle dry run skips persistence', async () => {
  const result = await runMarketPulseCycle({
    demand,
    dryRun: true,
    now: () => new Date('2026-05-14T12:00:00.000Z'),
  });

  assert.equal(result.persist.skipped, true);
  assert.equal(result.persist.reason, 'dry run');
});
