'use strict';

const http = require('node:http');
const { matchScope } = require('./secrets-broker');

const SITE_CONFIG = Object.freeze({
  portal: {
    lane: 'general',
    port: 9222,
    startUrl: 'https://portal.3dvr.tech/sign-in.html?redirect=%2Fcampaigns%2F',
    hosts: ['portal.3dvr.tech'],
    vaultTerms: ['portal.3dvr.tech', '3dvr portal'],
    usernameSelectors: ['input[name="username"]', 'input[autocomplete="username"]'],
    passwordSelectors: ['input[name="password"]', 'input[type="password"]'],
    submitText: ['sign in and continue', 'sign in'],
  },
  iatse: {
    lane: 'general',
    port: 9222,
    startUrl: 'https://member.iatse.io',
    hosts: ['member.iatse.io'],
    vaultTerms: ['iatse', 'member.iatse.io'],
    usernameSelectors: ['input[type="email"]', 'input[placeholder*="email" i]', 'input[name*="email" i]'],
    passwordSelectors: ['input[type="password"]'],
    submitText: ['login'],
  },
  ukg: {
    lane: 'encore',
    port: 9333,
    startUrl: 'https://n21.ultipro.com/',
    hosts: ['n21.ultipro.com'],
    vaultTerms: ['ukg', 'ultipro'],
    usernameSelectors: ['#ctl00_Content_Login1_UserName', 'input[name*="UserName" i]', 'input[type="text"]'],
    passwordSelectors: ['#ctl00_Content_Login1_Password', 'input[type="password"]'],
    submitText: ['sign in', 'login'],
  },
  lighthouse: {
    lane: 'general',
    port: 9222,
    startUrl: 'https://lighthouse2.psav.com/login',
    hosts: ['lighthouse2.psav.com'],
    vaultTerms: ['lighthouse', 'psav', 'ukg', 'ultipro'],
    usernameSelectors: ['input[type="email"]', 'input[placeholder*="email" i]'],
    passwordSelectors: ['input[type="password"]'],
    submitText: ['continue', 'sign in', 'login'],
    multiStep: true,
    allowPasswordAfterEmail: false,
  },
});

const HUMAN_CHALLENGE = /(verification code|two[- ]factor|multi[- ]factor|authenticator|one[- ]time code|security code|approve sign[- ]in|verify your identity|captcha)/i;
const LOGIN_ERROR = /(invalid|incorrect|not recognized|unable to sign in|login failed|sign-in failed|try again)/i;

function normalizeText(value = '') {
  return String(value || '').trim();
}

function safeJson(value) {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '')); } catch { return null; }
}

function hostFromUri(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const absolute = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(absolute).hostname.toLowerCase();
  } catch { return ''; }
}

function scoreVaultItem(item = {}, config = {}) {
  if (String(item.type || '').toLowerCase() !== 'login') return 0;
  const hosts = Array.isArray(config.hosts) ? config.hosts : [];
  const uris = Array.isArray(item.uris) ? item.uris : [];
  let score = 0;
  for (const uri of uris) {
    const host = hostFromUri(uri);
    if (hosts.includes(host)) score = Math.max(score, 100);
    else if (hosts.some(expected => host.endsWith(`.${expected}`))) score = Math.max(score, 80);
  }
  const name = String(item.name || '').toLowerCase();
  for (const term of config.vaultTerms || []) {
    if (name.includes(String(term).toLowerCase())) score += 10;
  }
  return score;
}

function chooseVaultItem(index, config) {
  const items = Array.isArray(index?.items) ? index.items : [];
  return items
    .map(item => ({ item, score: scoreVaultItem(item, config) }))
    .filter(candidate => candidate.score > 0 && /^VAULT_ITEM__[A-Z0-9_.:-]+$/i.test(String(candidate.item?.key || '')))
    .sort((a, b) => b.score - a.score)[0]?.item || null;
}

function extractLogin(record) {
  const value = safeJson(record);
  if (!value || typeof value !== 'object') return { username: '', password: '' };
  const login = value.login && typeof value.login === 'object' ? value.login : {};
  return {
    username: normalizeText(login.username || value.username || value.email),
    password: normalizeText(login.password || value.password),
  };
}

function httpJson(port, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method }, res => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { text += chunk; });
      res.on('end', () => {
        if ((res.statusCode || 500) >= 400) return reject(new Error(`cdp-http-${res.statusCode}`));
        try { resolve(JSON.parse(text || '{}')); }
        catch { reject(new Error('cdp-invalid-json')); }
      });
    });
    req.setTimeout(4000, () => req.destroy(new Error('cdp-http-timeout')));
    req.on('error', reject);
    req.end();
  });
}

