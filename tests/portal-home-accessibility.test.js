import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('portal home provides a keyboard skip link to its main content', () => {
  assert.match(html, /<a class="skip-link" href="#main-content">Skip to main content<\/a>/);
  assert.match(html, /<main id="main-content">/);
  assert.match(html, /\.skip-link:focus\s*{[^}]*transform: translateY\(0\)/s);
});
