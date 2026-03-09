import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyPreviewHref } from '../web-builder-app/preview-guards.js';

const parentUrl = 'https://portal.example/web-builder-app/index.html';

test('preview guards keep empty and hash links inside the preview', () => {
  assert.deepEqual(classifyPreviewHref('', parentUrl), { action: 'stay' });
  assert.deepEqual(classifyPreviewHref('#pricing', parentUrl), { action: 'hash', hash: '#pricing' });
});

test('preview guards block relative and same-origin links', () => {
  assert.deepEqual(classifyPreviewHref('index.html', parentUrl), { action: 'block' });
  assert.deepEqual(classifyPreviewHref('/chat/', parentUrl), { action: 'block' });
  assert.deepEqual(
    classifyPreviewHref('https://portal.example/web-builder-app/', parentUrl),
    { action: 'block' }
  );
});

test('preview guards allow external and contact links', () => {
  assert.deepEqual(
    classifyPreviewHref('https://example.com/pricing', parentUrl),
    { action: 'external', url: 'https://example.com/pricing' }
  );
  assert.deepEqual(
    classifyPreviewHref('mailto:hello@example.com', parentUrl),
    { action: 'external', url: 'mailto:hello@example.com' }
  );
});
