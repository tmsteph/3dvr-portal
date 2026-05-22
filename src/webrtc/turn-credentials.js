import { createHmac, randomBytes } from 'node:crypto';

export const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302'
];

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseUrlList(value) {
  return String(value || '')
    .split(/[\n,]+/)
    .map(item => item.trim())
    .filter(Boolean);
}

function normalizeTtlSeconds(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return 3600;
  return Math.min(Math.max(parsed, 300), 86400);
}

function normalizeUsernamePrefix(value) {
  const normalized = normalizeText(value)
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return normalized || 'portal';
}

function createTurnCredential(username, secret) {
  return createHmac('sha1', secret)
    .update(username)
    .digest('base64');
}

function createRandomId() {
  return randomBytes(5).toString('hex');
}

export function buildTurnCredentialPayload(options = {}) {
  const {
    config = process.env,
    nowMs = Date.now(),
    randomId = createRandomId
  } = options;

  const configuredStunUrls = parseUrlList(config.TURN_STUN_URLS);
  const iceServers = [{ urls: configuredStunUrls.length ? configuredStunUrls : DEFAULT_STUN_URLS }];
  const turnUrls = parseUrlList(config.TURN_URLS);
  const secret = normalizeText(config.TURN_STATIC_AUTH_SECRET);

  if (!secret || !turnUrls.length) {
    return {
      configured: false,
      reason: 'TURN_URLS and TURN_STATIC_AUTH_SECRET are required for relay credentials.',
      iceServers
    };
  }

  const ttlSeconds = normalizeTtlSeconds(config.TURN_TTL_SECONDS);
  const expiresAt = Math.floor(nowMs / 1000) + ttlSeconds;
  const username = `${expiresAt}:${normalizeUsernamePrefix(config.TURN_USERNAME_PREFIX)}-${randomId()}`;
  const credential = createTurnCredential(username, secret);

  iceServers.push({
    urls: turnUrls,
    username,
    credential
  });

  return {
    configured: true,
    ttlSeconds,
    expiresAt,
    realm: normalizeText(config.TURN_REALM),
    iceServers
  };
}
