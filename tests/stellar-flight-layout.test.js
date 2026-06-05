import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

function cssRule(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]+)\\}`));
  assert.ok(match?.groups?.body, `Expected CSS rule for ${selector}`);
  return match.groups.body;
}

test('stellar drift keeps flight instructions out of the cockpit sightline', async () => {
  const html = await readFile(new URL('../stellar-flight.html', import.meta.url), 'utf8');
  const overlay = cssRule(html, '.overlay');
  const overlayHidden = cssRule(html, '.overlay-hidden');
  const overlayToggle = cssRule(html, '.overlay-toggle');

  assert.match(html, /<title>Stellar Drift - Endless Flight<\/title>/);
  assert.match(html, /id="overlayToggle"/);
  assert.match(html, /aria-label="Show flight controls"[^>]*>Show Controls<\/button>/);
  assert.match(html, /id="primaryInstructions"/);

  assert.match(overlay, /right:\s*var\(--safe-right\)/);
  assert.match(overlay, /bottom:\s*calc\(var\(--safe-bottom\) \+ var\(--control-safe-zone\)\)/);
  assert.match(overlay, /width:\s*min\(420px,\s*calc\(100vw - 2rem\)\)/);
  assert.doesNotMatch(overlay, /left:\s*50%/);
  assert.doesNotMatch(overlay, /top:\s*calc\(6\.5rem/);

  assert.match(overlayHidden, /transform:\s*translate3d\(0,\s*18px,\s*0\)/);
  assert.match(overlayToggle, /right:\s*var\(--safe-right\)/);
  assert.match(overlayToggle, /bottom:\s*calc\(var\(--safe-bottom\) \+ var\(--control-safe-zone\)\)/);

  assert.match(
    html,
    /@media \(max-width: 540px\)[\s\S]+?\.overlay\s*\{[\s\S]+?bottom:\s*calc\(var\(--safe-bottom\) \+ var\(--control-safe-zone\) \+ 1\.25rem\)/
  );
  assert.match(html, /@media \(max-width: 540px\)[\s\S]+?width:\s*min\(320px,\s*calc\(100vw - 1\.3rem\)\)/);
  assert.match(html, /@media \(max-width: 540px\)[\s\S]+?\.hint\s*\{[\s\S]+?display:\s*none/);
});
