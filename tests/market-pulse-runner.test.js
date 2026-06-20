import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadLocalEnv } from '../scripts/env/load-local-env.mjs';
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
    MARKET_PULSE_PROBE_LINK: 'https://portal.3dvr.tech/market-lab/',
    META_PAGE_ID: 'page-123',
    META_GRAPH_API_VERSION: 'v25.0',
    THREADS_USER_ID: 'me',
    THREADS_API_VERSION: 'v1.0',
    GROWTH_GUN_PEERS: 'wss://relay.example/gun',
  });

  assert.equal(options.market, 'home service teams');
  assert.deepEqual(options.keywords, ['missed calls', 'quote follow up']);
  assert.deepEqual(options.channels, ['reddit', 'linkedin']);
  assert.equal(options.limit, 12);
  assert.equal(options.dryRun, true);
  assert.deepEqual(options.gunPeers, ['wss://relay.example/gun']);
  assert.equal(options.link, 'https://portal.3dvr.tech/market-lab/');
  assert.equal(options.metaPageId, 'page-123');
  assert.equal(options.metaGraphVersion, 'v25.0');
  assert.equal(options.threadsUserId, 'me');
  assert.equal(options.threadsVersion, 'v1.0');
});

test('loadLocalEnv reads ignored local environment files without overriding shell values by default', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'market-pulse-env-'));
  await writeFile(path.join(cwd, '.env.local'), [
    'META_PAGE_ID=page-from-file',
    'META_USER_ACCESS_TOKEN=user-token',
    'THREADS_USER_ID=me',
  ].join('\n'));

  const originalMetaPageId = process.env.META_PAGE_ID;
  process.env.META_PAGE_ID = 'page-from-shell';
  delete process.env.META_USER_ACCESS_TOKEN;
  delete process.env.THREADS_USER_ID;

  try {
    const result = loadLocalEnv({ cwd });
    assert.equal(result.loaded, true);
    assert.equal(process.env.META_PAGE_ID, 'page-from-shell');
    assert.equal(process.env.META_USER_ACCESS_TOKEN, 'user-token');
    assert.equal(process.env.THREADS_USER_ID, 'me');
  } finally {
    if (originalMetaPageId == null) delete process.env.META_PAGE_ID;
    else process.env.META_PAGE_ID = originalMetaPageId;
    delete process.env.META_USER_ACCESS_TOKEN;
    delete process.env.THREADS_USER_ID;
  }
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
  assert.match(workflow, /META_PAGE_ID/);
  assert.match(workflow, /THREADS_USER_ID/);
});
