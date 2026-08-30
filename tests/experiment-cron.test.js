import assert from 'node:assert/strict';
import test from 'node:test';
import { runExperimentCronCycle } from '../src/growth/experiment-cron.js';
import { AV_FREELANCE_HERO_EXPERIMENT } from '../src/growth/experiments.js';

function createEvents() {
  const events = {};
  for (const variant of ['ownership', 'outcome']) {
    for (let index = 0; index < 100; index += 1) {
      events[`${variant}-view-${index}`] = {
        id: `${variant}-view-${index}`,
        experimentId: AV_FREELANCE_HERO_EXPERIMENT.id,
        page: AV_FREELANCE_HERO_EXPERIMENT.page,
        variant,
        eventType: 'view',
        visitorId: `${variant}-visitor-${index}`,
      };
    }
  }
  for (let index = 0; index < 20; index += 1) {
    events[`ownership-conversion-${index}`] = {
      id: `ownership-conversion-${index}`,
      experimentId: AV_FREELANCE_HERO_EXPERIMENT.id,
      page: AV_FREELANCE_HERO_EXPERIMENT.page,
      variant: 'ownership',
      eventType: 'work-agent-open',
      visitorId: `ownership-visitor-${index}`,
    };
  }
  for (let index = 0; index < 8; index += 1) {
    events[`outcome-conversion-${index}`] = {
      id: `outcome-conversion-${index}`,
      experimentId: AV_FREELANCE_HERO_EXPERIMENT.id,
      page: AV_FREELANCE_HERO_EXPERIMENT.page,
      variant: 'outcome',
      eventType: 'work-agent-open',
      visitorId: `outcome-visitor-${index}`,
    };
  }
  return events;
}

function createClient(definition = AV_FREELANCE_HERO_EXPERIMENT) {
  const writes = [];
  return {
    writes,
    client: {
      async readConfig() {
        return { autoMode: true, winner: '', winnerReason: '', updatedAt: '', updatedBy: '' };
      },
      async readEvents() {
        return createEvents(definition);
      },
      async writeConfig(value) {
        writes.push(value);
      },
    },
  };
}

test('generic experiment cron promotes a statistically supported low-risk winner', async () => {
  const { client, writes } = createClient();
  const result = await runExperimentCronCycle(AV_FREELANCE_HERO_EXPERIMENT, {
    client,
    now: () => '2026-08-30T02:00:00.000Z',
  });
  assert.equal(result.action, 'promoted');
  assert.equal(result.promoted, true);
  assert.equal(result.winnerAfter, 'ownership');
  assert.equal(writes.length, 1);
  assert.equal(writes[0].updatedBy, 'growth-cron');
});

test('generic experiment cron refuses to auto-promote pricing experiments', async () => {
  const { client, writes } = createClient();
  const result = await runExperimentCronCycle(
    { ...AV_FREELANCE_HERO_EXPERIMENT, riskClass: 'pricing' },
    { client }
  );
  assert.equal(result.action, 'approval-required');
  assert.equal(result.promoted, false);
  assert.equal(writes.length, 0);
});
