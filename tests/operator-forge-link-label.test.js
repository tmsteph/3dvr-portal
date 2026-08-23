import test from 'node:test';
import assert from 'node:assert/strict';

import { labelForgeLink } from '../operator/forge-link-label.js';

function anchor(href) {
  return {
    textContent: 'Open workspace →',
    getAttribute(name) {
      return name === 'href' ? href : '';
    }
  };
}

test('Forge suggestion links are labeled as suggestions', () => {
  const link = anchor('/forge/record.html?kind=suggestion&id=suggestion-1');
  labelForgeLink(link);
  assert.equal(link.textContent, 'Open Forge suggestion →');
});

test('Forge edit links are labeled as edits', () => {
  const link = anchor('/forge/record.html?kind=edit&id=operator-task-1');
  labelForgeLink(link);
  assert.equal(link.textContent, 'Open Forge edit →');
});
