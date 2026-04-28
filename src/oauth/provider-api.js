import crypto from 'node:crypto';
import {
  buildOAuthFallbackAlias,
  normalizeOAuthEmail,
  normalizeOAuthText,
} from './shared.js';

export const PORTAL_OAUTH_FLOW_COOKIE = 'portalOauthFlow';

const FLOW_MAX_AGE_SECONDS = 15 * 60;
const DEFAULT_RETURN_PATH = '/sign-in.html';
const GOOGLE_CONTACTS_FIELDS = [
  'names',
  'emailAddresses',
  'phoneNumbers',
  'organizations',
  'biographies',
].join(',');

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value = '') {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 ? '='.repeat(4 - (normalized.length % 4)) : '';
  return Buffer.from(`${normalized}${padding}`, 'base64');
}

function randomBase64Url(bytes = 32) {
  return toBase64Url(crypto.randomBytes(bytes));
}

function sha256Base64Url(value = '') {
  return toBase64Url(crypto.createHash('sha256').update(String(value || '')).digest());
}

function parseJsonSafely(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch (_err) {
    return fallback;
  }
}

function parseJwtPayload(token = '') {
  const raw = String(token || '').trim();
  const segments = raw.split('.');
  if (segments.length < 2) {
    return {};
  }
  try {
    return parseJsonSafely(fromBase64Url(segments[1]).toString('utf8'), {}) || {};
  } catch (_err) {
    return {};
  }
}

