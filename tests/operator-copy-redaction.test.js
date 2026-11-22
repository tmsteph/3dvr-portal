import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { COPY_REDACTION_LIMIT, installCopyRedaction, redactCopyText } from '../operator/copy-redaction.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/operator-copy-redaction.json', import.meta.url), 'utf8'));

test('copy redaction matches 60 synthetic examples with no unexpected replacements', () => {
  assert.equal(fixtures.length, 60);
  assert.equal(new Set(fixtures.map(({ id }) => id)).size, 60);
  for (const category of ['clear', 'clean', 'ambiguous']) {
    assert.equal(fixtures.filter(item => item.category === category).length, 20);
  }
  for (const { id, input, expected, annotations } of fixtures) {
    const { text, counts } = redactCopyText(input);
    const expectedCounts = Object.fromEntries([...new Set(annotations.map(({ type }) => type))]
      .map(type => [type, annotations.filter(item => item.type === type).length]));
    assert.equal(text, expected, id);
    assert.deepEqual(counts, expectedCounts, id);
  }
});

test('over-limit text is not silently truncated or returned as a preview', () => {
  assert.throws(() => redactCopyText('x'.repeat(COPY_REDACTION_LIMIT + 1)), RangeError);
});

test('single-quoted emails preserve quotes and internal apostrophes are masked', () => {
  assert.equal(redactCopyText("Send to 'o'connor@example.com'").text, "Send to '[EMAIL]'");
});

function makePreviewHarness() {
  class Part extends EventTarget {
    value = '';
    textContent = '';
    open = false;
    selected = false;
    focused = false;
    disabled = false;
    hidden = true;
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    select() { this.selected = true; }
    focus() { this.focused = true; }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const p = Object.fromEntries(['button', 'dialog', 'field', 'summary', 'copy', 'close']
    .map(name => [name, new Part()]));
  p.source = 'From contact@example.com';
  p.reports = [];
  p.writes = [];
  p.write = async text => { p.writes.push(text); };
  installCopyRedaction({
    ...p,
    getText: () => p.source,
    getClipboard: () => ({ writeText: p.write }),
    report: message => p.reports.push(message),
  });
  return p;
}

test('preview writes nothing on open, copies edited text, and clears on close', async () => {
  const p = makePreviewHarness();
  p.button.click();
  assert.equal(p.dialog.open, true);
  assert.equal(p.field.value, 'From [EMAIL]');
  assert.deepEqual(p.writes, []);
  p.field.value = 'Reviewed by me';
  p.copy.click();
  await Promise.resolve();
  assert.deepEqual(p.writes, ['Reviewed by me']);
  assert.equal(p.summary.textContent, 'Preview copied.');
  p.close.click();
  assert.equal(p.field.value, '');
  assert.equal(p.source, 'From contact@example.com');
  p.button.click();
  assert.equal(p.field.value, 'From [EMAIL]');
});

test('rejected clipboard selects only the preview and late results cannot affect a new dialog', async () => {
  const p = makePreviewHarness();
  let reject;
  p.write = () => new Promise((_, fail) => { reject = fail; });
  p.button.click();
  p.copy.click();
  p.copy.click();
  p.close.click();
  p.source = 'New clean content';
  p.button.click();
  reject(new Error('denied'));
  await Promise.resolve();
  assert.equal(p.field.selected, false);
  assert.equal(p.field.value, 'New clean content');
  p.write = async () => { throw new Error('denied'); };
  p.copy.click();
  await Promise.resolve();
  assert.equal(p.field.selected, true);
  assert.equal(p.field.focused, true);
  assert.match(p.summary.textContent, /copy the selected preview manually/i);
});

test('empty or over-limit input does not open a preview or copy original content', () => {
  const p = makePreviewHarness();
  p.source = '';
  p.button.click();
  assert.equal(p.dialog.open, false);
  assert.match(p.reports.at(-1), /nothing to copy/i);
  p.source = 'x'.repeat(COPY_REDACTION_LIMIT + 1);
  p.button.click();
  assert.equal(p.dialog.open, false);
  assert.match(p.reports.at(-1), /too long/i);
  assert.deepEqual(p.writes, []);
});
