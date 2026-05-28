import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMetaMarketExperimentPlan,
  buildMetaPagePostRequest,
  buildMetaPostFieldsRequest,
  buildMetaPostInsightsRequest,
  calculateMetaMarketSignalScore,
  normalizeMetaPostMetrics,
} from '../src/growth/meta-graph.js';

test('buildMetaPagePostRequest prepares a Page feed publish call without leaking tokens by default', () => {
  const request = buildMetaPagePostRequest({
    pageId: '123',
    message: 'Testing a market angle',
    link: 'https://portal.3dvr.tech/market-lab/',
    version: 'v24.0',
  });

  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://graph.facebook.com/v24.0/123/feed');
  assert.equal(request.body.message, 'Testing a market angle');
  assert.equal(request.body.link, 'https://portal.3dvr.tech/market-lab/');
  assert.equal(request.requiresAccessToken, true);
  assert.equal(Object.hasOwn(request.body, 'access_token'), false);
});

test('Meta post measurement requests include post fields and insight metrics', () => {
  const fields = buildMetaPostFieldsRequest({ postId: '123_456', version: 'v24.0' });
  const insights = buildMetaPostInsightsRequest({ postId: '123_456', version: 'v24.0' });

  assert.equal(fields.method, 'GET');
  assert.match(fields.url, /123_456\?fields=/);
  assert.ok(fields.fields.includes('reactions.limit(0).summary(true)'));
  assert.equal(insights.method, 'GET');
  assert.match(insights.url, /123_456\/insights\?metric=/);
  assert.ok(insights.metrics.includes('post_clicks'));
  assert.ok(insights.metrics.includes('post_reactions_by_type_total'));
});

test('normalizeMetaPostMetrics turns Graph responses into a market signal score', () => {
  const metrics = normalizeMetaPostMetrics({
    post: {
      id: '123_456',
      permalink_url: 'https://facebook.com/123/posts/456',
      message: 'Which customer follow-up problem is hardest?',
      reactions: { summary: { total_count: 12 } },
      comments: { summary: { total_count: 5 } },
      shares: { count: 2 },
    },
    insights: {
      data: [
        { name: 'post_impressions_unique', values: [{ value: 240 }] },
        { name: 'post_engaged_users', values: [{ value: 28 }] },
        { name: 'post_clicks', values: [{ value: 9 }] },
        { name: 'post_reactions_by_type_total', values: [{ value: { like: 9, love: 3 } }] },
      ],
    },
  });

  assert.equal(metrics.postId, '123_456');
  assert.equal(metrics.reactionCount, 12);
  assert.equal(metrics.commentCount, 5);
  assert.equal(metrics.shareCount, 2);
  assert.equal(metrics.clickCount, 9);
  assert.ok(metrics.marketSignalScore > 0);
  assert.equal(calculateMetaMarketSignalScore(metrics), metrics.marketSignalScore);
});

test('buildMetaMarketExperimentPlan describes the approved post and measurement loop', () => {
  const plan = buildMetaMarketExperimentPlan({
    experimentId: 'follow-up-facebook-page',
    pageId: '123',
    postId: '123_456',
    message: 'Question for service businesses...',
    version: 'v24.0',
  });

  assert.equal(plan.channel, 'facebook-page');
  assert.equal(plan.integration, 'meta_graph_api');
  assert.equal(plan.humanApprovalRequired, true);
  assert.ok(plan.requiredPermissions.includes('pages_manage_posts'));
  assert.equal(plan.publishRequest.url, 'https://graph.facebook.com/v24.0/123/feed');
  assert.equal(plan.measurementRequests.length, 2);
});