function parseCookieHeader(header = '') {
  return String(header || '')
    .split(';')
    .reduce((acc, part) => {
      const separator = part.indexOf('=');
      if (separator === -1) return acc;
      const key = part.slice(0, separator).trim();
      const value = part.slice(separator + 1).trim();
      if (key) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function setCookie(res, name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.path) parts.push(`Path=${options.path}`);
  if (typeof options.maxAge === 'number') parts.push(`Max-Age=${Math.max(0, Math.round(options.maxAge))}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.secure) parts.push('Secure');
  const next = parts.join('; ');
  const current = res.headers?.['Set-Cookie'] || res.headers?.['set-cookie'];
  if (!current) {
    res.setHeader('Set-Cookie', next);
    return;
  }
  const values = Array.isArray(current) ? current.concat(next) : [current, next];
  res.setHeader('Set-Cookie', values);
}

function clearCookie(res, name) {
  setCookie(res, name, '', {
    path: '/',
    maxAge: 0,
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
  });
}

function getRequestOrigin(req) {
  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').trim();
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
  const proto = forwardedProto || 'https';
  if (!forwardedHost) {
    return 'https://portal.3dvr.tech';
  }
  return `${proto}://${forwardedHost}`;
}

function sanitizeReturnPath(rawValue = '') {
  const candidate = normalizeOAuthText(rawValue);
  if (!candidate) {
    return DEFAULT_RETURN_PATH;
  }
  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    return candidate;
  }
  try {
    const parsed = new URL(candidate);
    return parsed.pathname && parsed.pathname.startsWith('/')
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : DEFAULT_RETURN_PATH;
  } catch (_err) {
    return DEFAULT_RETURN_PATH;
  }
}

function normalizeScopeKey(value = '') {
  const normalized = normalizeOAuthText(value).toLowerCase();
  return normalized || 'identity';
}

function normalizeIntent(value = '') {
  const normalized = normalizeOAuthText(value).toLowerCase();
  return normalized || 'signin';
}

function normalizeAliasHint(value = '') {
  const normalized = normalizeOAuthEmail(value);
  return normalized || '';
}

function normalizeProvider(req) {
  const raw = Array.isArray(req?.query?.provider) ? req.query.provider[0] : req?.query?.provider;
  return normalizeOAuthText(raw).toLowerCase();
}

function readAction(req, body = {}) {
  const queryValue = Array.isArray(req?.query?.action) ? req.query.action[0] : req?.query?.action;
  const bodyValue = body && typeof body.action === 'string' ? body.action : '';
  return normalizeOAuthText(queryValue || bodyValue).toLowerCase();
}

async function readBody(req) {
  if (req?.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req?.body === 'string') {
    const asString = req.body;
    const contentType = String(req?.headers?.['content-type'] || '').toLowerCase();
    if (contentType.includes('application/json')) {
      return parseJsonSafely(asString, {}) || {};
    }
    if (contentType.includes('application/x-www-form-urlencoded')) {
      return Object.fromEntries(new URLSearchParams(asString));
    }
  }
  if (!req || typeof req.on !== 'function') {
    return {};
  }
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  if (!chunks.length) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  const contentType = String(req?.headers?.['content-type'] || '').toLowerCase();
  if (contentType.includes('application/json')) {
    return parseJsonSafely(raw, {}) || {};
  }
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return {};
}

function buildFlowCookieValue(flow = {}) {
  return toBase64Url(JSON.stringify(flow));
}

function parseFlowCookie(req) {
  const cookies = parseCookieHeader(req?.headers?.cookie || '');
  const raw = cookies[PORTAL_OAUTH_FLOW_COOKIE];
  if (!raw) {
    return null;
  }
  try {
    return parseJsonSafely(fromBase64Url(raw).toString('utf8'), null);
  } catch (_err) {
    return null;
  }
}

function buildCallbackResultPage(result = {}, returnPath = DEFAULT_RETURN_PATH) {
  const payload = {
    ...result,
    returnTo: sanitizeReturnPath(returnPath),
    updatedAt: Date.now(),
  };
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  const redirectTarget = JSON.stringify(sanitizeReturnPath(returnPath));
  const isCli = normalizeIntent(payload.intent) === 'cli';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>3DVR OAuth</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background: #08111f;
      color: #f8fbff;
      font-family: "Segoe UI", sans-serif;
    }
    .card {
      width: min(100%, ${isCli ? '720px' : '420px'});
      padding: 24px;
      border-radius: 20px;
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: rgba(9, 20, 38, 0.92);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
    }
    a {
      color: #9bd0ff;
    }
    textarea {
      box-sizing: border-box;
      width: 100%;
      min-height: 220px;
      margin: 12px 0;
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      border-radius: 12px;
      background: rgba(0, 0, 0, 0.28);
      color: #f8fbff;
      font: 0.85rem ui-monospace, "SFMono-Regular", Consolas, monospace;
    }
    code {
      color: #d7ecff;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1 style="margin:0 0 12px;font-size:1.25rem;">${isCli ? '3DVR CLI OAuth Ready' : 'Returning to 3DVR Portal...'}</h1>
    ${isCli
      ? '<p style="margin:0 0 12px;line-height:1.6;">Copy this result, then run <code>3dvr auth import</code> in your terminal and paste it when prompted.</p><textarea id="oauth-result" readonly></textarea><p style="margin:0;"><a href=' + redirectTarget + '>Open portal</a></p>'
      : '<p style="margin:0 0 12px;line-height:1.6;">Your OAuth result is being stored in this browser and you will be redirected automatically.</p><p style="margin:0;"><a href=' + redirectTarget + '>Continue manually</a></p>'}
  </div>
  <script>
    try {
      const oauthResult = ${serialized};
      localStorage.setItem('portal.oauth.result', JSON.stringify(oauthResult));
      const textarea = document.getElementById('oauth-result');
      if (textarea) {
        textarea.value = JSON.stringify(oauthResult, null, 2);
        textarea.focus();
        textarea.select();
      }
    } catch (_err) {}
    if (${JSON.stringify(!isCli)}) {
      window.location.replace(${redirectTarget});
    }
  </script>
</body>
</html>`;
}

function jsonError(res, status, error, extra = {}) {
  return res.status(status).json({
    error,
    ...extra,
  });
}

function sendHtml(res, status, html) {
  res.status(status);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.end(html);
}

function createGoogleProvider(config = process.env) {
  return {
    label: 'Google',
    configured: Boolean(normalizeOAuthText(config.GOOGLE_OAUTH_CLIENT_ID) && normalizeOAuthText(config.GOOGLE_OAUTH_CLIENT_SECRET)),
    supports: {
      signin: true,
      contacts: true,
      calendar: true,
      mail: true,
    },
    buildAuthorizationUrl({ state, verifier, scopeKey, redirectUri }) {
      const scopes = new Set(['openid', 'email', 'profile']);
      if (scopeKey === 'contacts' || scopeKey === 'contacts-calendar') {
        scopes.add('https://www.googleapis.com/auth/contacts.readonly');
      }
      if (scopeKey === 'calendar' || scopeKey === 'contacts-calendar') {
        scopes.add('https://www.googleapis.com/auth/calendar');
      }
      if (scopeKey === 'mail' || scopeKey === 'gmail') {
        scopes.add('https://mail.google.com/');
      }
      const params = new URLSearchParams({
        client_id: config.GOOGLE_OAUTH_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        access_type: 'offline',
        include_granted_scopes: 'true',
        code_challenge: sha256Base64Url(verifier),
        code_challenge_method: 'S256',
        state,
        scope: Array.from(scopes).join(' '),
      });
      if (scopeKey !== 'identity') {
        params.set('prompt', 'consent');
      } else {
        params.set('prompt', 'select_account');
      }
      return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    },
    async exchangeCode({ code, verifier, redirectUri, fetchImpl }) {
      const response = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.GOOGLE_OAUTH_CLIENT_ID,
          client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error_description || payload.error || 'Unable to exchange Google OAuth code.');
      }
      return payload;
    },
    async refreshAccessToken({ refreshToken, fetchImpl }) {
      const response = await fetchImpl('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.GOOGLE_OAUTH_CLIENT_ID,
          client_secret: config.GOOGLE_OAUTH_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error_description || payload.error || 'Unable to refresh Google OAuth token.');
      }
      return payload;
    },
    async fetchIdentity(tokens, fetchImpl) {
      const response = await fetchImpl('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error_description || payload.error || 'Unable to load Google identity.');
      }
      return {
        provider: 'google',
        providerAccountId: normalizeOAuthText(payload.sub),
        email: normalizeOAuthEmail(payload.email),
        emailVerified: Boolean(payload.email_verified),
        displayName: normalizeOAuthText(payload.name),
        givenName: normalizeOAuthText(payload.given_name),
        familyName: normalizeOAuthText(payload.family_name),
      };
    },
    async listContacts(accessToken, fetchImpl, { limit = 200 } = {}) {
      const params = new URLSearchParams({
        personFields: GOOGLE_CONTACTS_FIELDS,
        pageSize: String(Math.min(Math.max(Number(limit) || 1, 1), 500)),
      });
      const response = await fetchImpl(
        `https://people.googleapis.com/v1/people/me/connections?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Unable to load Google contacts.');
      }
      return {
        contacts: (Array.isArray(payload.connections) ? payload.connections : []).map(person => {
          const email = Array.isArray(person.emailAddresses) && person.emailAddresses[0]
            ? normalizeOAuthEmail(person.emailAddresses[0].value)
            : '';
          const phone = Array.isArray(person.phoneNumbers) && person.phoneNumbers[0]
            ? normalizeOAuthText(person.phoneNumbers[0].value)
            : '';
          const organization = Array.isArray(person.organizations) && person.organizations[0]
            ? person.organizations[0]
            : {};
          const notes = Array.isArray(person.biographies) && person.biographies[0]
            ? normalizeOAuthText(person.biographies[0].value)
            : '';
          return {
            id: normalizeOAuthText(person.resourceName || person.etag || email || phone),
            name: Array.isArray(person.names) && person.names[0]
              ? normalizeOAuthText(person.names[0].displayName)
              : '',
            email,
            phone,
            company: normalizeOAuthText(organization.name),
            role: normalizeOAuthText(organization.title),
            notes,
            tags: 'source/google-oauth',
            source: 'Google OAuth',
          };
        }),
        nextPageToken: normalizeOAuthText(payload.nextPageToken),
      };
    },
  };
}

