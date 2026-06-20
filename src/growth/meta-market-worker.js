import { DEFAULT_GUN_PEERS, getNode } from './homepage-hero.js';
import {
  buildMetaPagePostRequest,
  buildMetaPostFieldsRequest,
  buildMetaPostInsightsRequest,
  buildMetaUserPagesRequest,
  buildThreadsMediaInsightsRequest,
  buildThreadsMediaRequest,
  buildThreadsPublishRequest,
  buildThreadsTextContainerRequest,
  META_THREADS_TEXT_LIMIT,
  normalizeMetaPostMetrics,
  normalizeThreadsPostMetrics,
  validateThreadsPostText,
} from './meta-graph.js';

export const META_MARKET_ROOT_PATH = Object.freeze([
  '3dvr-portal',
  'growth',
  'meta-market',
]);
export const META_MARKET_JOBS_PATH = Object.freeze([
  ...META_MARKET_ROOT_PATH,
  'jobs',
]);
export const META_MARKET_SNAPSHOTS_PATH = Object.freeze([
  ...META_MARKET_ROOT_PATH,
  'snapshots',
]);

const HELP_TEXT = `Usage: node scripts/growth/run-meta-market-worker.mjs [options]

Options:
  --dry-run            Read and validate jobs without calling Meta or writing updates.
  --limit <number>     Maximum approved jobs to process. Default: 3.
  --gun-peers <csv>    Comma-separated Gun relay peers.
  --json               Print machine-readable output.
  --help               Show this help.

Environment:
  META_APP_ID             Meta Graph app id (kept server-side when used for auth tooling).
  META_APP_SECRET         Meta Graph app secret (secret manager only).
  META_PAGE_ID             Default Facebook Page id.
  META_PAGE_ACCESS_TOKEN   Server-only Page access token.
  META_USER_ACCESS_TOKEN   Optional server-only User token used to resolve Page tokens.
  META_GRAPH_API_VERSION   Optional Graph API version.
  THREADS_APP_ID           Threads app id (kept server-side when used for auth tooling).
  THREADS_APP_SECRET       Threads app secret (secret manager only).
  THREADS_USER_ID          Threads user id. Defaults to me.
  THREADS_ACCESS_TOKEN     Server-only Threads user access token.
  THREADS_API_VERSION      Optional Threads API version.
`;

function normalizeText(value) {
  return String(value || '').trim();
}

function splitList(value, fallback = []) {
  const items = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  return items.length ? items : [...fallback];
}

