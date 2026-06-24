import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMetaMarketExperimentPlan,
  buildMetaPagePostRequest,
  buildMetaPostFieldsRequest,
  buildMetaPostInsightsRequest,
  buildMetaUserPagesRequest,
  buildThreadsMarketExperimentPlan,
  buildThreadsPublishRequest,
  buildThreadsTextContainerRequest,
  calculateThreadsMarketSignalScore,
  calculateMetaMarketSignalScore,
  normalizeMetaPostMetrics,
  normalizeThreadsPostMetrics,
  validateThreadsPostText,
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

test('buildMetaUserPagesRequest prepares a user token page-list lookup', () => {
  const request = buildMetaUserPagesRequest({
    accessToken: 'user-token',
    version: 'v25.0',
  });

  assert.equal(request.method, 'GET');
  assert.match(request.url, /^https:\/\/graph\.facebook\.com\/v25\.0\/me\/accounts\?/);
  assert.match(request.url, /fields=/);
  assert.match(request.url, /access_token=user-token/);
  assert.ok(request.fields.includes('access_token'));
});

test('Threads text publishing requests use the two-step Threads API flow', () => {
  const container = buildThreadsTextContainerRequest({
    threadsUserId: 'me',
    message: 'Question for service operators',
    link: 'https://portal.3dvr.tech/market-lab/',
    version: 'v1.0',
  });
  const publish = buildThreadsPublishRequest({
    threadsUserId: 'me',
    creationId: 'container-123',
    version: 'v1.0',
  });

  assert.equal(container.method, 'POST');
  assert.equal(container.url, 'https://graph.threads.net/v1.0/me/threads');
  assert.equal(container.body.media_type, 'TEXT');
  assert.match(container.body.text, /Question for service operators/);
  assert.equal(container.requiresAccessToken, true);
  assert.equal(validateThreadsPostText(container.body.text).ok, true);
  assert.equal(publish.method, 'POST');
  assert.equal(publish.url, 'https://graph.threads.net/v1.0/me/threads_publish');
  assert.equal(publish.body.creation_id, 'container-123');
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

test('normalizeThreadsPostMetrics turns Threads insights into a market signal score', () => {
  const metrics = normalizeThreadsPostMetrics({
    media: {
      id: 'threads-media-123',
      permalink: 'https://www.threads.net/@3dvr/post/123',
      text: 'What part of follow-up is hardest?',
      timestamp: '2026-06-20T12:00:00+0000',
    },
    insights: {
      data: [
        { name: 'views', values: [{ value: 400 }] },
        { name: 'likes', values: [{ value: 18 }] },
        { name: 'replies', values: [{ value: 7 }] },
        { name: 'reposts', values: [{ value: 2 }] },
        { name: 'quotes', values: [{ value: 1 }] },
      ],
    },
  });

  assert.equal(metrics.postId, 'threads-media-123');
  assert.equal(metrics.viewCount, 400);
  assert.equal(metrics.likeCount, 18);
  assert.equal(metrics.replyCount, 7);
  assert.ok(metrics.marketSignalScore > 0);
  assert.equal(calculateThreadsMarketSignalScore(metrics), metrics.marketSignalScore);
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

test('buildThreadsMarketExperimentPlan describes the approved Threads post and measurement loop', () => {
  const plan = buildThreadsMarketExperimentPlan({
    experimentId: 'follow-up-threads',
    threadsUserId: 'me',
    postId: 'threads-media-123',
    message: 'Question for service businesses...',
    version: 'v1.0',
  });

  assert.equal(plan.channel, 'threads');
  assert.equal(plan.integration, 'threads_api');
  assert.equal(plan.humanApprovalRequired, true);
  assert.ok(plan.requiredPermissions.includes('threads_content_publish'));
  assert.equal(plan.publishRequest.url, 'https://graph.threads.net/v1.0/me/threads');
  assert.equal(plan.publishCommitRequest.url, 'https://graph.threads.net/v1.0/me/threads_publish');
  assert.equal(plan.measurementRequests.length, 2);
});
