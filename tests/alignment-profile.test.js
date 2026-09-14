import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyAlignmentProfile,
  buildAlignmentProfileFromPurposeState,
  scoreOpportunityAlignment
} from '../src/kernel/alignmentProfile.js';

test('Purpose creates a compact alignment profile without copying the scattered-life answer', () => {
  const profile = buildAlignmentProfileFromPurposeState({
    answers: [
      'Debt, mold, and unfinished household chores feel scattered.',
      'Open source audio tools and community technology keep calling my attention.',
      'Freelancers and local builders.',
      'Build useful open source tools for audio freelancers.',
      'Publish one small tool this week.'
    ],
    updatedAt: '2026-09-14T20:00:00Z'
  });

  assert.equal(profile.source, 'purpose-map');
  assert.ok(profile.keywords.includes('audio'));
  assert.ok(profile.keywords.includes('freelancers'));
  assert.equal(profile.keywords.includes('debt'), false);
  assert.equal(profile.keywords.includes('mold'), false);
});

test('alignment scoring stays neutral without a profile and rises for matching work', () => {
  const profile = buildAlignmentProfileFromPurposeState({
    answers: ['', 'audio open source community', 'freelancers', 'audio tools for freelancers', 'publish audio tool'],
    updatedAt: '2026-09-14T20:00:00Z'
  });
  const matching = { title: 'Open source audio workflow for freelancers', problem: 'Audio crews lose time switching tools.' };
  const unrelated = { title: 'Pool cleaning dispatch service', problem: 'Route pool cleaners more efficiently.' };

  assert.equal(scoreOpportunityAlignment(matching, {}), 50);
  assert.ok(scoreOpportunityAlignment(matching, profile) > scoreOpportunityAlignment(unrelated, profile));
  assert.equal(applyAlignmentProfile(matching, profile).alignmentProfileSource, 'purpose-map');
});
