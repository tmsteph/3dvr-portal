import Stripe from 'stripe';
import { runMoneyLoop } from '../../src/money/engine.js';
import { runAutopilotCycle } from '../../src/money/autopilot.js';
import {
  DEFAULT_RATE_LIMITS,
  createInMemoryRateLimiter,
  issueUserToken,
  normalizeEmail,
  parsePlanLimits,
  parsePricePlanMap,
  resolveUserTokenSecret,
  resolvePlanFromSubscription,
  verifyUserToken
} from '../../src/money/access.js';

const rateLimiter = createInMemoryRateLimiter();

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Autopilot-Token, Authorization');
}

function normalizeRequestBody(body = {}) {
  const payload = body && typeof body === 'object' ? body : {};
  return {
    mode: payload.mode,
    market: payload.market,
    keywords: payload.keywords,
    channels: payload.channels,
    budget: payload.budget,
    limit: payload.limit,
    runId: payload.runId,
    openAiApiKey: payload.openAiApiKey,
    openAiModel: payload.openAiModel,
    email: payload.email
  };
}

function parseBooleanQuery(value) {
  if (typeof value === 'boolean') return value;
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
}

function parseCsvQuery(value) {
  return String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function getAutopilotToken(req) {
  const headerValue = req?.headers?.['x-autopilot-token']
    || req?.headers?.['X-Autopilot-Token']
    || req?.headers?.authorization
    || req?.headers?.Authorization;

  const header = String(headerValue || '').trim();
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  if (header) {
    return header;
  }
  return String(req?.query?.token || '').trim();
}

function getBearerToken(req) {
  const header = String(req?.headers?.authorization || req?.headers?.Authorization || '').trim();
  if (!header) {
    return '';
  }
  if (header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim();
  }
  return header;
}

function makeStripeClient(config = process.env) {
  const secretKey = String(config.STRIPE_SECRET_KEY || '').trim();
  if (!secretKey) {
    return null;
  }

  return new Stripe(secretKey, {
    apiVersion: '2023-10-16'
  });
}

function parseSubscriptionStatuses(value) {
  const input = String(value || 'active,trialing').trim();
  return input
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean);
}

async function resolveUserEntitlement({ email, stripeClient, config = process.env }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !normalizedEmail.includes('@')) {
    return {
      ok: false,
      reason: 'A valid email is required.'
    };
  }

  const allowFree = String(config.MONEY_AUTOPILOT_ALLOW_FREE_PLAN || '').trim().toLowerCase() === 'true';
  if (!stripeClient) {
    if (allowFree) {
      return {
        ok: true,
        plan: 'free',
        email: normalizedEmail,
        source: 'free-fallback'
      };
    }

    return {
      ok: false,
      reason: 'Stripe is not configured for entitlement checks.'
    };
  }

  const customers = await stripeClient.customers.list({ email: normalizedEmail, limit: 1 });
  const customer = customers?.data?.[0];

  if (!customer) {
    if (allowFree) {
      return {
        ok: true,
        plan: 'free',
        email: normalizedEmail,
        source: 'free-fallback'
      };
    }

    return {
      ok: false,
      reason: 'No subscription found for this email.'
    };
  }

  const subscriptions = await stripeClient.subscriptions.list({
    customer: customer.id,
    status: 'all',
    limit: 20
  });

  const allowedStatuses = parseSubscriptionStatuses(config.MONEY_AUTOPILOT_ALLOWED_SUB_STATUSES);
  const activeSubscription = (subscriptions?.data || []).find(item => {
    return allowedStatuses.includes(String(item.status || '').toLowerCase());
  });

  if (!activeSubscription) {
    if (allowFree) {
      return {
        ok: true,
        plan: 'free',
        email: normalizedEmail,
        source: 'free-fallback',
        customerId: customer.id
      };
    }

    return {
      ok: false,
      reason: 'No active or trialing subscription found.'
    };
  }

  const pricePlanMap = parsePricePlanMap(config.MONEY_AUTOPILOT_PRICE_PLAN_MAP);
  const plan = resolvePlanFromSubscription(activeSubscription, pricePlanMap);

  return {
    ok: true,
    plan,
    email: normalizedEmail,
    customerId: customer.id,
    subscriptionId: activeSubscription.id,
    source: 'stripe'
  };
}

