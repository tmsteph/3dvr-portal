import test from 'node:test';
import assert from 'node:assert/strict';

import { installForgeLinkLabels, labelForgeLink } from '../operator/forge-link-label.js';

function anchor(href) {
  const attributes = new Map([['href', href]]);
  return {
    nodeType: 1,
    textContent: 'Open workspace →',
    getAttribute(name) {
      return attributes.get(name) || '';
    },
    setAttribute(name, value) {
      attributes.set(name, value);
    },
    matches(selector) {
      return selector.includes('/forge/record.html?') && this.getAttribute('href').includes('/forge/record.html?');
    },
    querySelectorAll() {
      return [];
    }
  };
}

test('Forge suggestion links are labeled as suggestions', () => {
  const link = anchor('/forge/record.html?kind=suggestion&id=suggestion-1');
  labelForgeLink(link);
  assert.equal(link.textContent, 'Open Forge suggestion →');
  assert.equal(link.getAttribute('aria-label'), 'Open Forge suggestion');
});

test('Forge edit links are labeled as edits', () => {
  const link = anchor('/forge/record.html?kind=edit&id=operator-task-1');
  labelForgeLink(link);
  assert.equal(link.textContent, 'Open Forge edit →');
  assert.equal(link.getAttribute('aria-label'), 'Open Forge edit');
});

test('reused homepage action is relabeled when it becomes a Forge edit link', () => {
  const link = anchor('/');
  const documentElement = { dataset: {} };
  const body = { nodeType: 1 };
  const documentObj = {
    documentElement,
    body,
    querySelectorAll() {
      return [];
    }
  };

  let mutationCallback = null;
  const OriginalMutationObserver = globalThis.MutationObserver;
  globalThis.MutationObserver = class {
    constructor(callback) {
      mutationCallback = callback;
    }
    observe() {}
    disconnect() {}
  };

  try {
    installForgeLinkLabels(documentObj);
    link.setAttribute('href', '/forge/record.html?kind=edit&id=queued-edit-1');
    link.textContent = 'Open workspace →';

    mutationCallback?.([{ target: link, addedNodes: [{ nodeType: 3 }] }]);

    assert.equal(link.textContent, 'Open Forge edit →');
    assert.equal(link.getAttribute('aria-label'), 'Open Forge edit');
  } finally {
    if (OriginalMutationObserver === undefined) delete globalThis.MutationObserver;
    else globalThis.MutationObserver = OriginalMutationObserver;
  }
});