function createMicrosoftProvider(config = process.env) {
  const tenant = normalizeOAuthText(config.MICROSOFT_OAUTH_TENANT || 'common') || 'common';
  const base = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;
  return {
    label: 'Microsoft',
    configured: Boolean(normalizeOAuthText(config.MICROSOFT_OAUTH_CLIENT_ID) && normalizeOAuthText(config.MICROSOFT_OAUTH_CLIENT_SECRET)),
    supports: {
      signin: true,
      contacts: true,
      calendar: true,
      mail: true,
    },
    buildAuthorizationUrl({ state, verifier, scopeKey, redirectUri }) {
      const scopes = new Set(['openid', 'profile', 'email', 'offline_access', 'User.Read']);
      if (scopeKey === 'contacts' || scopeKey === 'contacts-calendar') {
        scopes.add('Contacts.Read');
      }
      if (scopeKey === 'calendar' || scopeKey === 'contacts-calendar') {
        scopes.add('Calendars.ReadWrite');
      }
      if (scopeKey === 'mail' || scopeKey === 'outlook') {
        scopes.add('Mail.ReadWrite');
        scopes.add('Mail.Send');
      }
      const params = new URLSearchParams({
        client_id: config.MICROSOFT_OAUTH_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code',
        response_mode: 'query',
        code_challenge: sha256Base64Url(verifier),
        code_challenge_method: 'S256',
        prompt: 'select_account',
        state,
        scope: Array.from(scopes).join(' '),
      });
      return `${base}/authorize?${params.toString()}`;
    },
    async exchangeCode({ code, verifier, redirectUri, fetchImpl }) {
      const response = await fetchImpl(`${base}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.MICROSOFT_OAUTH_CLIENT_ID,
          client_secret: config.MICROSOFT_OAUTH_CLIENT_SECRET,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: verifier,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error_description || payload.error || 'Unable to exchange Microsoft OAuth code.');
      }
      return payload;
    },
    async refreshAccessToken({ refreshToken, fetchImpl }) {
      const response = await fetchImpl(`${base}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.MICROSOFT_OAUTH_CLIENT_ID,
          client_secret: config.MICROSOFT_OAUTH_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error_description || payload.error?.message || payload.error || 'Unable to refresh Microsoft OAuth token.');
      }
      return payload;
    },
    async fetchIdentity(tokens, fetchImpl) {
      const response = await fetchImpl('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Unable to load Microsoft identity.');
      }
      return {
        provider: 'microsoft',
        providerAccountId: normalizeOAuthText(payload.id),
        email: normalizeOAuthEmail(payload.mail || payload.userPrincipalName),
        emailVerified: true,
        displayName: normalizeOAuthText(payload.displayName),
        givenName: '',
        familyName: '',
      };
    },
    async listContacts(accessToken, fetchImpl, { limit = 200 } = {}) {
      const params = new URLSearchParams({
        $top: String(Math.min(Math.max(Number(limit) || 1, 1), 500)),
        $select: 'id,displayName,givenName,surname,emailAddresses,businessPhones,mobilePhone,companyName,jobTitle,categories',
      });
      const response = await fetchImpl(`https://graph.microsoft.com/v1.0/me/contacts?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error?.message || 'Unable to load Microsoft contacts.');
      }
      return {
        contacts: (Array.isArray(payload.value) ? payload.value : []).map(person => ({
          id: normalizeOAuthText(person.id),
          name: normalizeOAuthText(person.displayName || [person.givenName, person.surname].filter(Boolean).join(' ')),
          email: Array.isArray(person.emailAddresses) && person.emailAddresses[0]
            ? normalizeOAuthEmail(person.emailAddresses[0].address)
            : '',
          phone: normalizeOAuthText(person.mobilePhone || (Array.isArray(person.businessPhones) ? person.businessPhones[0] : '')),
          company: normalizeOAuthText(person.companyName),
          role: normalizeOAuthText(person.jobTitle),
          notes: '',
          tags: normalizeOAuthText(Array.isArray(person.categories) ? person.categories.join(', ') : '') || 'source/microsoft-oauth',
          source: 'Microsoft OAuth',
        })),
        nextPageToken: normalizeOAuthText(payload['@odata.nextLink']),
      };
    },
  };
}

function createAppleClientSecret(config = process.env) {
  const teamId = normalizeOAuthText(config.APPLE_OAUTH_TEAM_ID);
  const clientId = normalizeOAuthText(config.APPLE_OAUTH_CLIENT_ID);
  const keyId = normalizeOAuthText(config.APPLE_OAUTH_KEY_ID);
  const privateKey = String(config.APPLE_OAUTH_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!(teamId && clientId && keyId && privateKey)) {
    throw new Error('Apple OAuth is not fully configured.');
  }

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = toBase64Url(JSON.stringify({
    alg: 'ES256',
    kid: keyId,
    typ: 'JWT',
  }));
  const payload = toBase64Url(JSON.stringify({
    iss: teamId,
    iat: issuedAt,
    exp: issuedAt + 300,
    aud: 'https://appleid.apple.com',
    sub: clientId,
  }));
  const message = `${header}.${payload}`;
  const signature = crypto.sign('sha256', Buffer.from(message), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${message}.${toBase64Url(signature)}`;
}

function createAppleProvider(config = process.env) {
  return {
    label: 'Apple',
    configured: Boolean(
      normalizeOAuthText(config.APPLE_OAUTH_CLIENT_ID)
      && normalizeOAuthText(config.APPLE_OAUTH_TEAM_ID)
      && normalizeOAuthText(config.APPLE_OAUTH_KEY_ID)
      && normalizeOAuthText(String(config.APPLE_OAUTH_PRIVATE_KEY || '').replace(/\\n/g, '\n'))
    ),
    supports: {
      signin: true,
      contacts: false,
      calendar: false,
      mail: false,
    },
    buildAuthorizationUrl({ state, nonce, redirectUri }) {
      const params = new URLSearchParams({
        client_id: config.APPLE_OAUTH_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code id_token',
        response_mode: 'form_post',
        scope: 'name email',
        state,
        nonce,
      });
      return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
    },
    async exchangeCode({ code, redirectUri, fetchImpl }) {
      const clientSecret = createAppleClientSecret(config);
      const response = await fetchImpl('https://appleid.apple.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: config.APPLE_OAUTH_CLIENT_ID,
          client_secret: clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error_description || payload.error || 'Unable to exchange Apple authorization code.');
      }
      return payload;
    },
    async fetchIdentity(tokens, _fetchImpl, { callbackBody = {} } = {}) {
      const claims = parseJwtPayload(tokens.id_token || '');
      const postedUser = parseJsonSafely(callbackBody.user || '{}', {}) || {};
      const postedName = postedUser && typeof postedUser.name === 'object'
        ? [postedUser.name.firstName, postedUser.name.lastName].filter(Boolean).join(' ')
        : '';
      return {
        provider: 'apple',
        providerAccountId: normalizeOAuthText(claims.sub),
        email: normalizeOAuthEmail(claims.email || postedUser.email),
        emailVerified: String(claims.email_verified || '').toLowerCase() === 'true' || claims.email_verified === true,
        displayName: normalizeOAuthText(postedName),
        givenName: normalizeOAuthText(postedUser?.name?.firstName),
        familyName: normalizeOAuthText(postedUser?.name?.lastName),
      };
    },
    async listContacts() {
      throw new Error('Apple OAuth does not provide direct contacts import in this portal yet.');
    },
  };
}