function getRateLimits(config = process.env) {
  return parsePlanLimits(config.MONEY_AUTOPILOT_RATE_LIMITS, DEFAULT_RATE_LIMITS);
}

function enforceRateLimit({ actor, config = process.env, now = Date.now() }) {
  if (!actor || actor.kind !== 'user') {
    return {
      allowed: true,
      scope: 'bypass',
      limits: { minute: 9999, day: 9999 },
      minute: { remaining: 9999 },
      day: { remaining: 9999 }
    };
  }

  const limits = getRateLimits(config);
  return rateLimiter.consume({
    subject: actor.sub,
    plan: actor.plan,
    limits,
    now
  });
}

function parseUserTokenFromRequest(req, config = process.env) {
  const token = getBearerToken(req);
  if (!token) {
    return {
      ok: false,
      reason: 'missing bearer token'
    };
  }

  const secret = resolveUserTokenSecret(config);
  if (!secret) {
    return {
      ok: false,
      reason: 'Configure MONEY_AUTOPILOT_USER_TOKEN_SECRET or MONEY_AUTOPILOT_TOKEN.'
    };
  }

  const verification = verifyUserToken(token, secret);
  if (!verification.valid) {
    return {
      ok: false,
      reason: verification.reason || 'invalid token'
    };
  }

  return {
    ok: true,
    actor: {
      kind: 'user',
      sub: verification.payload.sub,
      email: verification.payload.email,
      plan: verification.payload.plan,
      payload: verification.payload
    }
  };
}

function shouldRequireUserToken(config = process.env) {
  return String(config.MONEY_AUTOPILOT_REQUIRE_USER_TOKEN || '').trim().toLowerCase() === 'true';
}

function unauthorized(res, message) {
  return res.status(401).json({ error: message || 'Unauthorized' });
}

