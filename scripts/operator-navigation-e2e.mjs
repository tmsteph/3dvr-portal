import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Load the branch's real markup and navigation modules without accounts or APIs.
const origin = 'http://localhost:43912';
const markup = (await readFile('operator/index.html', 'utf8'))
  .replace(/<div class="operator-boot-loading"[^>]*>[\s\S]*?<\/div>/, '')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace('</body>', '<script type="module" src="/operator/shell.js"></script><script type="module" src="/operator/app-search.js"></script></body>');
const modules = new Map(await Promise.all(['shell.js', 'shell-navigation.js', 'app-search.js'].map(async name => [
  `/operator/${name}`, await readFile(`operator/${name}`, 'utf8')
])));
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    await page.route(`${origin}/**`, route => {
      const path = new URL(route.request().url()).pathname;
      if (modules.has(path)) return route.fulfill({ contentType: 'text/javascript', body: modules.get(path) });
      if (path === '/operator/') return route.fulfill({ contentType: 'text/html', body: markup });
      if (path === '/sitemap.xml') return route.fulfill({ contentType: 'application/xml', body: '<urlset/>' });
      if (path.endsWith('.css') || path.endsWith('.png') || path.endsWith('.webmanifest')) return route.abort();
      return route.fulfill({ contentType: 'text/html', body: '<h1>Standalone app</h1>' });
    });
    await page.goto(`${origin}/operator/`);
    // Confirm modules have loaded, including the search UI.
    await page.locator('#operator-input').fill('helm');
    await page.locator('.app-search-result[data-top-result]').waitFor();
    for (const selector of ['.header-actions a[href="/helm/"]', '.app-search-result[data-top-result]']) {
      await page.locator(selector).click();
      await page.waitForURL(`${origin}/helm/`);
      assert.equal(page.frames().length, 1, 'Helm is the top-level page');
      await page.goBack();
      await page.locator('#operator-input').fill('helm');
      await page.locator('.app-search-result[data-top-result]').waitFor();
    }
    await page.locator('#app-search-close').click();
    await page.locator('.operator-start__tools a[href="/calendar/"]').click();
    await page.waitForURL(`${origin}/calendar/`);
    await page.goBack();
    await page.evaluate(() => {
      const article = document.createElement('article');
      article.className = 'message assistant';
      article.dataset.nodeId = 'result';
      article.innerHTML = '<a class="message-action" href="/life-space/">Open notes</a>';
      document.querySelector('#operator-log').append(article);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {
        kind: '3dvr-operator-shell-v1', nodeId: 'result', workspaceUrl: '/helm/'
      } }));
    });
    await page.locator('.message-focus-nav').waitFor();
    assert.equal(page.url(), `${origin}/operator/`, 'legacy history does not reopen an app');
    assert.equal(await page.locator('iframe').count(), 0);
    await page.locator('.message-action').click();
    await page.waitForURL(`${origin}/life-space/`);
    await page.close();
    console.log(`PASS: direct app navigation and legacy history at ${width}px`);
  }
} finally {
  await browser.close();
}
