import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

const readProjectFile = async (path) =>
  readFile(resolve(projectRoot, path), 'utf8');

describe('static page URL routing', () => {
  it('canonicalizes extensionless HTML navigations to a trailing slash', async () => {
    const config = JSON.parse(await readProjectFile('vercel.json'));
    const redirects = Array.isArray(config.redirects) ? config.redirects : [];
    const expectedSource = '/:path((?!api(?:/|$)|webhooks(?:/|$))(?!.*\\.[^/]+$).*[^/])';

    const rule = redirects.find((redirect) =>
      redirect.source === expectedSource
      && redirect.destination === '/:path/'
      && redirect.permanent === true
    );

    assert.ok(rule);
    assert.deepEqual(rule.has, [
      { type: 'header', key: 'accept', value: '.*text/html.*' }
    ]);

    const routePattern = new RegExp(`^${expectedSource.slice('/:path('.length, -1)}$`);
    assert.equal(routePattern.test('calendar'), true);
    assert.equal(routePattern.test('x'), true);
    assert.equal(routePattern.test('tools/editor'), true);
    assert.equal(routePattern.test('api/calendar'), false);
    assert.equal(routePattern.test('webhooks/stripe'), false);
    assert.equal(routePattern.test('calendar/app.js'), false);
    assert.equal(routePattern.test('calendar/'), false);
  });

  it('keeps directory-local assets relative to the canonical page URL', async () => {
    const calendarHtml = await readProjectFile('calendar/index.html');

    assert.match(calendarHtml, /href="\.\/calendar\.css"/);
    assert.match(calendarHtml, /src="\.\/pwa-install\.js"/);
  });
});