function createProviders(config = process.env) {
  return {
    google: createGoogleProvider(config),
    microsoft: createMicrosoftProvider(config),
    apple: createAppleProvider(config),
  };
}

function buildPublicProviderConfig(providerName, provider) {
  return {
    provider: providerName,
    label: provider.label,
    configured: provider.configured,
    supports: { ...provider.supports },
  };
}

function isScopeSupported(provider, scopeKey = 'identity') {
  const normalized = normalizeScopeKey(scopeKey);
  if (normalized === 'identity') return Boolean(provider.supports.signin);
  if (normalized === 'contacts') return Boolean(provider.supports.contacts);
  if (normalized === 'calendar') return Boolean(provider.supports.calendar);
  if (normalized === 'contacts-calendar') return Boolean(provider.supports.contacts && provider.supports.calendar);
  if (normalized === 'mail' || normalized === 'gmail' || normalized === 'outlook') return Boolean(provider.supports.mail);
  return false;
}

function buildConnectionRecord(providerName, tokens = {}, identity = {}, scopeKey = 'identity') {
  const accessToken = normalizeOAuthText(tokens.access_token);
  if (!accessToken) {
    return null;
  }
  const expiresIn = Math.max(0, Number(tokens.expires_in) || 0);
  return {
    provider: providerName,
    accessToken,
    refreshToken: normalizeOAuthText(tokens.refresh_token),
    idToken: normalizeOAuthText(tokens.id_token),
    scope: normalizeOAuthText(tokens.scope),
    scopeKey: normalizeScopeKey(scopeKey),
    expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : 0,
    linkedAt: Date.now(),
    email: normalizeOAuthEmail(identity.email),
    displayName: normalizeOAuthText(identity.displayName),
    source: 'oauth',
  };
}

