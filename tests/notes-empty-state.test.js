import assert from 'node:assert/strict';
import test from 'node:test';
import { MOBILE_BREAKPOINT, shouldShowInlineCreate } from '../notes/empty-state.js';

test('shows inline create when mobile viewport lacks visible notes', () => {
  const result = shouldShowInlineCreate({
    viewportWidth: MOBILE_BREAKPOINT,
    hasActiveFolder: true,
    hasVisibleNotes: false
  });
  assert.equal(result, true);
});

test('hides inline create when desktop viewport is active', () => {
  const result = shouldShowInlineCreate({
    viewportWidth: MOBILE_BREAKPOINT + 1,
    hasActiveFolder: true,
    hasVisibleNotes: false
  });
  assert.equal(result, false);
});

test('hides inline create when there are visible notes', () => {
  const result = shouldShowInlineCreate({
    viewportWidth: MOBILE_BREAKPOINT,
    hasActiveFolder: true,
    hasVisibleNotes: true
  });
  assert.equal(result, false);
});

test('hides inline create when no folder is available yet', () => {
  const result = shouldShowInlineCreate({
    viewportWidth: MOBILE_BREAKPOINT,
    hasActiveFolder: false,
    hasVisibleNotes: false
  });
  assert.equal(result, false);
});
