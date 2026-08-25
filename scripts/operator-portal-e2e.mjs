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

page.on('console', message => {
  const text = message.text();
  if (!/password/i.test(text)) console.log(`[browser:${message.type()}] ${text}`);
});
page.on('pageerror', error => console.log(`[pageerror] ${error.message}`));
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