async function handleConfig(req, res, providerName, provider) {
  return res.status(200).json(buildPublicProviderConfig(providerName, provider));
}

async function handleStart(req, res, providerName, provider) {
  const returnPath = sanitizeReturnPath(Array.isArray(req?.query?.returnTo) ? req.query.returnTo[0] : req?.query?.returnTo);
  const intent = normalizeIntent(Array.isArray(req?.query?.intent) ? req.query.intent[0] : req?.query?.intent);
  const scopeKey = normalizeScopeKey(Array.isArray(req?.query?.scopeKey) ? req.query.scopeKey[0] : req?.query?.scopeKey);
  const aliasHint = normalizeAliasHint(Array.isArray(req?.query?.aliasHint) ? req.query.aliasHint[0] : req?.query?.aliasHint);
  const origin = getRequestOrigin(req);
  const redirectUri = `${origin}/api/oauth/${encodeURIComponent(providerName)}`;

  if (!provider.configured) {
    const html = buildCallbackResultPage({
      ok: false,
      provider: providerName,
      intent,
      scopeKey,
      error: `${provider.label} OAuth is not configured on this deployment yet.`,
    }, returnPath);
    return sendHtml(res, 200, html);
  }

  if (!isScopeSupported(provider, scopeKey)) {
    const html = buildCallbackResultPage({
      ok: false,
      provider: providerName,
      intent,
      scopeKey,
      error: `${provider.label} OAuth is currently limited to account verification in this portal.`,
    }, returnPath);
    return sendHtml(res, 200, html);
  }

  const state = randomBase64Url(24);
  const verifier = randomBase64Url(48);
  const nonce = randomBase64Url(24);
  const flow = {
    provider: providerName,
    state,
    verifier,
    nonce,
    intent,
    scopeKey,
    aliasHint,
    returnPath,
    createdAt: Date.now(),
  };
  setCookie(res, PORTAL_OAUTH_FLOW_COOKIE, buildFlowCookieValue(flow), {
    path: '/',
    maxAge: FLOW_MAX_AGE_SECONDS,
    httpOnly: true,
    sameSite: 'Lax',
    secure: true,
  });

  const url = provider.buildAuthorizationUrl({
    state,
    verifier,
    nonce,
    scopeKey,
    redirectUri,
  });
  res.statusCode = 302;
  res.setHeader('Location', url);
  return res.end();
}

