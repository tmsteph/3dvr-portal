import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { launchConfiguredPlaywrightBrowser } from '../scripts/playwright/browser-targets.mjs';

test('Ape Frequency live preview fits desktop and mobile with verified links', async () => {
  const assetName = 'ape-frequency-wordmark-alpha.webp';
  const asset = await readFile(new URL(`../ape-frequency/${assetName}`, import.meta.url));
  const browser = await launchConfiguredPlaywrightBrowser();
  const url = new URL('../ape-frequency/index.html', import.meta.url).href;
  try {
    for (const width of [320, 390, 1440]) {
      const reduce = width === 320;
      const page = await browser.newPage({
        viewport: { width, height: width === 1440 ? 900 : 844 },
        reducedMotion: reduce ? 'reduce' : 'no-preference'
      });
      let fixtureReads = 0;
      const fixture = { scores: [{ name: 'TST', score: 7 }] };
      // Block external traffic. The only supported API call is served entirely in-browser.
      await page.route('http*://**/*', route => {
        const request = route.request();
        if (request.url() !== 'https://apefrequency.com/api/boops' || request.method() !== 'GET') {
          return route.abort();
        }
        fixtureReads++;
        return route.fulfill({ json: fixture, headers: { 'access-control-allow-origin': '*' } });
      });
      try {
        await page.goto(url);
        await page.getByRole('button', { name: 'Ape Frequency logo. Press it.', exact: true }).waitFor();
        assert.equal(await page.locator('h1').textContent(), 'Ape Frequency');
        const rendered = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          images: [...document.images].map(image => ({
            loaded: image.complete && image.naturalWidth > 0,
            filename: new URL(image.currentSrc).pathname.split('/').at(-1)
          })),
          motion: getComputedStyle(document.querySelector('.logo-slot'), '::before').animationName
        }));
        assert.ok(rendered.width <= width, 'no horizontal overflow at ' + width);
        assert.deepEqual(rendered.images, [{ loaded: true, filename: assetName }]);
        if (width === 320) {
          const alpha = await page.evaluate(async data => {
            const bytes = Uint8Array.from(atob(data), ch => ch.charCodeAt(0));
            const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 32;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(bitmap, 0, 0, 32, 32);
            bitmap.close();
            const pixels = ctx.getImageData(0, 0, 32, 32).data;
            let transparent = false, visible = false;
            for (let i = 3; i < pixels.length; i += 4) {
              if (pixels[i] === 0) transparent = true;
              if (pixels[i] > 0) visible = true;
            }
            return { transparent, visible };
          }, asset.toString('base64'));
          assert.deepEqual(alpha, { transparent: true, visible: true });
        }
        assert.equal(rendered.motion, reduce ? 'none' : 'breathe');
        assert.equal(await page.getByRole('link', { name: 'YouTube' }).getAttribute('href'), 'https://www.youtube.com/@ApeFrequency');
        assert.equal(await page.getByRole('link', { name: 'TikTok' }).getAttribute('href'), 'https://www.tiktok.com/@ape.frequency');
        assert.equal(await page.getByRole('link', { name: 'Instagram' }).getAttribute('href'), 'https://www.instagram.com/apefrequency/');
        const score = page.locator('#score');
        assert.equal(await score.isVisible(), false, 'score is hidden until the first logo press');
        const dialog = page.getByRole('dialog', { name: 'Leaderboard' });
        assert.equal(await dialog.isVisible(), false);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'logo-slot');
        await page.keyboard.press('Enter');
        await score.waitFor({ state: 'visible' });
        assert.equal(await score.locator('b').textContent(), '1');
        if (reduce) {
          assert.equal(await page.locator('.particle').count(), 0);
        }
        for (const name of ['YouTube', 'TikTok', 'Instagram']) {
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), name);
        }
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'lb-open');
        await page.keyboard.press('Enter');
        await dialog.waitFor({ state: 'visible' });
        await dialog.getByText('TST', { exact: true }).waitFor();
        assert.equal(fixtureReads, 1);
        assert.equal(await dialog.locator('#lb-score').textContent(), '1');
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        await page.getByRole('button', { name: 'Leaderboard', exact: true }).click();
        await dialog.getByRole('button', { name: 'Close leaderboard' }).click();
        await dialog.waitFor({ state: 'hidden' });

        if (width === 1440) {
          const logo = page.locator('#logo-slot');
          const box = await logo.boundingBox();
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          await page.mouse.move(x, y);
          await page.mouse.down();
          try {
            await page.mouse.move(x + 100, y, { steps: 5 });
            await page.waitForFunction(() => {
              const transform = document.querySelector('#logo-slot').style.transform;
              const yRotation = transform.match(/rotateY\(([^)]+)deg\)/);
              return yRotation && Number(yRotation[1]) > 20;
            });
          } finally {
            await page.mouse.up();
          }
          assert.equal(await score.locator('b').textContent(), '2');
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
