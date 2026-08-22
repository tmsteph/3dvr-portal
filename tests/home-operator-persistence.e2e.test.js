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