async function handleCallback(req, res, providerName, provider, body, fetchImpl) {
  const flow = parseFlowCookie(req);
  clearCookie(res, PORTAL_OAUTH_FLOW_COOKIE);

  const query = req?.query && typeof req.query === 'object' ? req.query : {};
  const state = normalizeOAuthText(body.state || query.state);
  const code = normalizeOAuthText(body.code || query.code);
  const error = normalizeOAuthText(body.error || query.error);
  const returnPath = sanitizeReturnPath(flow?.returnPath);
  const intent = normalizeIntent(flow?.intent);
  const scopeKey = normalizeScopeKey(flow?.scopeKey);

  if (!flow || flow.provider !== providerName) {
    const html = buildCallbackResultPage({
      ok: false,
      provider: providerName,
      intent,
      scopeKey,
      error: 'OAuth session expired. Start the connection again.',
    }, returnPath);
    return sendHtml(res, 200, html);
  }

  if (!state || state !== flow.state) {
    const html = buildCallbackResultPage({
      ok: false,
      provider: providerName,
      intent,
      scopeKey,
      error: 'OAuth state did not match the session in this browser.',
    }, returnPath);
    return sendHtml(res, 200, html);
  }

  if (error) {
    const html = buildCallbackResultPage({
      ok: false,
      provider: providerName,
      intent,
      scopeKey,
      error: `${provider.label} returned: ${error}`,
    }, returnPath);
    return sendHtml(res, 200, html);
  }

  if (!code) {
    const html = buildCallbackResultPage({
      ok: false,
      provider: providerName,
      intent,
      scopeKey,
      error: `Missing ${provider.label} authorization code.`,
    }, returnPath);
    return sendHtml(res, 200, html);
  }

  try {
    const redirectUri = `${getRequestOrigin(req)}/api/oauth/${encodeURIComponent(providerName)}`;
    const tokens = await provider.exchangeCode({
      code,
      verifier: flow.verifier,
      redirectUri,
      fetchImpl,
    });
    const identity = await provider.fetchIdentity(tokens, fetchImpl, {
      callbackBody: body,
    });
    const connection = buildConnectionRecord(providerName, tokens, identity, scopeKey);
    const alias = normalizeOAuthEmail(identity.email) || flow.aliasHint || buildOAuthFallbackAlias(providerName, identity.providerAccountId);

    const html = buildCallbackResultPage({
      ok: true,
      provider: providerName,
      intent,
      scopeKey,
      aliasHint: flow.aliasHint,
      identity: {
        ...identity,
        alias,
      },
      connection,
    }, returnPath);
    return sendHtml(res, 200, html);
  } catch (err) {
    const html = buildCallbackResultPage({
      ok: false,
      provider: providerName,
      intent,
      scopeKey,
      error: err?.message || `Unable to finish ${provider.label} OAuth.`,
    }, returnPath);
    return sendHtml(res, 200, html);
  }
}

