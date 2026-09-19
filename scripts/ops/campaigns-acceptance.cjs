'use strict';

const crypto = require('node:crypto');
const puppeteerPath = process.env.PUPPETEER_CORE_PATH;
if (!puppeteerPath) throw new Error('PUPPETEER_CORE_PATH is required.');
const puppeteer = require(puppeteerPath);

const ORIGIN = 'https://portal.3dvr.tech';
const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';
const BROWSER_LANE = process.env.BROWSER_LANE || 'general';
const SKIP_GMAIL = process.env.SKIP_GMAIL === '1';
const summary = { browserLane: BROWSER_LANE,
  ok: false,
  portal: {},
  leadFlow: {},
  crossDevice: {},
  gmail: {},
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

async function clickText(page, labels) {
  return page.evaluate(values => {
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
  }, labels);
}

async function newIsolatedContext(browser) {
  if (typeof browser.createBrowserContext === 'function') return browser.createBrowserContext();
  return browser.createIncognitoBrowserContext();
}

async function signInPortal(context, username, password) {
  const page = await context.newPage();
  await page.goto(`${ORIGIN}/sign-in.html?next=/campaigns/`, {
    waitUntil: 'domcontentloaded',
    timeout: 30000,
  });
  await setValue(page, '#username', username);
  await setValue(page, '#password', password);
  await page.click('#auth-submit');
  await page.waitForFunction(() => location.pathname === '/campaigns/', { timeout: 45000 });
  await page.waitForSelector('#leadVaultSyncStatus', { timeout: 10000 });
  await sleep(3200);
  const state = await page.evaluate(() => ({
    signedIn: localStorage.getItem('signedIn') === 'true',
    syncStatus: document.querySelector('#leadVaultSyncStatus')?.textContent?.trim() || '',
  }));
  return { page, state };
}

async function runLeadFlow(browser, username, password) {
  const context = await newIsolatedContext(browser);
  try {
    await context.overridePermissions(ORIGIN, ['geolocation']);
    const { page, state } = await signInPortal(context, username, password);
    summary.portal.accountCreated = Boolean(state.signedIn);
    summary.portal.syncStatus = state.syncStatus;

    await page.setGeolocation({ latitude: 32.7157, longitude: -117.1611, accuracy: 1200 });
    await setValue(page, '#leadDescription', '');
    await setValue(page, '#leadLocation', '');
    await page.select('#leadCount', '5');
    await page.click('#findLeads');
    await page.waitForFunction(
      () => document.querySelector('#findLeads')?.disabled === true,
      { timeout: 5000 }
    ).catch(() => {});
    await page.waitForFunction(
      () => document.querySelector('#findLeads')?.disabled === false,
      { timeout: 90000 }
    );

    summary.leadFlow.locationStatus = await page.$eval(
      '#leadLocationStatus',
      el => el.textContent?.trim() || ''
    );
    summary.leadFlow.notice = await page.$eval(
      '#leadNotice',
      el => el.textContent?.trim() || ''
    );
    summary.leadFlow.leadCount = await page.$$eval('.lead-result', els => els.length);

    await setValue(page, '#postalAddress', '123 main street san diego, ca 92101');
    await page.$eval('#postalAddress', el => el.blur());
    await sleep(120);
    summary.leadFlow.formattedAddress = await page.$eval('#postalAddress', el => el.value);

    if (summary.leadFlow.leadCount > 0) {
      await page.click('#addLeads');
      await sleep(250);
      const saved = await page.evaluate(() => ({
        recipients: (document.querySelector('#recipients')?.value || '')
          .split(/\n/).filter(Boolean).length,
        sourceAcknowledged: Boolean(document.querySelector('#sourceAck')?.checked),
        vaultCount: (() => {
          try { return JSON.parse(localStorage.getItem('3dvr.moneyPrinter.leadVault.v1') || '[]').length; }
          catch { return -1; }
        })(),
        reviewQueueCount: (() => {
          try { return JSON.parse(localStorage.getItem('3dvr.moneyPrinter.messageReviewQueue.v1') || '[]').length; }
          catch { return -1; }
        })(),
      }));
      Object.assign(summary.leadFlow, saved);
    }

    await page.close();
  } finally {
    await context.close();
  }
}

async function verifySecondSignIn(browser, username, password, expectedVaultCount) {
  const context = await newIsolatedContext(browser);
  try {
    const { page, state } = await signInPortal(context, username, password);
    summary.crossDevice.signedBackIn = Boolean(state.signedIn);
    summary.crossDevice.syncStatus = state.syncStatus;
    if (expectedVaultCount > 0) {
      await page.waitForFunction(
        count => {
          try {
            const leads = JSON.parse(localStorage.getItem('3dvr.moneyPrinter.leadVault.v1') || '[]');
            return leads.length >= count;
          } catch { return false; }
        },
        { timeout: 15000 },
        expectedVaultCount
      ).catch(() => {});
    }
    summary.crossDevice.vaultCount = await page.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('3dvr.moneyPrinter.leadVault.v1') || '[]').length; }
      catch { return -1; }
    });
    await page.close();
  } finally {
    await context.close();
  }
}

