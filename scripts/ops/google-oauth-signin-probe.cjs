'use strict';

const puppeteerPath = process.env.PUPPETEER_CORE_PATH;
if (!puppeteerPath) throw new Error('PUPPETEER_CORE_PATH is required.');
const puppeteer = require(puppeteerPath);

const ORIGIN = 'https://portal.3dvr.tech';
const BROWSER_URL = process.env.BROWSER_URL || 'http://127.0.0.1:9222';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function clickText(page, labels) {
  return page.evaluate(values => {
    const wanted = values.map(value => String(value).toLowerCase());
    const nodes = [...document.querySelectorAll('button,[role="button"],input[type="submit"]')];
    const hit = nodes.find(node => {
      const text = String(node.innerText || node.value || node.getAttribute('aria-label') || '')
        .trim().toLowerCase();
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        && wanted.some(value => text === value || text.includes(value));
    });
    if (!hit || hit.disabled) return false;
    hit.click();
    return true;
  }, labels);
}

(async () => {
  const browser = await puppeteer.connect({ browserURL: BROWSER_URL });
  const page = await browser.newPage();
  const result = {
    ok: false,
    configured: false,
    sawGoogle: false,
    returnedToPortal: false,
    signedIn: false,
    authMethod: '',
    authProvider: '',
    state: 'starting',
  };

  try {
    const configResponse = await page.goto(`${ORIGIN}/api/oauth/google?action=config`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    const config = JSON.parse(await configResponse.text());
    result.configured = Boolean(config?.configured);
    if (!result.configured) {
      result.state = 'not_configured';
      process.stdout.write(JSON.stringify(result) + '\n');
      return;
    }

    const start = `${ORIGIN}/api/oauth/google?action=start&intent=signin&scopeKey=identity&returnTo=%2Fsign-in.html%3Fredirect%3D%252F`;
    await page.goto(start, { waitUntil: 'domcontentloaded', timeout: 30000 });

    for (let step = 0; step < 14; step += 1) {
      await sleep(900);
      const url = page.url();
      const parsed = new URL(url);

      if (parsed.hostname === 'accounts.google.com') {
        result.sawGoogle = true;
        const state = await page.evaluate(() => {
          const text = (document.body?.innerText || '').slice(0, 12000);
          const accountRows = [...document.querySelectorAll('[data-identifier]')].filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
          }).length;
          return {
            text,
            accountRows,
            passwords: document.querySelectorAll('input[type="password"]').length,
            emails: document.querySelectorAll('input[type="email"]').length,
          };
        });

        if (/(captcha|verify your identity|2-step verification|security key|authenticator|enter a code|confirm it.?s you)/i.test(state.text)) {
          result.state = 'human_verification_required';
          break;
        }
        if (state.passwords || state.emails) {
          result.state = 'google_login_required';
          break;
        }
        if (state.accountRows > 1) {
          result.state = 'multiple_accounts';
          break;
        }
        if (state.accountRows === 1) {
          await page.evaluate(() => {
            const row = [...document.querySelectorAll('[data-identifier]')].find(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0;
            });
            row?.click();
          });
          continue;
        }
        if (await clickText(page, ['continue', 'allow'])) continue;
        result.state = 'google_page_waiting';
        continue;
      }

      if (parsed.hostname === 'portal.3dvr.tech' && result.sawGoogle) {
        result.returnedToPortal = true;
        await sleep(1600);
        const auth = await page.evaluate(() => ({
          signedIn: localStorage.getItem('signedIn') === 'true',
          authMethod: localStorage.getItem('authMethod') || '',
          authProvider: localStorage.getItem('authProvider') || '',
        }));
        result.signedIn = auth.signedIn;
        result.authMethod = auth.authMethod;
        result.authProvider = auth.authProvider;
        result.ok = Boolean(auth.signedIn && auth.authMethod === 'oauth' && auth.authProvider === 'google');
        result.state = result.ok ? 'passed' : 'returned_without_google_session';
        break;
      }

      result.state = 'unexpected_host';
      break;
    }

    process.stdout.write(JSON.stringify(result) + '\n');
  } finally {
    await page.close().catch(() => {});
    await browser.disconnect();
  }
})().catch(error => {
  process.stdout.write(JSON.stringify({
    ok: false,
    state: 'probe_error',
    error: String(error?.message || error).slice(0, 300),
  }) + '\n');
  process.exitCode = 1;
});
