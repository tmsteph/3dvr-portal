import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json'
};

let server;
let baseUrl;

before(async () => {
  server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);
      let filePath = resolve(projectRoot, `.${requestUrl.pathname}`);
      if (requestUrl.pathname === '/' || requestUrl.pathname.endsWith('/')) {
        filePath = resolve(filePath, 'index.html');
      }
      const data = await readFile(filePath);
      const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'content-type': type });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });

  await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise(resolveServer => server.close(resolveServer));
});

test('home Operator conversation appears in Past conversations', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const prompt = 'Remember this homepage conversation for later.';
    const responseText = 'This homepage conversation is saved.';

    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') return route.abort('blockedbyclient');
      return route.continue();
    });
    await page.route('**/api/openai-site?provider=operator', async route => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          reply: responseText,
          suggestions: ['Continue this saved conversation.'],
          action: { type: 'none' }
        })
      });
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await page.getByLabel('Ask Operator anything').fill(prompt);
    await page.getByRole('button', { name: 'Send to Operator' }).click();
    await page.getByText(responseText).waitFor();

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('3dvr.operator.conversations.v2') || 'null'));
    assert.ok(saved, 'home Operator should create the shared conversation store');
    assert.equal(saved.conversations.length, 1);
    assert.equal(saved.conversations[0].messages[0].content, prompt);
    assert.equal(saved.conversations[0].messages[1].content, responseText);
    assert.equal(saved.activeId, saved.conversations[0].id);

    await page.goto(`${baseUrl}/operator/`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Past conversations' }).click();
    const savedConversation = page.getByRole('button', { name: new RegExp(prompt.slice(0, 30)) });
    await savedConversation.waitFor();
    await savedConversation.click();
    await page.locator('#operator-log').getByText(prompt).waitFor();
    await page.locator('#operator-log').getByText(responseText).waitFor();
  } finally {
    await browser.close();
  }
});

test('portal spinner selects a direction on deliberate drag but keeps short drags playful', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== '127.0.0.1') return route.abort('blockedbyclient');
      return route.continue();
    });

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    const spinner = page.locator('[data-spinner-nav-toggle]');
    await spinner.waitFor();
    let box = await spinner.boundingBox();
    assert.ok(box, 'spinner should have a pointer target');

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 62, centerY, { steps: 6 });

    const workTarget = page.locator('.spinner-nav__item--work');
    assert.equal(await workTarget.getAttribute('data-spinner-selected'), 'true');
    assert.equal(await spinner.getAttribute('aria-label'), 'Release to open Work.');

    await page.mouse.up();
    await page.waitForURL(url => new URL(url).pathname === '/growth-desk/');
    assert.equal(new URL(page.url()).pathname, '/growth-desk/');

    await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    box = await page.locator('[data-spinner-nav-toggle]').boundingBox();
    assert.ok(box, 'spinner should still be available after returning home');

    const shortX = box.x + box.width / 2;
    const shortY = box.y + box.height / 2;
    await page.mouse.move(shortX, shortY);
    await page.mouse.down();
    await page.mouse.move(shortX + 24, shortY, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(180);

    assert.equal(new URL(page.url()).pathname, '/');
    assert.equal(await page.locator('.spinner-nav__item--work').getAttribute('data-spinner-selected'), null);
  } finally {
    await browser.close();
  }
});
