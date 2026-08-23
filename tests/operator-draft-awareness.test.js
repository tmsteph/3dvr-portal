import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOperatorDraftRequest,
  DEFAULT_OPERATOR_DRAFT_MODEL,
  normalizeDraftSignals,
  normalizeOperatorDraftAwareness
} from '../src/operator/draft-awareness.js';
import {
  changedDraftCharacters,
  clampDraftDelay,
  shouldObserveDraft
} from '../operator/live-awareness.js';

test('draft awareness uses a small stateless request with no action contract', () => {
  const request = buildOperatorDraftRequest({
    prompt: 'I think we should maybe change the portal home page',
    history: [{ role: 'assistant', content: 'What do you want to work on next?' }],
    draftSignals: { elapsedMs: 8000, pauseMs: 3200, editCount: 4, deletedChars: 12, pauseCount: 1, characterCount: 52 }
  });

  assert.equal(request.model, DEFAULT_OPERATOR_DRAFT_MODEL);
  assert.equal(request.store, false);
  assert.equal(request.text.format.name, 'portal_operator_draft_awareness');
  assert.match(request.instructions, /Never answer it, never take an action/i);
  assert.match(request.instructions, /weak interface signals/i);
  assert.doesNotMatch(request.instructions, /request_code_change/);
  assert.match(request.input.at(-1).content, /UNSENT_DRAFT_BEGIN/);
  assert.match(request.input.at(-1).content, /"pauseMs":3200/);
});

test('draft signals and requested intervals are bounded', () => {
  assert.deepEqual(normalizeDraftSignals({
    elapsedMs: 9999999,
    pauseMs: -20,
    editCount: 99999,
    deletedChars: 99999,
    pauseCount: 999,
    characterCount: 99999
  }), {
    elapsedMs: 300000,
    pauseMs: 0,
    editCount: 1000,
    deletedChars: 10000,
    pauseCount: 100,
    characterCount: 4000
  });

  assert.deepEqual(normalizeOperatorDraftAwareness({
    summary: '  thinking about portal changes  ',
    ready: true,
    checkAgainMs: 500
  }), {
    summary: 'thinking about portal changes',
    ready: true,
    checkAgainMs: 2000
  });

  assert.equal(clampDraftDelay(500), 1800);
  assert.equal(clampDraftDelay(90000), 12000);
  assert.equal(clampDraftDelay(0), 0);
});

test('client only observes meaningful drafts and edits', () => {
  assert.equal(shouldObserveDraft({ draft: 'too short' }), false);
  assert.equal(shouldObserveDraft({ draft: 'This is long enough to observe.' }), true);
  assert.equal(shouldObserveDraft({
    draft: 'This is long enough to observe.',
    lastObserved: 'This is long enough to observe.'
  }), false);
  assert.equal(shouldObserveDraft({
    draft: 'This is long enough to observe!',
    lastObserved: 'This is long enough to observe.'
  }), true);
  assert.equal(shouldObserveDraft({
    draft: 'This is long enough to observe.',
    lastObserved: 'This is long enough to observe.',
    forceIdle: true
  }), true);
  assert.ok(changedDraftCharacters('hello world', 'hello there') >= 8);
});
