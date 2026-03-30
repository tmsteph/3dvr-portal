import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { firefox } from 'playwright';

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '4174', 10);
assert(Number.isInteger(port) && port > 0 && port < 65536, 'PLAYWRIGHT_PORT must be a valid TCP port');

const host = '127.0.0.1';
const rootDir = resolve(process.cwd());
const baseUrl = 'http://' + host + ':' + port;
const outDir = resolve(process.cwd(), '.tmp/playwright-ux');
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2']
]);

function resolveSafePath(pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const absolutePath = resolve(rootDir, '.' + normalized);
  if (absolutePath !== rootDir && !absolutePath.startsWith(rootDir + sep)) {
    return null;
  }
  return absolutePath;
}

async function openAndCheck(page, label, path, requiredSelectors) {
  const url = baseUrl + path;
  const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
  assert(response && response.ok(), 'Expected ' + url + ' to load successfully');

  for (const selector of requiredSelectors) {
    await page.waitForSelector(selector, { timeout: 10000 });
  }

  const hasOverflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > window.innerWidth + 1;
  });
  assert.equal(hasOverflow, false, label + ' should not overflow horizontally');

  for (const selector of requiredSelectors) {
    await page.waitForSelector(selector, { timeout: 10000, state: 'attached' });
    const visible = await page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      el.scrollIntoView({ block: 'center' });
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    }, selector);
    assert.equal(visible, true, label + ' expected visible selector ' + selector);
  }

  await page.screenshot({ path: join(outDir, label + '.png'), fullPage: true });
}

let browser;
const server = createServer(async (request, response) => {
  try {
    const rawPath = request.url ? new URL(request.url, baseUrl).pathname : '/';
    const filePath = resolveSafePath(rawPath);
    if (!filePath) {
      response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Forbidden');
      return;
    }

    let targetPath = filePath;
    const fileInfo = await stat(filePath).catch(() => null);
    if (fileInfo && fileInfo.isDirectory()) {
      targetPath = join(filePath, 'index.html');
    }

    const content = await readFile(targetPath);
    const contentType = mimeTypes.get(extname(targetPath).toLowerCase()) || 'application/octet-stream';
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': contentType
    });
    response.end(content);
  } catch {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
  }
});

try {
  await mkdir(outDir, { recursive: true });
  await new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(port, host, () => {
      server.removeListener('error', rejectServer);
      resolveServer();
    });
  });

  browser = await firefox.launch({ headless: true });

  const desktop = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await openAndCheck(desktop, 'desktop-crm', '/crm/index.html', ['#quickLeadName', '#filter', '#personWorkflowFilter']);
  await openAndCheck(desktop, 'desktop-contacts', '/contacts/index.html', ['#search', '#filterCrmLink', '#sortOrder']);

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await openAndCheck(mobile, 'mobile-crm', '/crm/index.html', ['#quickLeadName', '#filter', '#personWorkflowFilter']);
  await openAndCheck(mobile, 'mobile-contacts', '/contacts/index.html', ['#search', '#filterCrmLink', '#sortOrder']);

  console.log('Playwright UX pass completed: mobile + desktop checks passed');
} finally {
  if (browser) {
    await browser.close();
  }

  if (server.listening) {
    await new Promise((resolveClose, rejectClose) => {
      server.close((error) => {
        if (error) {
          rejectClose(error);
          return;
        }
        resolveClose();
      });
    });
  }
}
