import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { chromium } from 'playwright';

const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8']
]);

let server;
let baseUrl;

function resolveSafePath(pathname) {
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const absolutePath = resolve(projectRoot, `.${normalized}`);
  if (absolutePath !== projectRoot && !absolutePath.startsWith(`${projectRoot}${sep}`)) {
    return null;
  }
  return absolutePath;
}

async function launchChromium(t) {
  try {
    return await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-dev-shm-usage',
        '--use-gl=swiftshader'
      ],
      env: {
        ...process.env,
        LIBGL_ALWAYS_SOFTWARE: '1'
      }
    });
  } catch (error) {
    const message = error && typeof error.message === 'string' ? error.message : String(error);
    if (message.includes('dependencies to run browsers') || message.includes('Executable doesn')) {
      t.skip('Playwright Chromium is not installed in this environment.');
      return null;
    }
    throw error;
  }
}

describe('portal home mobile layout', () => {
  before(async () => {
    server = createServer(async (request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', 'http://' + request.headers.host);
        const safePath = resolveSafePath(requestUrl.pathname);
        if (!safePath) {
          response.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
          response.end('Forbidden');
          return;
        }

        let targetPath = safePath;
        const fileInfo = await stat(targetPath).catch(() => null);
        if (fileInfo && fileInfo.isDirectory()) {
          targetPath = join(targetPath, 'index.html');
        }

        const body = await readFile(targetPath);
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-type': mimeTypes.get(extname(targetPath).toLowerCase()) || 'application/octet-stream'
        });
        response.end(body);
      } catch {
        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('Not found');
      }
    });

    await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server?.listening) {
      await new Promise((resolveClose, rejectClose) => {
        server.close(error => {
          if (error) rejectClose(error);
          else resolveClose();
        });
      });
    }
  });

  it('does not overflow horizontally at Android Chrome widths', async t => {
    const browser = await launchChromium(t);
    if (!browser) return;

    try {
      for (const width of [360, 375, 390, 412]) {
        const context = await browser.newContext({
          viewport: { width, height: 844 },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 3,
          userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
        });
        const page = await context.newPage();
        await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('.hero-panel', { timeout: 10000 });
        await page.waitForTimeout(100);

        const result = await page.evaluate(() => {
          const clientWidth = document.documentElement.clientWidth;
          const scrollWidth = document.documentElement.scrollWidth;
          const overflowing = Array.from(document.body.querySelectorAll('*'))
            .map(element => {
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                className: typeof element.className === 'string' ? element.className : '',
                left: Math.floor(rect.left),
                right: Math.ceil(rect.right),
                width: Math.ceil(rect.width)
              };
            })
            .filter(item => item.width > 0 && (item.left < -1 || item.right > clientWidth + 1));

          return { clientWidth, scrollWidth, overflowing };
        });

        assert.equal(
          result.scrollWidth,
          result.clientWidth,
          `Expected no document overflow at ${width}px: ${JSON.stringify(result.overflowing.slice(0, 5))}`
        );
        assert.deepEqual(result.overflowing, [], `Expected no element to exceed viewport at ${width}px`);

        await context.close();
      }
    } finally {
      await browser.close();
    }
  });
});
