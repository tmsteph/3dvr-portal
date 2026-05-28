export const META_GRAPH_DEFAULT_VERSION = 'v24.0';

export const META_GRAPH_REQUIRED_PERMISSIONS = Object.freeze([
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_posts',
  'read_insights',
]);

export const META_GRAPH_POST_FIELDS = Object.freeze([
  'id',
  'permalink_url',
  'message',
  'created_time',
  'shares',
  'reactions.limit(0).summary(true)',
  'comments.limit(0).summary(true)',
]);

export const META_GRAPH_INSIGHT_METRICS = Object.freeze([
  'post_impressions',
  'post_impressions_unique',
  'post_engaged_users',
  'post_clicks',
  'post_reactions_by_type_total',
]);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeGraphVersion(version = '') {
  const envVersion = typeof process !== 'undefined' && process.env
    ? process.env.META_GRAPH_API_VERSION
    : '';
  const normalized = normalizeText(version || envVersion);
  return normalized || META_GRAPH_DEFAULT_VERSION;
}

function encodeGraphPath(path = '') {
  return normalizeText(path).replace(/^\/+/, '');
}

function buildGraphUrl(path, options = {}) {
  const version = normalizeGraphVersion(options.version);
  const url = new URL(`https://graph.facebook.com/${version}/${encodeGraphPath(path)}`);
  const params = options.params || {};

  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });

  if (options.accessToken) {
    url.searchParams.set('access_token', options.accessToken);
  }

  return url.toString();
}

function unixTimestampSeconds(value) {
  if (!value) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.floor(value));
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return String(Math.floor(date.getTime() / 1000));
}

export function buildMetaPagePostRequest(options = {}) {
  const pageId = normalizeText(options.pageId || '{page-id}');
  const body = {
    message: normalizeText(options.message),
  };

  if (options.link) {
    body.link = normalizeText(options.link);
  }

  if (options.published === false) {
    body.published = 'false';
  }

  const scheduledPublishTime = unixTimestampSeconds(options.scheduledPublishTime || options.scheduledAt);
  if (scheduledPublishTime) {
    body.published = 'false';
    body.scheduled_publish_time = scheduledPublishTime;
  }

  if (options.accessToken) {
    body.access_token = options.accessToken;
  }

  return {
    method: 'POST',
    url: buildGraphUrl(`${pageId}/feed`, { version: options.version }),
    body,
    requiresAccessToken: !options.accessToken,
  };
}

export function buildMetaPostFieldsRequest(options = {}) {
  const postId = normalizeText(options.postId || '{post-id}');
  const fields = Array.isArray(options.fields) && options.fields.length
    ? options.fields
    : META_GRAPH_POST_FIELDS;

  return {
    method: 'GET',
    url: buildGraphUrl(postId, {
      version: options.version,
      accessToken: options.accessToken,
      params: {
        fields: fields.join(','),
      },
    }),
    fields,
    requiresAccessToken: !options.accessToken,
  };
}

export function buildMetaPostInsightsRequest(options = {}) {
  const postId = normalizeText(options.postId || '{post-id}');
  const metrics = Array.isArray(options.metrics) && options.metrics.length
    ? options.metrics
    : META_GRAPH_INSIGHT_METRICS;

  return {
    method: 'GET',
    url: buildGraphUrl(`${postId}/insights`, {
      version: options.version,
      accessToken: options.accessToken,
      params: {
        metric: metrics.join(','),
      },
    }),
    metrics,
    requiresAccessToken: !options.accessToken,
  };
}

function summaryTotal(edge) {
  const total = Number(edge?.summary?.total_count);
  return Number.isFinite(total) ? total : 0;
}

function lastMetricValue(metric = {}) {
  const values = Array.isArray(metric.values) ? metric.values : [];
  const latest = values[values.length - 1];
  return latest ? latest.value : undefined;
}