export function createMoneyLoopHandler(options = {}) {
  const runLoopImpl = options.runLoopImpl || runMoneyLoop;
  const runAutopilotImpl = options.runAutopilotImpl || runAutopilotCycle;
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const stripeClient = options.stripeClient || makeStripeClient(options.config || process.env);
  const config = options.config || process.env;
  const resolveEntitlementImpl = options.resolveEntitlementImpl
    || (params => resolveUserEntitlement({ ...params, config }));

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    if (req.method === 'GET') {
      const mode = String(req?.query?.mode || '').trim().toLowerCase();
      if (mode !== 'autopilot') {
        return res.status(200).json({
          ok: true,
          endpoint: 'money-loop',
          methods: ['POST', 'GET?mode=autopilot']
        });
      }

      const expectedAdminToken = String(config.MONEY_AUTOPILOT_TOKEN || '').trim();
      const providedAutopilotToken = getAutopilotToken(req);
      const adminAuthorized = Boolean(
        expectedAdminToken
        && providedAutopilotToken
        && providedAutopilotToken === expectedAdminToken
      );

      let actor = { kind: 'admin', sub: 'admin', plan: 'admin', email: '' };

      if (!adminAuthorized) {
        const tokenResult = parseUserTokenFromRequest(req, config);
        if (!tokenResult.ok) {
          return unauthorized(res, `Unauthorized autopilot trigger: ${tokenResult.reason}`);
        }
        actor = tokenResult.actor;
      }

      const rateLimit = enforceRateLimit({ actor, config });
      if (!rateLimit.allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded for your plan.',
          rateLimit
        });
      }

      try {
        const result = await runAutopilotImpl({
          fetchImpl,
          dryRun: parseBooleanQuery(req?.query?.dryRun),
          autoDiscover: parseBooleanQuery(req?.query?.autoDiscover),
          publishEnabled: parseBooleanQuery(req?.query?.publish),
          vercelDeploy: parseBooleanQuery(req?.query?.vercelDeploy),
          promotionEnabled: parseBooleanQuery(req?.query?.promotion),
          market: req?.query?.market ? String(req.query.market) : undefined,
          keywords: req?.query?.keywords ? parseCsvQuery(req.query.keywords) : undefined,
          channels: req?.query?.channels ? parseCsvQuery(req.query.channels) : undefined,
          budget: req?.query?.budget
        });

        return res.status(200).json({
          mode: 'autopilot',
          actor: {
            kind: actor.kind,
            plan: actor.plan,
            email: actor.email || ''
          },
          rateLimit,
          ...result,
          createdAt: Date.now()
        });
      } catch (error) {
        return res.status(500).json({
          error: error?.message || 'Autopilot run failed.'
        });
      }
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const payload = normalizeRequestBody(req.body);

    if (String(payload.mode || '').trim().toLowerCase() === 'token') {
      try {
        let tokenEmail = normalizeEmail(payload.email);
        let emailSource = 'input';
        if (!tokenEmail) {
          const existingToken = parseUserTokenFromRequest(req, config);
          if (!existingToken.ok) {
            return res.status(400).json({
              error: 'Provide subscriber email or a valid bearer token to refresh access.'
            });
          }
          tokenEmail = existingToken.actor.email;
          emailSource = 'token';
        }

        const entitlement = await resolveEntitlementImpl({
          email: tokenEmail,
          stripeClient,
          config
        });

        if (!entitlement.ok) {
          return res.status(403).json({ error: entitlement.reason || 'Unable to issue token.' });
        }

        const secret = resolveUserTokenSecret(config);
        if (!secret) {
          return res.status(500).json({
            error: 'Configure MONEY_AUTOPILOT_USER_TOKEN_SECRET or MONEY_AUTOPILOT_TOKEN.'
          });
        }

        const ttlSeconds = Number(config.MONEY_AUTOPILOT_USER_TOKEN_TTL_SECONDS) || 60 * 60 * 24 * 7;
        const issued = issueUserToken({
          email: entitlement.email,
          plan: entitlement.plan,
          secret,
          ttlSeconds
        });

        return res.status(200).json({
          ok: true,
          token: issued.token,
          plan: issued.payload.plan,
          email: issued.payload.email,
          expiresAt: new Date(issued.payload.exp * 1000).toISOString(),
          emailSource,
          entitlement: {
            source: entitlement.source,
            customerId: entitlement.customerId || '',
            subscriptionId: entitlement.subscriptionId || ''
          }
        });
      } catch (error) {
        return res.status(500).json({ error: error?.message || 'Token issuance failed.' });
      }
    }

    if (typeof payload.market !== 'undefined' && typeof payload.market !== 'string') {
      return res.status(400).json({ error: 'market must be a string when provided.' });
    }

    let actor = { kind: 'anonymous', sub: 'anon', plan: 'free', email: '' };
    const tokenResult = parseUserTokenFromRequest(req, config);
    if (tokenResult.ok) {
      actor = tokenResult.actor;
    } else if (shouldRequireUserToken(config)) {
      return unauthorized(res, `A valid user token is required: ${tokenResult.reason}`);
    }

    const rateLimit = enforceRateLimit({ actor, config });
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded for your plan.',
        rateLimit
      });
    }

    try {
      const result = await runLoopImpl(payload, {
        fetchImpl,
        openAiApiKey: config.OPENAI_API_KEY,
        openAiModel: config.OPENAI_MODEL
      });

      return res.status(200).json({
        actor: {
          kind: actor.kind,
          plan: actor.plan,
          email: actor.email || ''
        },
        rateLimit,
        ...result,
        createdAt: Date.now()
      });
    } catch (error) {
      return res.status(500).json({
        error: error?.message || 'Money loop run failed.'
      });
    }
  };
}

const handler = createMoneyLoopHandler();
export default handler;
