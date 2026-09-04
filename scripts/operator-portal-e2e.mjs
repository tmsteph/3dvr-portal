import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const baseUrl = process.env.PORTAL_E2E_URL || 'https://portal.3dvr.tech';
const publicAlias = 'operator-e2e-20260823@3dvr';
const publicPassword = 'PublicE2E-20260823-Disposable-Account!';
const alias = process.env.PORTAL_E2E_ALIAS || publicAlias;
const password = process.env.PORTAL_E2E_PASSWORD || publicPassword;
const modeRaw = await readFile('.github/e2e/operator-e2e-mode.txt', 'utf8').catch(() => 'bootstrap');
const mode = String(process.env.PORTAL_E2E_MODE || modeRaw || '').trim().toLowerCase();
const usingPublicCredentials = alias === publicAlias && password === publicPassword;
const artifactDir = 'e2e-artifacts';
await mkdir(artifactDir, { recursive: true });

function log(label, value = '') {
  console.log(`${label}${value === '' ? '' : `=${value}`}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  userAgent: '3DVR-Operator-E2E/1.0 Playwright'
});
const page = await context.newPage();
const pageErrors = [];
const operatorStatuses = [];
const operatorRequestFailures = [];

page.on('console', message => {
  const text = message.text();
  if (!/password/i.test(text)) console.log(`[browser:${message.type()}] ${text}`);
});
page.on('pageerror', error => {
  pageErrors.push(error.message);
  console.log(`[pageerror] ${error.message}`);
});
page.on('response', response => {
  if (response.url().includes('/api/openai-site?provider=operator')) {
    operatorStatuses.push(response.status());
    log('E2E_OPERATOR_HTTP', response.status());
  }
});
page.on('requestfailed', request => {
  if (request.url().includes('/api/openai-site?provider=operator')) {
    const reason = request.failure()?.errorText || 'unknown';
    operatorRequestFailures.push(reason);
    log('E2E_OPERATOR_REQUEST_FAILED', reason);
  }
});
page.on('dialog', async dialog => {
  console.log(`[dialog:${dialog.type()}] ${dialog.message()}`);
  await dialog.accept();
});

async function saveArtifacts(name) {
  await page.screenshot({ path: `${artifactDir}/${name}.png`, fullPage: true }).catch(() => {});
  const body = await page.locator('body').innerText().catch(() => '');
  await writeFile(`${artifactDir}/${name}.txt`, body, 'utf8').catch(() => {});
}

async function signInOrCreate() {
  const signInUrl = `${baseUrl}/sign-in.html?redirect=${encodeURIComponent('/operator/')}`;
  await page.goto(signInUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.locator('#username').fill(alias);
  await page.locator('#password').fill(password);
  await page.locator('#auth-submit').click();

  await page.waitForURL(url => {
    const path = new URL(url).pathname.replace(/index\.html$/, '');
    return path === '/operator/' || path === '/operator';
  }, { timeout: 90_000 });
  await page.locator('#operator-input').waitFor({ state: 'visible', timeout: 30_000 });
  await page.locator('.operator-attach').waitFor({ state: 'visible', timeout: 30_000 });

  const identity = await page.evaluate(() => ({
    signedIn: localStorage.getItem('signedIn'),
    alias: localStorage.getItem('alias'),
    pub: localStorage.getItem('userPubKey')
  }));

  log('E2E_ACCOUNT_ALIAS', identity.alias || '');
  log('E2E_ACCOUNT_PUB', identity.pub || '');
  log('E2E_SIGNED_IN', identity.signedIn || '');

  if (identity.signedIn !== 'true' || !identity.pub) {
    throw new Error(`Portal sign-in did not establish a SEA identity: ${JSON.stringify(identity)}`);
  }
  return identity;
}

async function assertMobileLayout() {
  const layout = await page.evaluate(() => {
    const form = document.querySelector('#operator-form')?.getBoundingClientRect();
    const input = document.querySelector('#operator-input')?.getBoundingClientRect();
    return {
      viewport: window.innerWidth,
      formLeft: form?.left,
      formRight: form?.right,
      formWidth: form?.width,
      inputWidth: input?.width
    };
  });
  log('E2E_MOBILE_LAYOUT', JSON.stringify(layout));
  if (!layout.formWidth || layout.formLeft < -1 || layout.formRight > layout.viewport + 1 || layout.inputWidth < 280) {
    throw new Error(`Operator composer does not fit the 390px mobile viewport: ${JSON.stringify(layout)}`);
  }
}

async function createScreenshotFixture(token) {
  const fixturePath = `${artifactDir}/operator-input-screenshot.png`;
  const fixture = await context.newPage();
  await fixture.setViewportSize({ width: 900, height: 500 });
  await fixture.setContent(`<!doctype html><html><body style="margin:0;background:#06101c;color:#f4fff9;font-family:Arial,sans-serif;display:grid;place-items:center;height:100vh"><main style="text-align:center;border:8px solid #79edcf;border-radius:28px;padding:55px"><div style="font-size:42px;letter-spacing:4px">3DVR SCREENSHOT TEST</div><strong style="display:block;margin-top:28px;font-size:72px;letter-spacing:5px">${token}</strong></main></body></html>`);
  await fixture.screenshot({ path: fixturePath, fullPage: true });
  await fixture.close();
  return fixturePath;
}

async function runScreenshotAcceptance() {
  await assertMobileLayout();
  const token = `VR-${String(Date.now()).slice(-6)}`;
  const fixturePath = await createScreenshotFixture(token);
  const fileInput = page.locator('#operator-form input[type="file"]');
  await fileInput.setInputFiles(fixturePath);
  await page.locator('.operator-attachment-preview').waitFor({ state: 'visible', timeout: 10_000 });
  await page.locator('.operator-attachment-tray').waitFor({ state: 'visible', timeout: 10_000 });

  const previewSrc = await page.locator('.operator-attachment-preview').getAttribute('src');
  if (!previewSrc?.startsWith('data:image/png;base64,')) {
    throw new Error('Screenshot preview was not converted to an image data URL.');
  }
  log('E2E_SCREENSHOT_ATTACHED', token);

  const assistantsBefore = await page.locator('#operator-log .message.assistant').count();
  const prompt = `Read the large code in the attached screenshot. Reply with the exact code ${token} somewhere in your answer. Do not take any action.`;
  await page.locator('#operator-input').fill(prompt);
  await page.locator('#operator-form button[type="submit"]').click();

  await page.waitForFunction(() => {
    const form = document.querySelector('#operator-form');
    const submit = form?.querySelector('button[type="submit"]');
    const portal = form?.querySelector('.operator-submit__portal');
    const opacity = portal ? Number.parseFloat(getComputedStyle(portal).opacity || '0') : 0;
    return form?.getAttribute('aria-busy') === 'true'
      && submit?.disabled
      && submit?.getAttribute('data-busy') === 'true'
      && opacity > 0;
  }, null, { timeout: 5_000 });
  const busy = await page.evaluate(() => {
    const submit = document.querySelector('#operator-form button[type="submit"]');
    const portal = document.querySelector('#operator-form .operator-submit__portal');
    const style = portal ? getComputedStyle(portal) : null;
    return {
      formBusy: document.querySelector('#operator-form')?.getAttribute('aria-busy'),
      disabled: submit?.disabled,
      dataBusy: submit?.getAttribute('data-busy'),
      portalOpacity: style?.opacity,
      portalAnimation: style?.animationName
    };
  });
  log('E2E_BUSY_STATE', JSON.stringify(busy));
  if (busy.formBusy !== 'true' || !busy.disabled || busy.dataBusy !== 'true' || Number.parseFloat(busy.portalOpacity || '0') <= 0) {
    throw new Error(`Visible busy indicator did not activate: ${JSON.stringify(busy)}`);
  }
  await saveArtifacts('operator-working');

  await page.waitForFunction(before => document.querySelectorAll('#operator-log .message.assistant').length > before, assistantsBefore, { timeout: 180_000 });
  await page.waitForFunction(() => document.querySelector('#operator-form')?.getAttribute('aria-busy') === 'false', null, { timeout: 15_000 });

  const reply = String(await page.locator('#operator-log .message.assistant').last().innerText()).trim();
  log('E2E_SCREENSHOT_REPLY', reply.replace(/\s+/g, ' ').slice(0, 1200));
  await saveArtifacts('operator-screenshot-reply');

  if (/I could not finish that:/i.test(reply)) {
    throw new Error(`Operator returned an application error: ${reply}`);
  }
  if (!reply.includes(token)) {
    throw new Error(`Operator did not read the screenshot token ${token}. Reply: ${reply}`);
  }
  if (!operatorStatuses.includes(200)) {
    throw new Error(`Operator API never returned HTTP 200. Statuses: ${operatorStatuses.join(',') || 'none'}`);
  }
  if (operatorRequestFailures.length) {
    throw new Error(`Operator API request failure: ${operatorRequestFailures.join('; ')}`);
  }
  if (pageErrors.length) {
    throw new Error(`Browser page errors occurred: ${pageErrors.join('; ')}`);
  }
  if (await page.locator('.operator-attachment-tray').isVisible()) {
    throw new Error('Screenshot attachment was not cleared after a successful response.');
  }
  log('E2E_SCREENSHOT_PASS', token);
}

async function runEditAcceptance() {
  const marker = `operator-e2e-${Date.now()}`;
  const prompt = [
    'Edit the portal source code now.',
    `In operator/index.html add the exact HTML comment <!-- ${marker} --> immediately after the opening <body> tag.`,
    'This is an approved portal code edit. Queue the code edit through Forge; do not save it as a suggestion.'
  ].join(' ');

  await page.locator('#operator-input').fill(prompt);
  await page.locator('#operator-form button[type="submit"]').click();

  const editLink = page.locator('#operator-log .message.assistant a[href*="kind=edit"]').last();
  await editLink.waitFor({ state: 'visible', timeout: 120_000 }).catch(async () => {
    await saveArtifacts('operator-no-edit-link');
    const logText = await page.locator('#operator-log').innerText().catch(() => '');
    throw new Error(`Operator did not return a Forge edit link. Log: ${logText.slice(-5000)}`);
  });

  const href = await editLink.getAttribute('href');
  if (!href) throw new Error('Forge edit link was visible but had no href.');
  const recordUrl = new URL(href, baseUrl).href;
  log('E2E_FORGE_RECORD', recordUrl);
  log('E2E_MARKER', marker);

  await page.goto(recordUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  const status = page.locator('[data-record-status]');
  await status.waitFor({ state: 'visible', timeout: 15_000 });

  const terminal = new Set(['completed', 'failed', 'rejected', 'approval_required']);
  const deadline = Date.now() + 240_000;
  let current = '';
  while (Date.now() < deadline) {
    current = String(await status.innerText().catch(() => '')).trim().toLowerCase();
    if (terminal.has(current)) break;
    await page.waitForTimeout(2_000);
  }

  const result = String(await page.locator('[data-record-result]').innerText().catch(() => '')).trim();
  const error = String(await page.locator('[data-record-error]').innerText().catch(() => '')).trim();
  log('E2E_FORGE_STATUS', current);
  log('E2E_FORGE_RESULT', result.replace(/\s+/g, ' ').slice(0, 1500));
  if (error) log('E2E_FORGE_ERROR', error.replace(/\s+/g, ' ').slice(0, 1500));
  await saveArtifacts('forge-record-final');

  if (current !== 'completed') {
    throw new Error(`Forge edit did not complete. status=${current || 'timeout'} error=${error || result || 'none'}`);
  }
}

try {
  log('E2E_MODE', mode || 'bootstrap');
  if (mode.startsWith('edit') && usingPublicCredentials) {
    throw new Error('Edit mode requires private PORTAL_E2E_ALIAS and PORTAL_E2E_PASSWORD credentials.');
  }
  await signInOrCreate();
  await saveArtifacts('signed-in-operator');
  await runScreenshotAcceptance();
  if (mode.startsWith('edit')) {
    await runEditAcceptance();
  }
  log('E2E_PASS', mode || 'bootstrap');
} catch (error) {
  await saveArtifacts('failure');
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
