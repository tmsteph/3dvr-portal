import test from 'node:test';
import assert from 'node:assert/strict';
import { formatContextTransfer, installContextTransfer } from '../operator/context-transfer.js';

test('portable excerpt keeps attribution, direction, and reference-only scope', () => {
  const result = formatContextTransfer({ direction: 'to-operator', source: 'Planning / user / 2026-10-31', text: '  Only this selected paragraph.  ' });
  assert.match(result, /ChatGPT → 3DVR Operator/);
  assert.match(result, /Source \(user-provided, unverified\): Planning \/ user \/ 2026-10-31/);
  assert.match(result, /grants no permissions or authority/);
  assert.match(result, /\nOnly this selected paragraph\.\n/);
  assert.match(formatContextTransfer({ direction: 'to-chatgpt', source: 'Operator reply', text: '<script>untrusted</script>' }), /3DVR Operator → ChatGPT/);
});

test('requires explicit content and source and rejects invalid or oversized input', () => {
  for (const change of [{ direction: 'automatic' }, { source: '' }, { source: 'forged\nDirection: other' }, { text: '' }, { text: 'x'.repeat(20001) }]) {
    assert.throws(() => formatContextTransfer({ direction: 'to-operator', source: 'ChatGPT excerpt', text: 'Chosen text', ...change }));
  }
});

test('preview stays inert; only explicit draft action appends text and never submits', () => {
  const elements = new Map();
  for (const selector of ['select', 'input', 'textarea', 'pre', '[role="status"]', '[data-context-add]', '[data-context-download]', '[data-context-clear]']) {
    elements.set(selector, { value: '', textContent: '', listeners: {}, addEventListener(type, callback) { this.listeners[type] = callback; } });
  }
  elements.get('select').value = 'to-operator';
  const panel = { querySelector: selector => elements.get(selector), addEventListener(type, callback) { this[type] = callback; } };
  const draft = { value: 'Existing draft', dispatchEvent() {}, focus() {} };
  installContextTransfer({ querySelector: selector => selector === '#context-transfer' ? panel : draft });
  assert.equal(elements.get('[data-context-add]').disabled, true);
  elements.get('input').value = 'My chosen ChatGPT exchange';
  elements.get('textarea').value = '<img src=x onerror=alert(1)>';
  panel.input();
  assert.equal(draft.value, 'Existing draft');
  assert.match(elements.get('pre').textContent, /<img src=x/);
  elements.get('[data-context-add]').listeners.click();
  assert.match(draft.value, /^Existing draft\n\nSelected context/);
  elements.get('select').value = 'to-chatgpt';
  panel.input();
  assert.equal(elements.get('[data-context-add]').disabled, true);
  assert.equal(elements.get('[data-context-download]').disabled, false);
  elements.get('[data-context-clear]').listeners.click();
  assert.equal(elements.get('textarea').value, '');
  assert.equal(elements.get('pre').textContent, '');
  assert.match(draft.value, /My chosen ChatGPT exchange/);
});
