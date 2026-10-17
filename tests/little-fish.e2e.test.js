import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';

const html = await readFile(new URL('../little-fish/index.html', import.meta.url), 'utf8');

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }, { width: 844, height: 390 }]) {
  test(`Little Fish plays at ${viewport.width} by ${viewport.height}`, async () => {
    const browser = await chromium.launch({ args: ['--no-sandbox'] });
    try {
      const context = await browser.newContext({ viewport, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setContent(html);
      await page.waitForFunction(() => typeof clock !== 'undefined' && clock > 0);
      assert.equal(await page.evaluate(() => fishes.length), 5);
      assert.equal(await page.evaluate(() => sound), false);
      await page.touchscreen.tap(10, 180);
      assert.ok(await page.evaluate(() => food.length > 0));
      await page.getByRole('button', { name: 'Bubbles', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: 'Bubbles', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.waitForTimeout(130);
      await page.touchscreen.tap(10, 180);
      assert.equal(await page.evaluate(() => bubbles.length), 5);
      const bubble = await page.evaluate(() => ({ x: bubbles[0].x, y: bubbles[0].y }));
      await page.waitForTimeout(130);
      await page.mouse.click(Math.max(0, bubble.x), bubble.y);
      assert.equal(await page.evaluate(() => bubbles.length), 4);
      await page.getByRole('button', { name: 'Feed fish', exact: true }).click();
      const fish = await page.evaluate(() => ({ x: fishes[0].x, y: fishes[0].y }));
      await page.waitForTimeout(130);
      await page.mouse.click(fish.x, fish.y);
      assert.match(await page.getByRole('status').textContent(), /fish!/);
      await page.locator('canvas').click({ position: { x: 10, y: 180 } });
      await page.keyboard.press('Space');
      assert.ok(await page.evaluate(() => fishes.every(f => Number.isFinite(f.x) && Number.isFinite(f.y))));
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });
}