function readFlagValue(argv, index, flag) {
  const next = argv[index + 1];
  if (!next || String(next).startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return next;
}

function graphBody(body = {}) {
  const params = new URLSearchParams();
  Object.entries(body).forEach(([key, value]) => {
    if (value == null || value === '') return;
    params.set(key, String(value));
  });
  return params;
}

async function readJsonResponse(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch (_error) {
    payload = {};
  }

  if (!response.ok || payload?.error) {
    const message = payload?.error?.message || `Meta request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function onceNode(node) {
  return new Promise((resolve) => {
    if (!node || typeof node.once !== 'function') {
      resolve(undefined);
      return;
    }
    node.once((value) => resolve(value));
  });
}

function putNode(node, value) {
  return new Promise((resolve, reject) => {
    if (!node || typeof node.put !== 'function') {
      reject(new Error('Meta market node is not writable.'));
      return;
    }
    node.put(value, (ack) => {
      if (ack?.err) {
        reject(new Error(String(ack.err)));
        return;
      }
      resolve(ack || {});
    });
  });
}

async function readGunMap(node, options = {}) {
  const waitMs = Number.parseInt(options.waitMs, 10) || 1200;
  const records = [];

  return new Promise((resolve) => {
    if (!node || typeof node.map !== 'function') {
      resolve(records);
      return;
    }

    let subscription = null;
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      if (subscription && typeof subscription.off === 'function') {
        subscription.off();
      }
      resolve(records);
    };

    subscription = node.map().once((data, id) => {
      if (data && id && id !== '_') {
        records.push({ id, data });
      }
    });

    setTimeout(finish, waitMs);
  });
}

export function parseMetaMarketWorkerArgs(argv = []) {
  const parsed = {
    dryRun: false,
    help: false,
    json: false,
    limit: 3,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || '');
    if (arg === '--dry-run') {
      parsed.dryRun = true;
    } else if (arg === '--json') {
      parsed.json = true;
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--limit') {
      parsed.limit = Number.parseInt(readFlagValue(argv, index, arg), 10);
      index += 1;
    } else if (arg === '--gun-peers') {
      parsed.gunPeers = splitList(readFlagValue(argv, index, arg));
      index += 1;
    } else {
      throw new Error(`Unknown Meta market worker option: ${arg}`);
    }
  }

  return parsed;
}

export function normalizeMetaMarketJob(data = {}, id = '') {
  const channel = normalizeText(data.channel || 'facebook-page').toLowerCase();
  const defaultIntegration = channel === 'threads' ? 'threads_api' : 'meta_graph_api';
  const postId = normalizeText(data.postId || data.metaPostId || data.mediaId || data.threadsMediaId);
  return {
    id: normalizeText(data.id || id),
    experimentId: normalizeText(data.experimentId),
    status: normalizeText(data.status || 'draft'),
    channel,
    integration: normalizeText(data.integration || defaultIntegration),
    message: normalizeText(data.message),
    link: normalizeText(data.link),
    pageId: normalizeText(data.pageId),
    threadsUserId: normalizeText(data.threadsUserId || data.userId),
    creationId: normalizeText(data.creationId || data.creation_id),
    postId,
    mediaId: postId,
    permalinkUrl: normalizeText(data.permalinkUrl),
    approvedAt: normalizeText(data.approvedAt),
    publishedAt: normalizeText(data.publishedAt),
    measuredAt: normalizeText(data.measuredAt),
    error: normalizeText(data.error),
    raw: data,
  };
}

function isFacebookPageJob(job = {}) {
  return job.channel === 'facebook-page' && job.integration === 'meta_graph_api';
}

function isThreadsJob(job = {}) {
  return job.channel === 'threads' && job.integration === 'threads_api';
}

export function isApprovedMetaMarketJob(job = {}) {
  return (isFacebookPageJob(job) || isThreadsJob(job))
    && job.status === 'approved'
    && Boolean(job.message)
    && Boolean(job.approvedAt);
}

export function shouldMeasureMetaMarketJob(job = {}, now = new Date()) {
  if (!job.postId || job.status !== 'published') return false;
  if (!job.measuredAt) return true;

  const measuredAt = new Date(job.measuredAt);
  if (Number.isNaN(measuredAt.getTime())) return true;
  return now.getTime() - measuredAt.getTime() >= 60 * 60 * 1000;
}

async function resolveFacebookPageTarget(job = {}, options = {}) {
  const env = options.env || process.env;
  const inferredPageId = normalizeText(job.postId).includes('_')
    ? normalizeText(job.postId).split('_')[0]
    : '';
  const pageId = normalizeText(job.pageId || env.META_PAGE_ID || inferredPageId);
  let accessToken = normalizeText(options.accessToken || env.META_PAGE_ACCESS_TOKEN);

  if (!pageId) {
    throw new Error('META_PAGE_ID or job.pageId is required.');
  }

  if (accessToken) {
    return { pageId, accessToken };
  }

  const userAccessToken = normalizeText(options.userAccessToken || env.META_USER_ACCESS_TOKEN);
  if (!userAccessToken) {
    throw new Error('META_PAGE_ACCESS_TOKEN or META_USER_ACCESS_TOKEN is required on the DO worker.');
  }

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const request = buildMetaUserPagesRequest({
    version: options.version || env.META_GRAPH_API_VERSION,
    accessToken: userAccessToken,
  });
  const response = await fetchImpl(request.url, { method: request.method });
  const payload = await readJsonResponse(response);
  const pages = Array.isArray(payload.data) ? payload.data : [];
  const page = pages.find((item) => normalizeText(item.id) === pageId);
  const pageAccessToken = normalizeText(page?.access_token);

  if (!page) {
    throw new Error('The configured META_PAGE_ID was not returned by /me/accounts.');
  }
  if (!pageAccessToken) {
    throw new Error('Meta did not return a Page access token for the configured Page.');
  }

  return { pageId, accessToken: pageAccessToken };
}

async function publishFacebookPageMarketJob(job = {}, options = {}) {
  const env = options.env || process.env;
  const { pageId, accessToken } = await resolveFacebookPageTarget(job, options);

  const request = buildMetaPagePostRequest({
    pageId,
    message: job.message,
    link: job.link,
    version: options.version || env.META_GRAPH_API_VERSION,
    accessToken,
  });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const response = await fetchImpl(request.url, {
    method: request.method,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: graphBody(request.body),
  });
  const payload = await readJsonResponse(response);
  const now = new Date().toISOString();

  return {
    status: 'published',
    pageId,
    postId: normalizeText(payload.id),
    permalinkUrl: normalizeText(payload.permalink_url || payload.permalinkUrl),
    publishedAt: now,
    updatedAt: now,
    channel: 'facebook-page',
    integration: 'meta_graph_api',
    error: '',
  };
}

function assertThreadsTextAllowed(text = '') {
  const validation = validateThreadsPostText(text);
  if (!validation.ok) {
    if (!validation.characterCount) {
      throw new Error('Threads post text is required.');
    }
    throw new Error(`Threads post text must be ${META_THREADS_TEXT_LIMIT} characters or fewer.`);
  }
}

export async function publishThreadsMarketJob(job = {}, options = {}) {
  const env = options.env || process.env;
  const threadsUserId = normalizeText(job.threadsUserId || env.THREADS_USER_ID || 'me') || 'me';
  const accessToken = normalizeText(options.threadsAccessToken || options.accessToken || env.THREADS_ACCESS_TOKEN);

  if (!accessToken) {
    throw new Error('THREADS_ACCESS_TOKEN is required on the DO worker.');
  }

  const request = buildThreadsTextContainerRequest({
    threadsUserId,
    message: job.message,
    link: job.link,
    version: options.threadsVersion || options.version || env.THREADS_API_VERSION,
    accessToken,
  });
  assertThreadsTextAllowed(request.body.text);

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const containerResponse = await fetchImpl(request.url, {
    method: request.method,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: graphBody(request.body),
  });
  const containerPayload = await readJsonResponse(containerResponse);
  const creationId = normalizeText(containerPayload.id || containerPayload.creation_id || containerPayload.creationId);

  if (!creationId) {
    throw new Error('Threads did not return a media container id.');
  }

  const publishRequest = buildThreadsPublishRequest({
    threadsUserId,
    creationId,
    version: options.threadsVersion || options.version || env.THREADS_API_VERSION,
    accessToken,
  });
  const publishResponse = await fetchImpl(publishRequest.url, {
    method: publishRequest.method,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: graphBody(publishRequest.body),
  });
  const payload = await readJsonResponse(publishResponse);
  const now = new Date().toISOString();
  const postId = normalizeText(payload.id || payload.post_id || payload.media_id);

  if (!postId) {
    throw new Error('Threads did not return a published media id.');
  }

  return {
    status: 'published',
    channel: 'threads',
    integration: 'threads_api',
    threadsUserId,
    creationId,
    postId,
    mediaId: postId,
    permalinkUrl: normalizeText(payload.permalink || payload.permalink_url || payload.permalinkUrl),
    publishedAt: now,
    updatedAt: now,
    error: '',
  };
}

export async function publishMetaMarketJob(job = {}, options = {}) {
  return isThreadsJob(job)
    ? publishThreadsMarketJob(job, options)
    : publishFacebookPageMarketJob(job, options);
}

async function measureFacebookPageMarketJob(job = {}, options = {}) {
  const env = options.env || process.env;

  if (!job.postId) {
    throw new Error('job.postId is required before measurement.');
  }

  const { accessToken } = await resolveFacebookPageTarget(job, options);
  const version = options.version || env.META_GRAPH_API_VERSION;
  const fieldsRequest = buildMetaPostFieldsRequest({
    postId: job.postId,
    version,
    accessToken,
  });
  const insightsRequest = buildMetaPostInsightsRequest({
    postId: job.postId,
    version,
    accessToken,
  });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const [postResponse, insightsResponse] = await Promise.all([
    fetchImpl(fieldsRequest.url, { method: fieldsRequest.method }),
    fetchImpl(insightsRequest.url, { method: insightsRequest.method }),
  ]);
  const [post, insights] = await Promise.all([
    readJsonResponse(postResponse),
    readJsonResponse(insightsResponse),
  ]);
  const metrics = normalizeMetaPostMetrics({ post, insights });
  const now = new Date().toISOString();

  return {
    status: 'measured',
    channel: 'facebook-page',
    integration: 'meta_graph_api',
    measuredAt: now,
    updatedAt: now,
    permalinkUrl: metrics.permalinkUrl || job.permalinkUrl,
    reactionCount: metrics.reactionCount,
    commentCount: metrics.commentCount,
    shareCount: metrics.shareCount,
    clickCount: metrics.clickCount,
    impressionCount: metrics.impressionCount,
    uniqueImpressionCount: metrics.uniqueImpressionCount,
    engagedUsers: metrics.engagedUsers,
    marketSignalScore: metrics.marketSignalScore,
    metrics,
    error: '',
  };
}

export async function measureThreadsMarketJob(job = {}, options = {}) {
  const env = options.env || process.env;
  const accessToken = normalizeText(options.threadsAccessToken || options.accessToken || env.THREADS_ACCESS_TOKEN);

  if (!job.postId) {
    throw new Error('job.postId is required before measurement.');
  }
  if (!accessToken) {
    throw new Error('THREADS_ACCESS_TOKEN is required on the DO worker.');
  }

  const version = options.threadsVersion || options.version || env.THREADS_API_VERSION;
  const mediaRequest = buildThreadsMediaRequest({
    mediaId: job.postId,
    version,
    accessToken,
  });
  const insightsRequest = buildThreadsMediaInsightsRequest({
    mediaId: job.postId,
    version,
    accessToken,
  });
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const [mediaResponse, insightsResponse] = await Promise.all([
    fetchImpl(mediaRequest.url, { method: mediaRequest.method }),
    fetchImpl(insightsRequest.url, { method: insightsRequest.method }),
  ]);
  const [media, insights] = await Promise.all([
    readJsonResponse(mediaResponse),
    readJsonResponse(insightsResponse),
  ]);
  const metrics = normalizeThreadsPostMetrics({ media, insights });
  const now = new Date().toISOString();
  const interactionCount = metrics.likeCount + metrics.replyCount + metrics.repostCount + metrics.quoteCount;
  const shareCount = metrics.repostCount + metrics.quoteCount;

  return {
    status: 'measured',
    channel: 'threads',
    integration: 'threads_api',
    measuredAt: now,
    updatedAt: now,
    postId: metrics.postId || job.postId,
    mediaId: metrics.postId || job.postId,
    permalinkUrl: metrics.permalinkUrl || job.permalinkUrl,
    reactionCount: metrics.likeCount,
    commentCount: metrics.replyCount,
    shareCount,
    clickCount: 0,
    impressionCount: metrics.viewCount,
    uniqueImpressionCount: 0,
    engagedUsers: interactionCount,
    viewCount: metrics.viewCount,
    likeCount: metrics.likeCount,
    replyCount: metrics.replyCount,
    repostCount: metrics.repostCount,
    quoteCount: metrics.quoteCount,
    marketSignalScore: metrics.marketSignalScore,
    metrics,
    error: '',
  };
}

export async function measureMetaMarketJob(job = {}, options = {}) {
  return isThreadsJob(job)
    ? measureThreadsMarketJob(job, options)
    : measureFacebookPageMarketJob(job, options);
}

export async function executeMetaMarketJob(job = {}, options = {}) {
  if (options.dryRun) {
    return {
      jobId: job.id,
      action: job.postId ? 'measure' : 'publish',
      dryRun: true,
      update: {
        checkedAt: new Date().toISOString(),
      },
    };
  }

  if (job.postId) {
    return {
      jobId: job.id,
      action: 'measure',
      dryRun: false,
      update: await measureMetaMarketJob(job, options),
    };
  }

  return {
    jobId: job.id,
    action: 'publish',
    dryRun: false,
    update: await publishMetaMarketJob(job, options),
  };
}

async function resolveGunImpl(explicitImpl) {
  if (explicitImpl) return explicitImpl;
  const moduleResult = await import('gun');
  if (typeof moduleResult?.default === 'function') return moduleResult.default;
  if (typeof moduleResult === 'function') return moduleResult;
  throw new Error('Unable to load Gun for Meta market worker.');
}

export async function createMetaMarketGunClient(options = {}) {
  const GunImpl = await resolveGunImpl(options.GunImpl);
  const envPeers = typeof process !== 'undefined' && process.env
    ? process.env.GROWTH_GUN_PEERS
    : '';
  const peers = splitList(options.gunPeers || options.peers || envPeers, DEFAULT_GUN_PEERS);
  const gun = options.gun || GunImpl({
    peers,
    localStorage: false,
    radisk: false,
    file: false,
    multicast: false,
    axe: false,
  });
  const jobsNode = getNode(gun, META_MARKET_JOBS_PATH);
  const snapshotsNode = getNode(gun, META_MARKET_SNAPSHOTS_PATH);

  return {
    async readJobs() {
      const records = await readGunMap(jobsNode, { waitMs: options.readWaitMs });
      return records.map((record) => normalizeMetaMarketJob(record.data, record.id));
    },
    async writeJobUpdate(jobId, update) {
      return putNode(jobsNode.get(jobId), update);
    },
    async writeSnapshot(jobId, update) {
      const snapshotId = `${Date.now()}-${jobId}`;
      return putNode(snapshotsNode.get(jobId).get(snapshotId), {
        ...update,
        jobId,
        snapshotId,
      });
    },
    async readJob(jobId) {
      return normalizeMetaMarketJob(await onceNode(jobsNode.get(jobId)), jobId);
    },
  };
}

export async function runMetaMarketWorkerOnce(options = {}) {
  const now = typeof options.now === 'function' ? options.now() : new Date();
  const limit = Math.max(1, Number.parseInt(options.limit, 10) || 3);
  const client = options.client || await createMetaMarketGunClient(options);
  const allJobs = await client.readJobs();
  const jobs = allJobs
    .filter((job) => isApprovedMetaMarketJob(job) || shouldMeasureMetaMarketJob(job, now))
    .slice(0, limit);
  const results = [];

  for (const job of jobs) {
    try {
      const result = await executeMetaMarketJob(job, options);
      results.push(result);
      if (!options.dryRun && result.update) {
        await client.writeJobUpdate(job.id, result.update);
        if (result.action === 'measure') {
          await client.writeSnapshot(job.id, result.update);
        }
      }
    } catch (error) {
      const failure = {
        jobId: job.id,
        action: job.postId ? 'measure' : 'publish',
        error: error.message,
      };
      results.push(failure);
      if (!options.dryRun) {
        await client.writeJobUpdate(job.id, {
          status: 'error',
          error: error.message,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  }

  return {
    checkedAt: now.toISOString(),
    dryRun: Boolean(options.dryRun),
    jobsSeen: allJobs.length,
    jobsProcessed: results.length,
    results,
  };
}

function formatWorkerSummary(summary = {}) {
  const lines = [
    'Meta market worker complete',
    `Mode: ${summary.dryRun ? 'dry run' : 'live'}`,
    `Jobs seen: ${summary.jobsSeen || 0}`,
    `Jobs processed: ${summary.jobsProcessed || 0}`,
  ];

  (summary.results || []).forEach((result) => {
    const status = result.error ? `error: ${result.error}` : (result.update?.status || 'checked');
    lines.push(`- ${result.jobId || 'unknown'} ${result.action || 'job'}: ${status}`);
  });

  return `${lines.join('\n')}\n`;
}

export async function runMetaMarketWorkerCli(options = {}) {
  const argv = options.argv || process.argv.slice(2);
  const stdout = options.stdout || process.stdout;
  const stderr = options.stderr || process.stderr;

  try {
    const parsed = parseMetaMarketWorkerArgs(argv);
    if (parsed.help) {
      stdout.write(HELP_TEXT);
      return { exitCode: 0 };
    }

    const summary = await runMetaMarketWorkerOnce({
      ...options,
      ...parsed,
    });
    stdout.write(parsed.json
      ? `${JSON.stringify(summary, null, 2)}\n`
      : formatWorkerSummary(summary));
    return { exitCode: 0, summary };
  } catch (error) {
    stderr.write(`Meta market worker failed: ${error.message}\n`);
    return { exitCode: 1, error };
  }
}