async function driveGoogleOAuth(page) {
  const start = `${ORIGIN}/api/oauth/google?action=start&scopeKey=gmail-send&intent=campaigns&returnTo=/campaigns/`;
  await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 30000 });

  for (let step = 0; step < 10; step += 1) {
    await sleep(1000);
    const url = page.url();
    const parsed = new URL(url);
    if (parsed.hostname === 'portal.3dvr.tech' && parsed.pathname === '/campaigns/') {
      return 'returned';
    }
    if (parsed.hostname !== 'accounts.google.com') return 'unexpected-host';

    const state = await page.evaluate(() => ({
      text: (document.body?.innerText || '').slice(0, 8000),
      passwords: document.querySelectorAll('input[type="password"]').length,
      emails: document.querySelectorAll('input[type="email"]').length,
    }));
    if (/(captcha|verify your identity|2-step verification|security key|authenticator|enter a code|confirm it.?s you|google hasn.?t verified)/i.test(state.text)) {
      return 'human-required';
    }

    const accountClicked = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-identifier]')].filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      if (!rows.length) return false;
      rows[0].click();
      return true;
    });
    if (accountClicked) continue;

    if (state.passwords || state.emails) return 'human-required';
    if (await clickText(page, ['continue', 'allow'])) continue;
  }
  return 'timeout';
}

async function runGmailFlow(browser) {
  const page = await browser.newPage();
  let previousDraft = null;
  try {
    await page.goto(`${ORIGIN}/campaigns/`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForSelector('#sendTest', { timeout: 10000 });
    previousDraft = await page.evaluate(() => localStorage.getItem('3dvr.campaigns.draft'));

    summary.gmail.oauth = await driveGoogleOAuth(page);
    if (summary.gmail.oauth !== 'returned') return;

    await page.waitForSelector('#gmailStatus', { timeout: 10000 });
    await sleep(1800);
    const connection = await page.evaluate(() => {
      try {
        const value = JSON.parse(localStorage.getItem('3dvr.campaigns.google.connection') || 'null');
        if (!value) return null;
        return {
          hasAccessToken: Boolean(value.accessToken),
          hasRefreshToken: Boolean(value.refreshToken),
          scopeKey: String(value.scopeKey || ''),
          scope: String(value.scope || ''),
          emailPresent: Boolean(value.email),
        };
      } catch { return null; }
    });
    summary.gmail.connection = connection;
    summary.gmail.statusText = await page.$eval('#gmailStatus', el => el.textContent?.trim() || '');
    summary.gmail.detailText = await page.$eval('#gmailDetail', el => el.textContent?.trim() || '');

    const ready = Boolean(connection?.hasAccessToken && connection?.emailPresent)
      && (
        connection.scopeKey === 'gmail-send'
        || connection.scopeKey === 'calendar-gmail-send'
        || connection.scope.includes('https://www.googleapis.com/auth/gmail.send')
      );
    summary.gmail.ready = ready;
    if (!ready) return;

    await setValue(page, '#subject', '[3DVR TEST] Campaigns acceptance');
    await setValue(page, '#message', 'Automated Campaigns acceptance test. No action is needed.');
    await setValue(page, '#businessName', '3DVR Test');
    await setValue(page, '#postalAddress', '123 main street san diego, ca 92101');
    await page.$eval('#postalAddress', el => el.blur());
    await page.$eval('#contactSource', el => {
      el.value = 'Existing customers or contacts';
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.$eval('#sourceAck', el => {
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(150);
    summary.gmail.formattedAddress = await page.$eval('#postalAddress', el => el.value);

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
  } finally {
    if (previousDraft === null) {
      await page.evaluate(() => localStorage.removeItem('3dvr.campaigns.draft')).catch(() => {});
    } else {
      await page.evaluate(value => localStorage.setItem('3dvr.campaigns.draft', value), previousDraft).catch(() => {});
    }
    await page.close().catch(() => {});
  }
}

(async () => {
  const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
  const username = 'e2e-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
  const password = 'T!' + crypto.randomBytes(18).toString('base64url') + '9a';

  try {
    try { await runLeadFlow(browser, username, password); }
    catch (error) { summary.errors.push({ stage: 'portal-lead-flow', message: error.message }); }

    try {
      await verifySecondSignIn(
        browser,
        username,
        password,
        Math.max(0, Number(summary.leadFlow.vaultCount) || 0)
      );
    } catch (error) {
      summary.errors.push({ stage: 'second-sign-in', message: error.message });
    }

    if (SKIP_GMAIL) {
      summary.gmail.skipped = 'general-lane-busy';
    } else {
      try { await runGmailFlow(browser); }
      catch (error) { summary.errors.push({ stage: 'gmail', message: error.message }); }
    }

    const browserLocationOk = /san diego/i.test(summary.leadFlow.locationStatus || '');
    const addressOk = summary.leadFlow.formattedAddress === '123 Main St, San Diego, CA 92101';
    const accountOk = Boolean(summary.portal.accountCreated && summary.crossDevice.signedBackIn);
    const vaultOk = !summary.leadFlow.vaultCount
      || Number(summary.crossDevice.vaultCount) >= Number(summary.leadFlow.vaultCount);
    const gmailOk = /test sent to/i.test(summary.gmail.testResult || '');

    summary.portalOk = Boolean(accountOk && browserLocationOk && addressOk && vaultOk);
    summary.partial = SKIP_GMAIL;
    summary.ok = Boolean(summary.portalOk && (SKIP_GMAIL || gmailOk) && summary.errors.length === 0);
    summary.fullOk = Boolean(summary.ok && !SKIP_GMAIL);
    summary.humanRequired = summary.gmail.oauth === 'human-required';
    process.stdout.write(JSON.stringify(summary) + '\n');
  } finally {
    await browser.disconnect();
  }
})().catch(error => {
  process.stdout.write(JSON.stringify({
    ok: false,
    fatal: error.message || 'acceptance-test-failed',
  }) + '\n');
  process.exitCode = 1;
});
