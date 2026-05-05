import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import {
  launchConfiguredPlaywrightBrowser,
  resolvePlaywrightBrowser,
} from './browser-targets.mjs';

const port = Number.parseInt(process.env.PLAYWRIGHT_PORT ?? '4173', 10);
assert(Number.isInteger(port) && port > 0 && port < 65536, 'PLAYWRIGHT_PORT must be a valid TCP port');

const host = '127.0.0.1';
const rootDir = resolve(process.cwd());
const baseUrl = `http://${host}:${port}`;
const browserTarget = resolvePlaywrightBrowser(process.env.PLAYWRIGHT_BROWSER, 'firefox');
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
  const absolutePath = resolve(rootDir, `.${normalized}`);
  if (absolutePath !== rootDir && !absolutePath.startsWith(`${rootDir}${sep}`)) {
    return null;
  }
  return absolutePath;
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
  await new Promise((resolveServer, rejectServer) => {
    server.once('error', rejectServer);
    server.listen(port, host, () => {
      server.removeListener('error', rejectServer);
      resolveServer();
    });
  });

  browser = await launchConfiguredPlaywrightBrowser(browserTarget);
  const page = await browser.newPage();
  const response = await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  assert(response && response.ok(), `Expected ${baseUrl} to return 2xx/3xx`);

  await page.waitForSelector('#landing-title', { timeout: 10000 });
  const pageTitle = await page.title();
  const heading = (await page.locator('#landing-title').innerText()).trim();

  assert.equal(pageTitle, '3DVR Portal');
  assert.match(heading, /Welcome to the 3DVR Portal|Choose your path into the portal|Get in, get moving\.|One system\. Any device\./i);

  console.log(`Playwright smoke check passed in ${browserTarget.displayName} at ${baseUrl}`);
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

  await delay(100);
}
