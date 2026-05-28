import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  buildMarketPulseRunOptions,
  parseMarketPulseArgs,
  runMarketPulseCli,
} from '../src/growth/market-pulse-runner.js';

test('parseMarketPulseArgs reads automation options', () => {
  const parsed = parseMarketPulseArgs([
    '--market',
    'service businesses',
    '--keywords',
    'lead follow up,client onboarding',
    '--channels',
    'reddit,facebook-groups,tiktok-comments',
    '--limit',
    '7',
    '--gun-peers',
    'wss://one.example/gun,wss://two.example/gun',
    '--dry-run',
    '--json',
  ]);

  assert.equal(parsed.market, 'service businesses');
  assert.deepEqual(parsed.keywords, ['lead follow up', 'client onboarding']);
  assert.deepEqual(parsed.channels, ['reddit', 'facebook-groups', 'tiktok-comments']);
  assert.equal(parsed.limit, 7);
  assert.deepEqual(parsed.gunPeers, ['wss://one.example/gun', 'wss://two.example/gun']);
  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.json, true);
});

test('buildMarketPulseRunOptions can be driven by environment defaults', () => {
  const options = buildMarketPulseRunOptions({}, {
    MARKET_PULSE_MARKET: 'home service teams',
    MARKET_PULSE_KEYWORDS: 'missed calls,quote follow up',
    MARKET_PULSE_CHANNELS: 'reddit,linkedin',
    MARKET_PULSE_LIMIT: '12',
    MARKET_PULSE_DRY_RUN: 'true',
    GROWTH_GUN_PEERS: 'wss://relay.example/gun',
  });

  assert.equal(options.market, 'home service teams');
  assert.deepEqual(options.keywords, ['missed calls', 'quote follow up']);
  assert.deepEqual(options.channels, ['reddit', 'linkedin']);
  assert.equal(options.limit, 12);
  assert.equal(options.dryRun, true);
  assert.deepEqual(options.gunPeers, ['wss://relay.example/gun']);
});

test('runMarketPulseCli runs the injected pulse cycle and prints a useful summary', async () => {
  let capturedOptions;
  const stdout = {
    value: '',
    write(chunk) {
      this.value += chunk;
    },
  };
  const stderr = {
    value: '',
    write(chunk) {
      this.value += chunk;
    },
  };

  const result = await runMarketPulseCli({
    argv: ['--dry-run', '--market', 'service businesses'],
    stdout,
    stderr,
    env: {},
    async runCycleImpl(options) {
      capturedOptions = options;
      return {
        runId: 'market-pulse-cli-test',
        generatedAt: '2026-05-28T12:00:00.000Z',
        dryRun: options.dryRun,
        profile: {
          market: options.market,
          keywords: options.keywords,
        },
        signalsAnalyzed: 3,
        approvalsRequired: 4,
        marketFit: {
          score: 72,
          verdict: 'promising',
          nextAction: 'Run the top social probe.',
        },
        topOpportunity: {
          title: 'Follow-up cleanup',
          problem: 'Leads are falling through.',
          score: 74,
        },
        persist: {
          skipped: true,
          reason: 'dry run',
          directoryListingsPublished: 0,
        },
        socialProbeDrafts: [
          {
            channelLabel: 'Reddit',
            approvalStatus: 'required',
            title: 'Follow-up cleanup',
          },
        ],
        reactionSnapshots: [
          {
            channelLabel: 'Reddit',
            marketFitScore: 68,
            signalCount: 2,
            commentCount: 14,
            reactionCount: 90,
          },
        ],
        warnings: [],
      };
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(capturedOptions.dryRun, true);
  assert.equal(capturedOptions.market, 'service businesses');
  assert.match(stdout.value, /Market Pulse automation complete/);
  assert.match(stdout.value, /Reaction radar/);
  assert.equal(stderr.value, '');
});

test('market pulse automation is wired to npm and scheduled GitHub Actions', async () => {
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const workflow = await readFile(new URL('../.github/workflows/market-pulse.yml', import.meta.url), 'utf8');

  assert.equal(packageJson.scripts['market:pulse'], 'node scripts/growth/run-market-pulse.mjs');
  assert.match(workflow, /Market Pulse Automation/);
  assert.match(workflow, /cron: '23 \*\/8 \* \* \*'/);
  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /npm run market:pulse -- --json/);
  assert.match(workflow, /MARKET_PULSE_MARKET/);
});
