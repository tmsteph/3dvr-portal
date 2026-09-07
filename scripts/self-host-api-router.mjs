import trialHandler from '../api/trial.js';
import githubPublishHandler from '../api/github-publish.js';
import sessionHandler from '../api/session.js';
import calendarProviderHandler from '../api/calendar/[provider].js';
import reminderEmailHandler from '../api/calendar/reminder-email.js';
import growthHomepageHeroCronHandler from '../api/growth/homepage-hero-cron.js';
import moneyAutopilotCronHandler from '../api/money/autopilot-cron.js';
import moneyLoopHandler from '../api/money/loop.js';
import oauthProviderHandler from '../api/oauth/[provider].js';
import stripeRouteHandler from '../api/stripe/[route].js';
import stripeWebhookHandler from '../api/webhooks/stripe.js';

const MAX_BODY_BYTES = 1024 * 1024;

const EXACT_ROUTES = new Map([
  ['/api/trial', { handler: trialHandler }],
  ['/api/github-publish', { handler: githubPublishHandler }],
  ['/api/vercel-deploy', { handler: githubPublishHandler, params: { provider: 'vercel' } }],
  ['/api/session', { handler: sessionHandler }],
  ['/api/calendar/reminder-email', { handler: reminderEmailHandler }],
  ['/api/account-recovery-email', { handler: reminderEmailHandler }],
  ['/api/growth/homepage-hero-cron', { handler: growthHomepageHeroCronHandler }],
  ['/api/money/autopilot-cron', { handler: moneyAutopilotCronHandler }],
  ['/api/money/loop', { handler: moneyLoopHandler }],
  ['/api/webhooks/stripe', { handler: stripeWebhookHandler, rawBody: true }],
  ['/webhooks/stripe', { handler: stripeWebhookHandler, rawBody: true }],
]);

function json(res, statusCode, payload) {
  res.statusCode = statusCode;
  if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readRequestBody(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) {
      throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function parseBody(raw, contentType = '') {
  if (!raw.length) return {};
  const type = String(contentType || '').toLowerCase();
  const text = raw.toString('utf8');
  if (type.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (type.includes('application/json') || !type) {
    try {
      return JSON.parse(text);
    } catch {
      throw Object.assign(new Error('Invalid JSON request body'), { statusCode: 400 });
    }
  }
  return text;
}

function adaptResponse(res) {
  if (!Object.prototype.hasOwnProperty.call(res, 'headers')) {
    Object.defineProperty(res, 'headers', {
      configurable: true,
      get() { return res.getHeaders?.() || {}; },
    });
  }
  res.status = code => {
    res.statusCode = code;
    return res;
  };
  res.json = payload => {
    if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
    return res;
  };
  res.send = payload => {
    if (Buffer.isBuffer(payload)) {
      res.end(payload);
      return res;
    }
    if (payload && typeof payload === 'object') {
      if (!res.headersSent) res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(payload));
      return res;
    }
    res.end(payload == null ? '' : String(payload));
    return res;
  };
  return res;
}

function resolveRoute(pathname) {
  const exact = EXACT_ROUTES.get(pathname);
  if (exact) return { ...exact, params: exact.params || {} };

  let match = pathname.match(/^\/api\/calendar\/([^/]+)$/);
  if (match) return { handler: calendarProviderHandler, params: { provider: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/oauth\/([^/]+)$/);
  if (match) return { handler: oauthProviderHandler, params: { provider: decodeURIComponent(match[1]) } };

  match = pathname.match(/^\/api\/stripe\/([^/]+)$/);
  if (match) return { handler: stripeRouteHandler, params: { route: decodeURIComponent(match[1]) } };

  return null;
}

export function hasNativeApiRoute(pathname = '') {
  return Boolean(resolveRoute(String(pathname || '')));
}

export async function runNativeApi(req, res, url) {
  const route = resolveRoute(url.pathname);
  if (!route) return false;

  try {
    req.query = {
      ...Object.fromEntries(url.searchParams.entries()),
      ...route.params,
    };

    if (!route.rawBody && req.method !== 'OPTIONS' && req.method !== 'HEAD' && req.method !== 'GET') {
      const raw = await readRequestBody(req);
      req.body = parseBody(raw, req.headers['content-type']);
    } else if (!route.rawBody) {
      req.body = {};
    }

    await route.handler(req, adaptResponse(res));
  } catch (error) {
    if (!res.headersSent) {
      json(res, error?.statusCode || 500, { error: error?.message || 'API request failed' });
    } else if (!res.writableEnded) {
      res.destroy(error);
    }
  }

  return true;
}