class CdpSession {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    if (typeof WebSocket !== 'function') throw new Error('websocket-runtime-unavailable');
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      const timer = setTimeout(() => reject(new Error('cdp-connect-timeout')), 5000);
      ws.onopen = () => { clearTimeout(timer); this.ws = ws; resolve(); };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('cdp-connect-failed')); };
      ws.onmessage = event => {
        let message;
        try { message = JSON.parse(String(event.data || '')); } catch { return; }
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message || 'cdp-command-failed'));
        else pending.resolve(message.result || {});
      };
    });
    return this;
  }

  call(method, params = {}) {
    if (!this.ws) return Promise.reject(new Error('cdp-not-connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('cdp-command-timeout'));
      }, 8000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try { this.ws?.close(); } catch {}
    this.ws = null;
  }
}

async function evaluate(session, expression) {
  const response = await session.call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (response.exceptionDetails) throw new Error('browser-evaluation-failed');
  return response.result?.value;
}

async function listPages(port) {
  const pages = await httpJson(port, '/json/list');
  return Array.isArray(pages) ? pages.filter(page => page?.type === 'page') : [];
}

function pageMatches(page, config) {
  try {
    const host = new URL(String(page?.url || '')).hostname.toLowerCase();
    return config.hosts.includes(host);
  } catch { return false; }
}

async function ensurePage(config) {
  let page = (await listPages(config.port)).find(candidate => pageMatches(candidate, config));
  if (page?.webSocketDebuggerUrl) return page;
  const created = await httpJson(config.port, `/json/new?${encodeURIComponent(config.startUrl)}`, 'PUT');
  if (!created?.webSocketDebuggerUrl) throw new Error('browser-target-unavailable');
  await new Promise(resolve => setTimeout(resolve, 900));
  page = (await listPages(config.port)).find(candidate => pageMatches(candidate, config)) || created;
  return page;
}

async function pageState(session) {
  return evaluate(session, `(() => ({
    url: location.href,
    title: document.title,
    text: (document.body?.innerText || '').slice(0, 5000),
    passwordCount: document.querySelectorAll('input[type="password"]').length,
    emailCount: document.querySelectorAll('input[type="email"]').length,
    visibleInputCount: [...document.querySelectorAll('input')].filter(i => i.type !== 'hidden' && !i.disabled).length
  }))()`);
}

async function setInput(session, selectors, value) {
  const expression = `(() => {
    const selectors = ${JSON.stringify(selectors)};
    const input = selectors.map(selector => document.querySelector(selector)).find(Boolean);
    if (!input) return false;
    const value = ${JSON.stringify(String(value || ''))};
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, value); else input.value = value;
    input.focus();
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`;
  return Boolean(await evaluate(session, expression));
}

async function clickSubmit(session, labels) {
  const expression = `(() => {
    const labels = ${JSON.stringify(labels.map(label => label.toLowerCase()))};
    const candidates = [...document.querySelectorAll('button, input[type="submit"], input[type="image"]')];
    const button = candidates.find(node => {
      const text = String(node.innerText || node.value || node.getAttribute('aria-label') || '').trim().toLowerCase();
      return labels.some(label => text === label || text.includes(label));
    });
    if (!button || button.disabled) return false;
    button.click();
    return true;
  })()`;
  return Boolean(await evaluate(session, expression));
}

function pageHost(state) {
  try { return new URL(String(state?.url || '')).hostname.toLowerCase(); }
  catch { return ''; }
}

