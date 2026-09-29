'use strict';

const puppeteerPath = process.env.PUPPETEER_CORE_PATH;
if (!puppeteerPath) throw new Error('PUPPETEER_CORE_PATH is required.');
const puppeteer = require(puppeteerPath);

const ORIGIN = 'https://portal.3dvr.tech';
const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  const result = {
    ok: false,
    configured: false,
    oauthStartRedirectsToGoogle: false,
    googleSessionPresent: false,
    googleSessionState: 'unknown',
  };

  const configResponse = await fetch(`${ORIGIN}/api/oauth/google?action=config`);
  const config = await configResponse.json();
  result.configured = Boolean(configResponse.ok && config?.configured);

  const startResponse = await fetch(
    `${ORIGIN}/api/oauth/google?action=start&intent=signin&scopeKey=identity&returnTo=%2Fsign-in.html%3Fredirect%3D%252F`,
    { redirect: 'manual' }
  );
  const location = startResponse.headers.get('location') || '';
  try {
    result.oauthStartRedirectsToGoogle = startResponse.status >= 300
      && startResponse.status < 400
      && new URL(location).hostname === 'accounts.google.com';
  } catch {}

  const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
  const page = await browser.newPage();
  try {
    await page.goto('https://accounts.google.com/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await sleep(1800);
    const state = await page.evaluate(() => ({
      href: location.href,
      title: document.title,
      emailInputs: document.querySelectorAll('input[type="email"]').length,
      passwordInputs: document.querySelectorAll('input[type="password"]').length,
      accountRows: document.querySelectorAll('[data-identifier]').length,
      text: (document.body?.innerText || '').slice(0, 5000),
    }));
    const host = new URL(state.href).hostname;
    const asksForLogin = state.emailInputs > 0
      || state.passwordInputs > 0
      || /sign in\s+with your google account|use your google account|forgot email/i.test(state.text);
    const accountSurface = host === 'myaccount.google.com'
      || /google account|manage your google account/i.test(state.text);
    result.googleSessionPresent = Boolean(!asksForLogin && (accountSurface || state.accountRows > 0));
    result.googleSessionState = result.googleSessionPresent
      ? 'signed_in'
      : asksForLogin
        ? 'login_required'
        : 'uncertain';
  } finally {
    await page.close().catch(() => {});
    await browser.disconnect();
  }

  result.ok = Boolean(
    result.configured
    && result.oauthStartRedirectsToGoogle
    && result.googleSessionPresent
  );
  process.stdout.write(JSON.stringify(result) + '\n');
})().catch(error => {
  process.stdout.write(JSON.stringify({
    ok: false,
    state: 'probe_error',
    error: String(error?.message || error).slice(0, 300),
  }) + '\n');
  process.exitCode = 1;
});
