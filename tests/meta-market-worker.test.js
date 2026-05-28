import assert from 'node:assert/strict';
import test from 'node:test';
import {
  executeMetaMarketJob,
  isApprovedMetaMarketJob,
  normalizeMetaMarketJob,
  parseMetaMarketWorkerArgs,
  publishMetaMarketJob,
  runMetaMarketWorkerOnce,
  shouldMeasureMetaMarketJob,
} from '../src/growth/meta-market-worker.js';

function jsonResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    async json() {
      return payload;
    },
  };
}

test('parseMetaMarketWorkerArgs supports DO timer options', () => {
  const parsed = parseMetaMarketWorkerArgs([
    '--dry-run',
    '--json',
    '--limit',
    '5',
    '--gun-peers',
    'wss://one.example/gun,wss://two.example/gun',
  ]);

  assert.equal(parsed.dryRun, true);
  assert.equal(parsed.json, true);
  assert.equal(parsed.limit, 5);
  assert.deepEqual(parsed.gunPeers, ['wss://one.example/gun', 'wss://two.example/gun']);
});

test('approved Meta market jobs require approval, message, and integration match', () => {
  const job = normalizeMetaMarketJob({
    id: 'job-1',
    status: 'approved',
    integration: 'meta_graph_api',
    channel: 'facebook-page',
    message: 'Testing a market angle',
    approvedAt: '2026-05-28T12:00:00.000Z',
  });

  assert.equal(isApprovedMetaMarketJob(job), true);
  assert.equal(isApprovedMetaMarketJob({ ...job, approvedAt: '' }), false);
  assert.equal(isApprovedMetaMarketJob({ ...job, message: '' }), false);
});

test('published jobs become measurement candidates after an hour', () => {
  const job = normalizeMetaMarketJob({
    status: 'published',
    postId: '123_456',
    measuredAt: '2026-05-28T10:00:00.000Z',
  });

  assert.equal(shouldMeasureMetaMarketJob(job, new Date('2026-05-28T10:30:00.000Z')), false);
  assert.equal(shouldMeasureMetaMarketJob(job, new Date('2026-05-28T11:01:00.000Z')), true);
});

test('publishMetaMarketJob calls Meta from the server-side worker context', async () => {
  let captured;
  const update = await publishMetaMarketJob({
    id: 'job-1',
    message: 'Question for service businesses',
    link: 'https://portal.3dvr.tech/market-lab/',
  }, {
    env: {
      META_PAGE_ID: 'page-123',
      META_PAGE_ACCESS_TOKEN: 'secret-token',
      META_GRAPH_API_VERSION: 'v24.0',
    },
    async fetchImpl(url, init) {
      captured = { url, init };
      return jsonResponse({ id: 'page-123_post-456' });
    },
  });

  assert.equal(captured.url, 'https://graph.facebook.com/v24.0/page-123/feed');
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.body.get('message'), 'Question for service businesses');
  assert.equal(captured.init.body.get('access_token'), 'secret-token');
  assert.equal(update.status, 'published');
  assert.equal(update.postId, 'page-123_post-456');
});

test('executeMetaMarketJob measures existing posts and returns scored metrics', async () => {
  const result = await executeMetaMarketJob({
    id: 'job-1',
    status: 'published',
    postId: 'page-123_post-456',
  }, {
    env: {
      META_PAGE_ACCESS_TOKEN: 'secret-token',
      META_GRAPH_API_VERSION: 'v24.0',
    },
    async fetchImpl(url) {
      if (url.includes('/insights')) {
        return jsonResponse({
          data: [
            { name: 'post_impressions_unique', values: [{ value: 100 }] },
            { name: 'post_clicks', values: [{ value: 6 }] },
            { name: 'post_engaged_users', values: [{ value: 12 }] },
          ],
        });
      }
      return jsonResponse({
        id: 'page-123_post-456',
        permalink_url: 'https://facebook.com/page-123/posts/post-456',
        reactions: { summary: { total_count: 8 } },
        comments: { summary: { total_count: 3 } },
        shares: { count: 1 },
      });
    },
  });

  assert.equal(result.action, 'measure');
  assert.equal(result.update.status, 'measured');
  assert.equal(result.update.reactionCount, 8);
  assert.equal(result.update.commentCount, 3);
  assert.ok(result.update.marketSignalScore > 0);
});

test('runMetaMarketWorkerOnce uses Gun-backed client as queue and result store', async () => {
  const writes = [];
  const snapshots = [];
  const summary = await runMetaMarketWorkerOnce({
    client: {
      async readJobs() {
        return [
          normalizeMetaMarketJob({
            id: 'job-1',
            status: 'approved',
            integration: 'meta_graph_api',
            channel: 'facebook-page',
            message: 'Question for owners',
            approvedAt: '2026-05-28T12:00:00.000Z',
          }),
        ];
      },
      async writeJobUpdate(jobId, update) {
        writes.push({ jobId, update });
      },
      async writeSnapshot(jobId, update) {
        snapshots.push({ jobId, update });
      },
    },
    env: {
      META_PAGE_ID: 'page-123',
      META_PAGE_ACCESS_TOKEN: 'secret-token',
      META_GRAPH_API_VERSION: 'v24.0',
    },
    async fetchImpl() {
      return jsonResponse({ id: 'page-123_post-456' });
    },
  });

  assert.equal(summary.jobsSeen, 1);
  assert.equal(summary.jobsProcessed, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].update.status, 'published');
  assert.equal(snapshots.length, 0);
});