function classifyState(site, config, state) {
  const text = String(state?.text || '');
  const host = pageHost(state);
  if (!config.hosts.includes(host)) return { status: 'human_required', reason: 'external-sso' };
  if (site === 'portal') {
    if (!/sign-in\.html/i.test(String(state?.url || '')) && !state.passwordCount) return { status: 'authenticated' };
    if (LOGIN_ERROR.test(text)) return { status: 'login_failed', reason: 'provider-rejected-login' };
    return { status: 'login_required' };
  }
  if (HUMAN_CHALLENGE.test(text)) return { status: 'human_required', reason: 'provider-verification' };
  if (LOGIN_ERROR.test(text)) return { status: 'login_failed', reason: 'provider-rejected-login' };
  if (site === 'iatse' && /dashboard/i.test(text) && !state.passwordCount) return { status: 'authenticated' };
  if (site === 'ukg' && /postlogout\.aspx/i.test(String(state?.url || ''))) return { status: 'login_required', reason: 'session-expired' };
  if (site === 'ukg' && !/login\.aspx/i.test(String(state?.url || '')) && !state.passwordCount) return { status: 'authenticated' };
  if (site === 'lighthouse' && !/\/login(?:[/?#]|$)/i.test(String(state?.url || '')) && !state.emailCount && !state.passwordCount) return { status: 'authenticated' };
  return { status: 'login_required' };
}

function authorizeBrowserLogin(agent, site) {
  if (!agent?.capabilities?.includes('browser.login')) return false;
  return (agent.scopes || []).some(scope => matchScope(scope, `site:${site}`));
}

function resolveFromBroker(broker, agent, secret, scope, purpose) {
  const result = broker.request(agent, {
    secret,
    capability: 'secret.read',
    scope,
    purpose,
    requestId: `browser-login-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  });
  if (result.status !== 200 || result.body?.decision !== 'allowed' || typeof result.body?.secret !== 'string') {
    throw new Error(result.body?.decision === 'approval_required' ? 'credential-approval-required' : 'credential-unavailable');
  }
  return result.body.secret;
}

function credentialsFor(broker, agent, site, config) {
  if (config.directSecrets) {
    return {
      username: normalizeText(resolveFromBroker(broker, agent, config.directSecrets[0], `site:${site}`, `Browser login for ${site}`)),
      password: normalizeText(resolveFromBroker(broker, agent, config.directSecrets[1], `site:${site}`, `Browser login for ${site}`)),
    };
  }
  const index = safeJson(resolveFromBroker(broker, agent, 'vault.index', 'secrets:password-manager-mirror', `Locate ${site} login`));
  const item = chooseVaultItem(index, config);
  if (!item?.key) throw new Error('vault-login-not-found');
  const record = resolveFromBroker(broker, agent, `vault.item.${item.key}`, 'secrets:password-manager-mirror', `Browser login for ${site}`);
  const login = extractLogin(record);
  if (!login.username) throw new Error('vault-login-incomplete');
  return login;
}

async function runLogin(broker, agent, site) {
  const config = SITE_CONFIG[site];
  if (!config) return { status: 400, body: { ok: false, status: 'unsupported_site', site } };
  if (!authorizeBrowserLogin(agent, site)) return { status: 403, body: { ok: false, status: 'forbidden', site } };

  const page = await ensurePage(config);
  const session = await new CdpSession(page.webSocketDebuggerUrl).connect();
  try {
    let state = await pageState(session);
    let classification = classifyState(site, config, state);
    if (classification.status === 'authenticated') return { status: 200, body: { ok: true, site, ...classification, url: state.url } };

    if (site === 'ukg' && /postlogout\.aspx/i.test(String(state?.url || ''))) {
      await session.call('Page.navigate', { url: config.startUrl });
      await new Promise(resolve => setTimeout(resolve, 1200));
      state = await pageState(session);
      classification = classifyState(site, config, state);
    }

    const credentials = credentialsFor(broker, agent, site, config);
    const usernameSet = await setInput(session, config.usernameSelectors, credentials.username);
    if (!usernameSet) return { status: 424, body: { ok: false, site, status: 'form_changed', reason: 'username-field-missing' } };

    let passwordSet = false;
    if (!config.multiStep && credentials.password) {
      passwordSet = await setInput(session, config.passwordSelectors, credentials.password);
      if (!passwordSet) return { status: 424, body: { ok: false, site, status: 'form_changed', reason: 'password-field-missing' } };
    }

    if (!await clickSubmit(session, config.submitText)) {
      return { status: 424, body: { ok: false, site, status: 'form_changed', reason: 'submit-control-missing' } };
    }
    await new Promise(resolve => setTimeout(resolve, site === 'portal' ? 3000 : 1600));
    state = await pageState(session);
    classification = classifyState(site, config, state);

    if (config.multiStep && config.allowPasswordAfterEmail !== false && classification.status === 'login_required' && state.passwordCount && credentials.password) {
      passwordSet = await setInput(session, config.passwordSelectors, credentials.password);
      if (passwordSet && await clickSubmit(session, ['continue', 'sign in', 'login', 'submit'])) {
        await new Promise(resolve => setTimeout(resolve, 1600));
        state = await pageState(session);
        classification = classifyState(site, config, state);
      }
    }

    const ok = classification.status === 'authenticated';
    return { status: ok ? 200 : 409, body: { ok, site, ...classification, url: state.url } };
  } finally {
    session.close();
  }
}

async function browserLogin(broker, agent, site) {
  try {
    const result = await runLogin(broker, agent, normalizeText(site).toLowerCase());
    broker.audit?.append?.({ event: 'browser_login', agent: agent?.id || '', site: normalizeText(site).toLowerCase(), status: result.body?.status || 'unknown' });
    return result;
  } catch (error) {
    const message = String(error?.message || '');
    const reason = /^(credential-|vault-|browser-|websocket-|cdp-)/.test(message)
      ? message.slice(0, 160)
      : 'browser-login-error';
    broker.audit?.append?.({ event: 'browser_login', agent: agent?.id || '', site: normalizeText(site).toLowerCase(), status: 'error', reason });
    return { status: 424, body: { ok: false, site: normalizeText(site).toLowerCase(), status: 'error', reason } };
  }
}

module.exports = {
  SITE_CONFIG,
  browserLogin,
  chooseVaultItem,
  extractLogin,
  scoreVaultItem,
};
