import test from 'node:test';
import assert from 'node:assert/strict';
import { fields, formatCard, proposeSummary, saveReviewed, storageKey } from '../operator/context-card/model.js';

function storage() {
  let value = null;
  return { getItem: key => { assert.equal(key, storageKey); return value; }, setItem: (key, next) => { assert.equal(key, storageKey); value = next; } };
}

test('portable card contains only explicitly supplied fields and date', () => {
  const text = formatCard(['Launch', 'Ship', 'Use Portal', 'One user', 'https://example.com', 'Team note'], '2026-10-31');
  for (const field of fields) assert.ok(text.includes(`## ${field}`));
  assert.ok(text.includes('Last updated: 2026-10-31'));
  assert.ok(!formatCard([], 'today').includes('undefined'));
});

test('returned text is appended verbatim as unverified prose without altering existing context', () => {
  const current = '# Card\nGoal: keep this';
  const summary = '<script>deleteEverything()</script>';
  assert.equal(proposeSummary(current, summary), `${current}\n\n## Returned summary (unverified)\n${summary}`);
  assert.throws(() => proposeSummary(current, '  '), /Paste/);
});

test('save preserves review text and refuses stale-tab overwrites and empty cards', () => {
  const store = storage();
  const first = saveReviewed(store, null, 'Original', new Date('2026-10-31'));
  assert.equal(JSON.parse(first).text, 'Original');
  assert.throws(() => saveReviewed(store, null, 'Stale replacement'), /another tab/);
  assert.equal(store.getItem(storageKey), first);
  assert.throws(() => saveReviewed(store, first, '  '), /empty/);
  const second = saveReviewed(store, first, proposeSummary('Original', 'Returned'));
  assert.ok(JSON.parse(second).text.startsWith('Original'));
});

test('UI requires review for copy/save, preserves storage until save, and discards proposals', async () => {
  const elements = new Map();
  const element = () => ({ value: '', textContent: '', checked: false, hidden: true, append() {}, focus() {}, addEventListener(event, handler) { this[event] = handler; } });
  const oldDocument = globalThis.document;
  const oldStorage = globalThis.localStorage;
  globalThis.document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); }, createElement: element };
  globalThis.localStorage = storage();
  try {
    await import('../operator/context-card/ui.js');
    const get = id => document.getElementById(id);
    get('returned').value = 'New fact';
    get('propose').onclick();
    assert.match(get('proposal').value, /New fact/);
    assert.equal(localStorage.getItem(storageKey), null);
    get('save').onclick();
    assert.equal(localStorage.getItem(storageKey), null);
    assert.match(get('status').textContent, /confirmation/);
    get('checked').checked = true;
    get('proposal').oninput();
    assert.equal(get('checked').checked, false);
    get('checked').checked = true;
    get('save').onclick();
    const persisted = localStorage.getItem(storageKey);
    assert.match(JSON.parse(persisted).text, /New fact/);
    get('propose').onclick();
    get('cancel').onclick();
    assert.equal(localStorage.getItem(storageKey), persisted);
    assert.equal(get('review').hidden, true);
  } finally {
    globalThis.document = oldDocument;
    globalThis.localStorage = oldStorage;
  }
});
