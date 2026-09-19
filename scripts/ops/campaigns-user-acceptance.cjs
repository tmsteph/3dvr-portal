'use strict';

const puppeteerPath = process.env.PUPPETEER_CORE_PATH;
if (!puppeteerPath) throw new Error('PUPPETEER_CORE_PATH is required.');
const puppeteer = require(puppeteerPath);

const ORIGIN = 'https://portal.3dvr.tech';
const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';
const summary = {
  ok: false,
  portal: {},
  points: {},
  location: {},
  gmail: {},
  ui: {},
  errors: [],
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function setValue(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 10000 });
  await page.$eval(selector, (el, next) => {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, next);
    else el.value = next;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, String(value ?? ''));
}

function isNavigationRace(error) {
  return /execution context was destroyed|cannot find context|most likely because of a navigation/i
    .test(String(error?.message || error || ''));
}

async function settleAfterNavigationAction(page, action, timeout = 7000) {
  const navigation = page.waitForNavigation({
    waitUntil: 'domcontentloaded',
    timeout,
  }).catch(() => null);

  try {
    const result = await action();
    await Promise.race([navigation, sleep(1200)]);
    return result;
  } catch (error) {
    if (!isNavigationRace(error)) throw error;
    await Promise.race([navigation, sleep(1200)]);
    return true;
  }
}

async function safeEvaluate(page, fn, arg) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await page.evaluate(fn, arg);
    } catch (error) {
      if (!isNavigationRace(error)) throw error;
      await sleep(400);
    }
  }
  throw new Error('Google OAuth page kept navigating before it could be inspected.');
}

async function clickText(page, labels) {
  return settleAfterNavigationAction(page, () => page.evaluate(values => {
    const wanted = values.map(value => String(value).toLowerCase());
    const nodes = [...document.querySelectorAll('button,[role="button"],input[type="submit"]')];
    const hit = nodes.find(node => {
      const text = String(node.innerText || node.value || node.getAttribute('aria-label') || '')
        .trim().toLowerCase();
      return wanted.some(value => text === value || text.includes(value));
    });
    if (!hit || hit.disabled) return false;
    hit.click();
    return true;
  }, labels));
}

async function ensurePortalSession(page) {
  await page.goto(`${ORIGIN}/campaigns/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('#leadVaultSyncStatus', { timeout: 10000 });
  const state = await page.evaluate(() => ({
    signedIn: localStorage.getItem('signedIn') === 'true',
    username: localStorage.getItem('username') || '',
    password: localStorage.getItem('password') || '',
    hasPubKey: Boolean(localStorage.getItem('userPubKey')),
  }));

  if (state.signedIn) {
    summary.portal.signedIn = true;
    summary.portal.usernamePresent = Boolean(state.username);
    summary.portal.hasPubKey = state.hasPubKey;
    return;
  }

  if (!state.username || !state.password) {
    summary.portal.signedIn = false;
    summary.portal.usernamePresent = Boolean(state.username);
    summary.portal.hasPubKey = state.hasPubKey;
    summary.portal.signInIssue = 'Persistent browser is signed out of the Portal and has no saved Portal credentials.';
    return false;
  }

  await page.goto(`${ORIGIN}/sign-in.html?next=/campaigns/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await setValue(page, '#username', state.username);
  await setValue(page, '#password', state.password);
  await page.click('#auth-submit');
  await page.waitForFunction(() => location.pathname === '/campaigns/', { timeout: 45000 });
  await page.waitForSelector('#leadVaultSyncStatus', { timeout: 10000 });
  await sleep(2500);

  summary.portal.signedIn = await page.evaluate(() => localStorage.getItem('signedIn') === 'true');
  summary.portal.usernamePresent = true;
  summary.portal.hasPubKey = await page.evaluate(() => Boolean(localStorage.getItem('userPubKey')));
  return summary.portal.signedIn;
}

async function driveGoogleOAuth(page, targetEmail = '') {
  const start = `${ORIGIN}/api/oauth/google?action=start&scopeKey=gmail-send&intent=campaigns&returnTo=/campaigns/`;
  await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 30000 });

  for (let step = 0; step < 12; step += 1) {
    await sleep(1000);
    const url = page.url();
    const parsed = new URL(url);

    if (parsed.hostname === 'portal.3dvr.tech' && parsed.pathname === '/campaigns/') {
      return 'returned';
    }
    if (parsed.hostname !== 'accounts.google.com') return 'unexpected-host';

    const state = await safeEvaluate(page, () => ({
      text: (document.body?.innerText || '').slice(0, 9000),
      passwords: document.querySelectorAll('input[type="password"]').length,
      emails: document.querySelectorAll('input[type="email"]').length,
      identifiers: [...document.querySelectorAll('[data-identifier]')]
        .map(el => String(el.getAttribute('data-identifier') || '').trim())
        .filter(Boolean),
    }));

    if (/(captcha|verify your identity|2-step verification|security key|authenticator|enter a code|confirm it.?s you|google hasn.?t verified)/i.test(state.text)) {
      return 'human-required';
    }

    if (state.identifiers.length) {
      const chosen = await settleAfterNavigationAction(page, () => safeEvaluate(page, target => {
        const normalized = String(target || '').trim().toLowerCase();
        const rows = [...document.querySelectorAll('[data-identifier]')].filter(el => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
        const exact = normalized
          ? rows.find(el => String(el.getAttribute('data-identifier') || '').trim().toLowerCase() === normalized)
          : null;
        const pick = exact || (rows.length === 1 ? rows[0] : null);
        if (!pick) return false;
        pick.click();
        return true;
      }, targetEmail));
      if (chosen) continue;
      return 'account-choice-required';
    }

    if (state.passwords || state.emails) return 'human-required';
    if (await clickText(page, ['continue', 'allow'])) continue;
  }
  return 'timeout';
}

