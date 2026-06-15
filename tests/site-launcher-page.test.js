import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('site launcher exposes the simple customer publishing flow', async () => {
  const html = await readFile(new URL('../launch-site/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../launch-site/app.js', import.meta.url), 'utf8');
  const portalHome = await readFile(new URL('../index.html', import.meta.url), 'utf8');

  assert.match(html, /Launch a website on 3dvr\.tech/);
  assert.match(html, /id="business-name"/);
  assert.match(html, /id="site-purpose"/);
  assert.match(html, /id="site-slug"/);
  assert.match(html, /id="custom-domain"/);
  assert.match(html, /id="publish-site"/);
  assert.match(html, /id="revision-request"[\s\S]*id="publish-site"/);
  assert.doesNotMatch(html, /class="preview-header"[\s\S]*id="publish-site"[\s\S]*<\/div>\s*<iframe/);
  assert.match(html, /cdn\.jsdelivr\.net\/npm\/gun\/gun\.js/);
  assert.match(html, /src="\/gun-init\.js"/);

  assert.doesNotMatch(html, /GitHub repo/i);
  assert.doesNotMatch(html, /GitHub branch/i);
  assert.doesNotMatch(html, /Vercel token/i);
  assert.doesNotMatch(html, /OpenAI key/i);

  assert.match(app, /fetch\('\/api\/openai-site'/);
  assert.match(app, /fetch\('\/api\/vercel-deploy'/);
  assert.match(app, /subdomain: state\.slug/);
  assert.match(app, /customDomain: state\.customDomain/);
  assert.match(app, /sanitizeCustomDomain\(customDomainInput\.value\)/);
  assert.match(app, /readDefaultSecret\(data, 'openai'\)/);
  assert.match(app, /readDefaultSecret\(data, 'vercel'\)/);
  assert.match(app, /waitForSharedSecret\('openai'/);
  assert.match(app, /waitForSharedSecret\('vercel'/);
  assert.match(app, /hasDefaultRecord\(data\)/);
  assert.match(app, /Generating\.\.\./);
  assert.match(app, /Creating the deployment in the 3dvr workspace/);
  assert.match(app, /formatAliasError\(result\)/);
  assert.match(app, /Published on Vercel\. The custom address still needs domain setup\./);
  assert.match(app, /domain_not_found/);

  assert.match(portalHome, /href="launch-site\/"/);
  assert.match(portalHome, />Launch Site</);
});
