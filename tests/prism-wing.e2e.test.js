import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');
const threeModulePath = resolve(projectRoot, 'node_modules/three/build/three.module.js');
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
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
      res.writeHead(200, { 'content-type': MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('Not found');
    }
  });
  await new Promise(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise(resolveServer => server.close(resolveServer));
});

async function openWing(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.route('https://cdn.jsdelivr.net/npm/three@0.176.0/build/three.module.js', route =>
    route.fulfill({ path: threeModulePath, contentType: 'text/javascript; charset=utf-8' })
  );
  await page.goto(`${baseUrl}/living-world/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.__prismWingDebug?.getState), null, { timeout: 15_000 });
  await page.waitForTimeout(400);
  return page;
}

async function state(page) {
  return page.evaluate(() => window.__prismWingDebug.getState());
}

function distance(a,b) {
  return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
}

test('Prism Wing idle cruise is steady and stays near the rail', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openWing(browser);
    const start = await state(page);
    await page.waitForTimeout(1800);
    const end = await state(page);

    assert.ok(distance(start.position,end.position) > 5, 'idle flight should make visible forward progress');
    assert.ok(end.speed >= 5 && end.speed <= 8.5, `idle cruise should settle near cruise speed, got ${end.speed}`);
    assert.ok(end.trackDistance < 4, `idle flight should remain near the course, got distance ${end.trackDistance}`);
  } finally {
    await browser.close();
  }
});

test('Prism Wing WASD nudges position instead of changing forward throttle', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const rightPage = await openWing(browser);
    const rightStart = await state(rightPage);
    await rightPage.keyboard.down('KeyD');
    await rightPage.waitForTimeout(900);
    await rightPage.keyboard.up('KeyD');
    const rightEnd = await state(rightPage);
    assert.ok(Math.abs(rightEnd.position.x-rightStart.position.x) > .6, 'D should gently move the ship sideways');
    assert.ok(rightEnd.speed < 10, 'normal steering should not become a throttle boost');
    await rightPage.close();

    const upPage = await openWing(browser);
    const upStart = await state(upPage);
    await upPage.keyboard.down('KeyW');
    await upPage.waitForTimeout(900);
    await upPage.keyboard.up('KeyW');
    const upEnd = await state(upPage);
    assert.ok(upEnd.position.y-upStart.position.y > .5, 'W should gently lift the ship');
    assert.ok(upEnd.speed < 10, 'vertical steering should preserve calm cruise speed');
  } finally {
    await browser.close();
  }
});

test('Prism Wing Shift opens full speed and Space brakes', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openWing(browser);
    await page.waitForTimeout(900);
    const cruise = await state(page);

    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(1200);
    const boosted = await state(page);
    await page.keyboard.up('ShiftLeft');

    assert.ok(boosted.speed > cruise.speed * 2, `Shift should clearly exceed cruise: ${cruise.speed} -> ${boosted.speed}`);
    assert.ok(boosted.speed <= 24, `full speed should stay controlled, got ${boosted.speed}`);

    await page.keyboard.down('Space');
    await page.waitForTimeout(700);
    const braked = await state(page);
    await page.keyboard.up('Space');
    assert.ok(braked.speed < boosted.speed * .55, `Space should brake strongly: ${boosted.speed} -> ${braked.speed}`);
  } finally {
    await browser.close();
  }
});

test('Prism Wing looking around does not steer the ship off the rail', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await openWing(browser);
    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(500);
    const afterLook = await state(page);

    assert.ok(Math.abs(afterLook.yaw) > .5, 'playtest should actually turn the camera');
    assert.ok(afterLook.trackDistance < 4.5, `camera aim should not drag flight off-course, got distance ${afterLook.trackDistance}`);
  } finally {
    await browser.close();
  }
});