async function readConnection(page) {
  return page.evaluate(() => {
    try {
      const value = JSON.parse(localStorage.getItem('3dvr.campaigns.google.connection') || 'null');
      if (!value) return null;
      return {
        hasAccessToken: Boolean(value.accessToken),
        hasRefreshToken: Boolean(value.refreshToken),
        scopeKey: String(value.scopeKey || ''),
        scope: String(value.scope || ''),
        email: String(value.email || ''),
        needsReconnect: Boolean(value.needsReconnect),
      };
    } catch {
      return null;
    }
  });
}

function gmailReady(connection) {
  return Boolean(connection?.hasAccessToken && connection?.email && !connection?.needsReconnect)
    && (
      connection.scopeKey === 'gmail-send'
      || connection.scopeKey === 'calendar-gmail-send'
      || connection.scope.includes('https://www.googleapis.com/auth/gmail.send')
    );
}

(async () => {
  const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
  const context = browser.defaultBrowserContext();
  const page = await browser.newPage();
  let previousDraft = null;

  try {
    await ensurePortalSession(page);
    summary.portal.syncStatus = await page.$eval('#leadVaultSyncStatus', el => el.textContent?.trim() || '').catch(() => '');

    summary.points.identity = await page.evaluate(() => ({
      alias: localStorage.getItem('alias') || '',
      username: localStorage.getItem('username') || '',
      hasPubKey: Boolean(localStorage.getItem('userPubKey')),
      scoreCache: Object.fromEntries(
        Object.keys(localStorage)
          .filter(key => key.startsWith('3dvr:score:'))
          .map(key => [key, localStorage.getItem(key)])
      )
    }));

    await page.goto(`${ORIGIN}/profile.html#profile`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#score', { timeout: 10000 });
    await sleep(3500);
    summary.points.profileScore = await page.$eval('#score', el => el.textContent?.trim() || '');
    summary.points.profileName = await page.$eval('#username', el => el.textContent?.trim() || '');

    await page.goto(`${ORIGIN}/campaigns/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#leadVaultSyncStatus', { timeout: 10000 });
    previousDraft = await page.evaluate(() => localStorage.getItem('3dvr.campaigns.draft'));

    summary.ui.spamCheckboxPresent = await page.evaluate(() => Boolean(document.querySelector('#sourceAck')));
    summary.ui.literalNewlineVisible = await page.evaluate(() => /\\n/.test(document.body?.innerText || ''));

    await context.overridePermissions(ORIGIN, ['geolocation']);
    await page.setGeolocation({ latitude: 32.7157, longitude: -117.1611, accuracy: 1200 });
    await setValue(page, '#leadDescription', '');
    await setValue(page, '#leadLocation', '');
    await page.select('#leadCount', '5');
    await page.click('#findLeads');
    await page.waitForFunction(() => document.querySelector('#findLeads')?.disabled === false, { timeout: 90000 });

    summary.location.status = await page.$eval('#leadLocationStatus', el => el.textContent?.trim() || '');
    summary.location.leadCount = await page.$$eval('.lead-result', els => els.length);

    const existingAddress = await page.$eval('#postalAddress', el => el.value);
    if (existingAddress) {
      await page.$eval('#postalAddress', el => el.blur());
      await sleep(150);
      summary.ui.formattedAddress = await page.$eval('#postalAddress', el => el.value);
    }

    let connection = await readConnection(page);
    summary.gmail.hadSavedConnection = Boolean(connection);
    const targetEmail = connection?.email || '';

    if (!gmailReady(connection)) {
      summary.gmail.oauth = await driveGoogleOAuth(page, targetEmail);
      if (summary.gmail.oauth === 'returned') {
        await page.waitForSelector('#gmailStatus', { timeout: 10000 });
        await sleep(1800);
        connection = await readConnection(page);
      }
    } else {
      summary.gmail.oauth = 'already-ready';
    }

    summary.gmail.ready = gmailReady(connection);
    summary.gmail.sameAccount = Boolean(connection?.email && (!targetEmail || connection.email.toLowerCase() === targetEmail.toLowerCase()));
    summary.gmail.scopeKey = connection?.scopeKey || '';
    summary.gmail.statusText = await page.$eval('#gmailStatus', el => el.textContent?.trim() || '').catch(() => '');

    if (summary.gmail.ready) {
      const businessName = await page.$eval('#businessName', el => el.value.trim());
      const postalAddress = await page.$eval('#postalAddress', el => el.value.trim());
      if (!businessName || !postalAddress) {
        throw new Error('Campaign sender name or postal address is missing.');
      }

      await setValue(page, '#subject', '[3DVR TEST] Campaigns acceptance');
      await setValue(page, '#message', 'Automated Campaigns acceptance test. No action is needed.');
      const before = await page.$eval('#notice', el => el.textContent?.trim() || '');
      await page.click('#sendTest');
      await page.waitForFunction(
        oldText => {
          const notice = document.querySelector('#notice');
          const text = notice?.textContent?.trim() || '';
          return !notice?.hidden && text && text !== oldText;
        },
        { timeout: 30000 },
        before
      );
      summary.gmail.testResult = await page.$eval('#notice', el => el.textContent?.trim() || '');
    }

    const testSent = /test sent to/i.test(summary.gmail.testResult || '');
    const locationOk = /san diego/i.test(summary.location.status || '');
    const uiOk = !summary.ui.spamCheckboxPresent && !summary.ui.literalNewlineVisible;

    summary.portalSignInOk = Boolean(summary.portal.signedIn);
    summary.campaignsOk = Boolean(
      locationOk
      && summary.location.leadCount > 0
      && summary.gmail.ready
      && testSent
      && uiOk
      && summary.errors.length === 0
    );
    summary.ok = summary.campaignsOk;
  } catch (error) {
    summary.errors.push({ message: error.message || 'acceptance-failed' });
  } finally {
    if (previousDraft === null) {
      await page.evaluate(() => localStorage.removeItem('3dvr.campaigns.draft')).catch(() => {});
    } else {
      await page.evaluate(value => localStorage.setItem('3dvr.campaigns.draft', value), previousDraft).catch(() => {});
    }
    await page.close().catch(() => {});
    await browser.disconnect();
  }

  const safe = JSON.parse(JSON.stringify(summary));
  if (safe.gmail?.testResult) safe.gmail.testResult = safe.gmail.testResult.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/ig, '[email]');
  if (safe.gmail?.statusText) safe.gmail.statusText = safe.gmail.statusText.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/ig, '[email]');
  process.stdout.write(JSON.stringify(safe) + '\n');
})().catch(error => {
  process.stdout.write(JSON.stringify({ ok: false, fatal: error.message || 'acceptance-failed' }) + '\n');
  process.exitCode = 1;
});
