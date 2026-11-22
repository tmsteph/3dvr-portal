import test from 'node:test';
import assert from 'node:assert/strict';
import { launchConfiguredPlaywrightBrowser } from '../scripts/playwright/browser-targets.mjs';

test('Ape Frequency live preview fits desktop and mobile with verified links', async () => {
  const browser = await launchConfiguredPlaywrightBrowser();
  const url = new URL('../ape-frequency/index.html', import.meta.url).href;
  try {
    for (const width of [320, 390, 1440]) {
      const reduce = width === 320;
      const page = await browser.newPage({
        viewport: { width, height: width === 1440 ? 900 : 844 },
        reducedMotion: reduce ? 'reduce' : 'no-preference'
      });
      await page.route('http*://**/*', route => route.abort());
      try {
        await page.goto(url);
        await page.getByRole('heading', { name: 'Ape Frequency', exact: true }).waitFor();
        const rendered = await page.evaluate(() => ({
          width: document.documentElement.scrollWidth,
          images: [...document.images].map(image => image.complete && image.naturalWidth > 0),
          motion: getComputedStyle(document.querySelector('.logo-slot'), '::before').animationName
        }));
        assert.ok(rendered.width <= width, 'no horizontal overflow at ' + width);
        assert.deepEqual(rendered.images, [true], 'the single wordmark image must load');
        assert.equal(rendered.motion, reduce ? 'none' : 'breathe');
        assert.equal(await page.getByRole('link', { name: 'YouTube' }).getAttribute('href'), 'https://www.youtube.com/@ApeFrequency');
        assert.equal(await page.getByRole('link', { name: 'TikTok' }).getAttribute('href'), 'https://www.tiktok.com/@ape.frequency');
        assert.equal(await page.getByRole('link', { name: 'Instagram' }).getAttribute('href'), 'https://www.instagram.com/apefrequency/');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.id), 'logo-slot',
          'keyboard navigation starts at the interactive logo');
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'YouTube');
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
});