async function handleRefreshToken(res, providerName, provider, body, fetchImpl) {
  if (!provider.configured) {
    return jsonError(res, 503, `${provider.label} OAuth is not configured on this deployment yet.`);
  }
  if (typeof provider.refreshAccessToken !== 'function') {
    return jsonError(res, 400, `${provider.label} OAuth cannot refresh tokens in this portal yet.`);
  }

  const refreshToken = normalizeOAuthText(body.refreshToken || body.refresh_token);
  const scopeKey = normalizeScopeKey(body.scopeKey || body.scope_key || 'identity');
  if (!refreshToken) {
    return jsonError(res, 400, 'Refresh token is required.');
  }
  if (!isScopeSupported(provider, scopeKey)) {
    return jsonError(res, 400, `${provider.label} OAuth does not support ${scopeKey} scope in this portal yet.`);
  }

  try {
    const tokens = await provider.refreshAccessToken({ refreshToken, fetchImpl });
    const accessToken = normalizeOAuthText(tokens.access_token);
    if (!accessToken) {
      return jsonError(res, 502, `${provider.label} did not return an access token.`);
    }
    const expiresIn = Math.max(0, Number(tokens.expires_in) || 0);
    return res.status(200).json({
      ok: true,
      provider: providerName,
      accessToken,
      refreshToken: normalizeOAuthText(tokens.refresh_token) || refreshToken,
      scope: normalizeOAuthText(tokens.scope),
      scopeKey,
      expiresAt: expiresIn ? Date.now() + (expiresIn * 1000) : 0,
      refreshedAt: Date.now(),
      source: 'oauth-refresh',
    });
  } catch (err) {
    return jsonError(res, 502, err?.message || `Unable to refresh ${provider.label} OAuth token.`);
  }
}

async function handleListContacts(res, providerName, provider, body, fetchImpl) {
  if (!provider.supports.contacts) {
    return jsonError(res, 400, `${provider.label} does not expose contacts import in this portal yet.`);
  }

  const accessToken = normalizeOAuthText(body.accessToken);
  if (!accessToken) {
    return jsonError(res, 400, 'Access token is required.');
  }

  try {
    const payload = await provider.listContacts(accessToken, fetchImpl, {
      limit: body.limit,
      pageToken: body.pageToken,
    });
    return res.status(200).json(payload);
  } catch (err) {
    return jsonError(res, 500, err?.message || `Unable to load ${provider.label} contacts.`);
  }
}

export function createOAuthProviderHandler({ config = process.env, fetchImpl = fetch } = {}) {
  const providers = createProviders(config);

  return async function handler(req, res) {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    const providerName = normalizeProvider(req);
    const provider = providers[providerName];
    if (!provider) {
      return jsonError(res, 404, 'Unknown OAuth provider.');
    }

    const body = await readBody(req);
    const action = readAction(req, body);
    const isCallbackAttempt = Boolean(
      normalizeOAuthText(body.code || body.error)
      || normalizeOAuthText(req?.query?.code || req?.query?.error)
    );

    if (req.method === 'GET' && action === 'config') {
      return handleConfig(req, res, providerName, provider);
    }

    if (req.method === 'GET' && action === 'start') {
      return handleStart(req, res, providerName, provider);
    }

    if ((req.method === 'GET' || req.method === 'POST') && isCallbackAttempt) {
      return handleCallback(req, res, providerName, provider, body, fetchImpl);
    }

    if (req.method === 'POST' && action === 'refresh') {
      return handleRefreshToken(res, providerName, provider, body, fetchImpl);
    }

    if (req.method === 'POST' && action === 'listcontacts') {
      return handleListContacts(res, providerName, provider, body, fetchImpl);
    }

    return jsonError(res, 405, 'Method Not Allowed.');
  };
}
