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
  await page.waitForTimeout(300);
  return page;
}

async function state(page) {
  return page.evaluate(() => window.__prismWingDebug.getState());
}

function distance(a,b) {
  return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
}

test('Prism Wing does not auto-fly and W accelerates', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await openWing(browser);
    const start = await state(page);
    await page.waitForTimeout(900);
    const idle = await state(page);

    assert.ok(distance(start.position,idle.position) < .75, 'idle ship should not auto-fly');
    assert.ok(idle.speed < .75, `idle ship should remain nearly stopped, got ${idle.speed}`);
    assert.ok(idle.throttle < .03, `idle throttle should stay at zero, got ${idle.throttle}`);

    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1200);
    // Capture acceleration before releasing W; throttle can decay on keyup.
    const accelerated = await state(page);
    await page.keyboard.up('KeyW');

    assert.ok(accelerated.throttle > .7, `W should raise throttle, got ${accelerated.throttle}`);
    assert.ok(accelerated.speed > 9, `W should create clear forward speed, got ${accelerated.speed}`);
    assert.ok(accelerated.finitePosition && accelerated.finiteVelocity);
  } finally {
    await browser.close();
  }
});

test('Prism Wing S decelerates and brakes', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await openWing(browser);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(1200);
    await page.keyboard.up('KeyW');
    const fast = await state(page);

    await page.keyboard.down('KeyS');
    await page.waitForTimeout(850);
    const braking = await state(page);
    await page.keyboard.up('KeyS');

    assert.ok(braking.throttle < fast.throttle * .35, `S should lower throttle: ${fast.throttle} -> ${braking.throttle}`);
    assert.ok(braking.speed < fast.speed * .55, `S should brake actual speed: ${fast.speed} -> ${braking.speed}`);
    assert.ok(braking.finitePosition && braking.finiteVelocity);
  } finally {
    await browser.close();
  }
});

test('Prism Wing A/D strafe and R/Ctrl control vertical position', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const strafePage = await openWing(browser);
    const strafeStart = await state(strafePage);
    await strafePage.keyboard.down('KeyD');
    await strafePage.waitForTimeout(750);
    await strafePage.keyboard.up('KeyD');
    const strafed = await state(strafePage);
    assert.ok(Math.abs(strafed.position.x-strafeStart.position.x) > .45, 'D should move the ship sideways');
    await strafePage.close();

    const risePage = await openWing(browser);
    const riseStart = await state(risePage);
    await risePage.keyboard.down('KeyR');
    await risePage.waitForTimeout(700);
    await risePage.keyboard.up('KeyR');
    const risen = await state(risePage);
    assert.ok(risen.position.y-riseStart.position.y > .35, 'R should move the ship upward');
    await risePage.close();

    const downPage = await openWing(browser);
    const downStart = await state(downPage);
    await downPage.keyboard.down('Control');
    await downPage.waitForTimeout(700);
    await downPage.keyboard.up('Control');
    const lowered = await state(downPage);
    assert.ok(lowered.position.y < downStart.position.y-.35, 'Ctrl should move the ship downward');
  } finally {
    await browser.close();
  }
});

test('Prism Wing Shift boosts without changing camera-look steering', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await openWing(browser);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(950);
    await page.keyboard.up('KeyW');
    const cruise = await state(page);

    await page.keyboard.down('ShiftLeft');
    await page.waitForTimeout(700);
    const boosted = await state(page);
    await page.keyboard.up('ShiftLeft');
    assert.ok(boosted.speed > cruise.speed + 3, `Shift should boost: ${cruise.speed} -> ${boosted.speed}`);

    await page.keyboard.down('ArrowRight');
    await page.waitForTimeout(900);
    await page.keyboard.up('ArrowRight');
    await page.waitForTimeout(250);
    const afterLook = await state(page);
    assert.ok(Math.abs(afterLook.yaw) > .4, 'playtest should actually turn the camera');
    assert.ok(afterLook.trackDistance < 5, `looking around should not throw flight off-course, got ${afterLook.trackDistance}`);
  } finally {
    await browser.close();
  }
});

test('Prism Wing remains finite and visible after the third boost gate', { timeout: 45_000 }, async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await openWing(browser);

    for (let gate = 1; gate <= 3; gate += 1) {
      const moved = await page.evaluate(() => window.__prismWingDebug.passNextGate());
      assert.equal(moved, true, `gate ${gate} should exist`);
      await page.waitForTimeout(180);
      const current = await state(page);
      assert.equal(current.nextGate, gate, `gate ${gate} should register`);
      assert.ok(current.finitePosition, `camera position must remain finite after gate ${gate}`);
      assert.ok(current.finiteVelocity, `velocity must remain finite after gate ${gate}`);
      assert.ok(current.pathChildren > 10, 'glowing path should still exist');
      assert.ok(current.gateChildren >= current.gateCount, 'gate meshes should still exist');
      assert.ok(current.targetChildren > 0, 'targets should still exist');
    }

    const afterThird = await state(page);
    assert.ok(Number.isFinite(afterThird.speed), 'third gate boost must not corrupt speed');
    assert.ok(afterThird.speed < 40, `third gate boost should stay controlled, got ${afterThird.speed}`);
  } finally {
    await browser.close();
  }
});
