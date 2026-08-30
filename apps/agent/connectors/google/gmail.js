const { getGoogleAccessToken } = require('./oauth');

const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

function normalizeText(value) {
  return String(value || '').trim();
}

function requireAccount(identifier) {
  const value = normalizeText(identifier);
  if (!value) throw new Error('accountId is required for Gmail actions.');
  return value;
}

function headerValue(value, field) {
  const text = normalizeText(value);
  if (!text) throw new Error(`${field} is required.`);
  if (/\r|\n/.test(text)) throw new Error(`${field} contains invalid newline characters.`);
  return text;
}

function base64Url(value) {
  return Buffer.from(value, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function buildRawMessage({ from, to, subject, body }) {
  const headers = [
    `From: ${headerValue(from, 'from')}`,
    `To: ${headerValue(to, 'to')}`,
    `Subject: ${headerValue(subject, 'subject')}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
  ];
  return base64Url(`${headers.join('\r\n')}\r\n\r\n${String(body || '')}`);
}

async function authorizedRequest(accountId, url, request = {}, options = {}) {
  const identifier = requireAccount(accountId);
  const tokenResolver = options.tokenResolver || getGoogleAccessToken;
  const fetchImpl = options.fetchImpl || fetch;
  const tokenOptions = options.tokenOptions || options;
  const { account, accessToken } = await tokenResolver(identifier, tokenOptions);
  const response = await fetchImpl(url, {
    ...request,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(request.body ? { 'Content-Type': 'application/json' } : {}),
      ...(request.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `Gmail API request failed: ${response.status}`);
  }
  return { account, payload };
}

async function searchMessages({ accountId, query = '', maxResults = 25 } = {}, options = {}) {
  const params = new URLSearchParams();
  if (normalizeText(query)) params.set('q', normalizeText(query));
  params.set('maxResults', String(Math.min(100, Math.max(1, Number(maxResults) || 25))));
  const { account, payload } = await authorizedRequest(
    accountId,
    `${GMAIL_API_BASE}/messages?${params.toString()}`,
    {},
    options,
  );
  return {
    account,
    messages: Array.isArray(payload.messages) ? payload.messages : [],
    nextPageToken: payload.nextPageToken || '',
    resultSizeEstimate: Number(payload.resultSizeEstimate) || 0,
  };
}

async function readMessage({ accountId, messageId, format = 'full' } = {}, options = {}) {
  const id = encodeURIComponent(headerValue(messageId, 'messageId'));
  const allowedFormats = new Set(['minimal', 'full', 'raw', 'metadata']);
  const resolvedFormat = allowedFormats.has(format) ? format : 'full';
  const { account, payload } = await authorizedRequest(
    accountId,
    `${GMAIL_API_BASE}/messages/${id}?format=${encodeURIComponent(resolvedFormat)}`,
    {},
    options,
  );
  return { account, message: payload };
}

async function createDraft({ accountId, to, subject, body, threadId } = {}, options = {}) {
  const identifier = requireAccount(accountId);
  const tokenResolver = options.tokenResolver || getGoogleAccessToken;
  const tokenOptions = options.tokenOptions || options;
  const auth = await tokenResolver(identifier, tokenOptions);
  const raw = buildRawMessage({
    from: auth.account.email,
    to,
    subject,
    body,
  });
  const message = { raw };
  if (normalizeText(threadId)) message.threadId = normalizeText(threadId);

  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(`${GMAIL_API_BASE}/drafts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.error || `Unable to create Gmail draft: ${response.status}`);
  }
  return { account: auth.account, draft: payload };
}

module.exports = {
  buildRawMessage,
  createDraft,
  readMessage,
  searchMessages,
};