function insightMap(insights = {}) {
  const rows = Array.isArray(insights)
    ? insights
    : (Array.isArray(insights?.data) ? insights.data : []);
  return rows.reduce((map, metric) => {
    if (metric?.name) {
      map.set(metric.name, lastMetricValue(metric));
    }
    return map;
  }, new Map());
}

function numberMetric(map, key) {
  const value = Number(map.get(key));
  return Number.isFinite(value) ? value : 0;
}

function sumObjectValues(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.values(value).reduce((sum, item) => {
    const number = Number(item);
    return sum + (Number.isFinite(number) ? number : 0);
  }, 0);
}

export function calculateMetaMarketSignalScore(metrics = {}) {
  const reactions = Math.max(0, Number(metrics.reactionCount || 0));
  const comments = Math.max(0, Number(metrics.commentCount || 0));
  const shares = Math.max(0, Number(metrics.shareCount || 0));
  const clicks = Math.max(0, Number(metrics.clickCount || 0));
  const engaged = Math.max(0, Number(metrics.engagedUsers || 0));
  const impressions = Math.max(0, Number(metrics.uniqueImpressionCount || metrics.impressionCount || 0));
  const engagementRate = impressions > 0
    ? Math.min(30, ((reactions + comments + shares + clicks) / impressions) * 300)
    : 0;

  return Math.min(100, Math.round(
    Math.min(reactions * 0.4, 18)
    + Math.min(comments * 3, 27)
    + Math.min(shares * 5, 20)
    + Math.min(clicks * 2, 18)
    + Math.min(engaged * 0.6, 12)
    + engagementRate
  ));
}

export function normalizeMetaPostMetrics(snapshot = {}) {
  const post = snapshot.post || snapshot;
  const insightRows = snapshot.insights || post.insights || [];
  const metrics = insightMap(insightRows);
  const reactionTypes = metrics.get('post_reactions_by_type_total') || {};
  const insightReactionCount = sumObjectValues(reactionTypes);
  const reactionCount = summaryTotal(post.reactions) || insightReactionCount;
  const normalized = {
    postId: normalizeText(post.id || snapshot.postId),
    permalinkUrl: normalizeText(post.permalink_url || post.permalinkUrl),
    message: normalizeText(post.message),
    createdTime: normalizeText(post.created_time || post.createdTime),
    reactionCount,
    reactionTypes: reactionTypes && typeof reactionTypes === 'object' ? reactionTypes : {},
    commentCount: summaryTotal(post.comments),
    shareCount: Math.max(0, Number(post.shares?.count || post.shareCount || 0)),
    impressionCount: numberMetric(metrics, 'post_impressions'),
    uniqueImpressionCount: numberMetric(metrics, 'post_impressions_unique'),
    engagedUsers: numberMetric(metrics, 'post_engaged_users'),
    clickCount: numberMetric(metrics, 'post_clicks'),
  };

  return {
    ...normalized,
    marketSignalScore: calculateMetaMarketSignalScore(normalized),
  };
}

export function buildMetaMarketExperimentPlan(options = {}) {
  const experimentId = normalizeText(options.experimentId || options.id || 'facebook-market-probe');
  const postId = normalizeText(options.postId || '{post-id}');
  return {
    id: experimentId,
    channel: 'facebook-page',
    channelLabel: 'Facebook Page',
    integration: 'meta_graph_api',
    target: 'Facebook Page feed',
    requiredPermissions: [...META_GRAPH_REQUIRED_PERMISSIONS],
    humanApprovalRequired: true,
    publishRequest: buildMetaPagePostRequest({
      pageId: options.pageId || '{page-id}',
      message: options.message,
      link: options.link,
      scheduledAt: options.scheduledAt,
      version: options.version,
    }),
    measurementRequests: [
      buildMetaPostFieldsRequest({
        postId,
        version: options.version,
      }),
      buildMetaPostInsightsRequest({
        postId,
        version: options.version,
      }),
    ],
    scoreFormula: 'reactions + weighted comments + shares + clicks + engaged users + engagement rate',
    note: 'Use server-side tokens only. The portal should approve, publish, then store the returned post id before measuring reactions.',
  };
}
