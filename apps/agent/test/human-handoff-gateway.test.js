const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hashToken,
  parseCli,
  safeEqual,
  targetMatchesOrigin,
} = require('../thomas-agent/node/human-handoff-gateway');

test('handoff tokens are hashed and compared without plaintext persistence helpers', () => {
  assert.equal(hashToken('alpha'), hashToken('alpha'));
  assert.notEqual(hashToken('alpha'), hashToken('beta'));
  assert.equal(safeEqual('same', 'same'), true);
  assert.equal(safeEqual('same', 'different'), false);
});

test('target matching stays on the requested browser origin', () => {
  assert.equal(targetMatchesOrigin('https://www.upwork.com/ab/jobs/', 'https://www.upwork.com/'), true);
  assert.equal(targetMatchesOrigin('https://support.upwork.com/', 'https://www.upwork.com/'), false);
  assert.equal(targetMatchesOrigin('https://evil.example/?next=https://www.upwork.com/', 'https://www.upwork.com/'), false);
  assert.equal(targetMatchesOrigin('not-a-url', 'https://www.upwork.com/'), false);
});

test('CLI parsing keeps handoff creation explicit', () => {
  assert.deepEqual(
    parseCli(['create', '--lane', 'general', '--origin', 'https://www.upwork.com/', '--service', 'Upwork']),
    {
      command: 'create',
      lane: 'general',
      origin: 'https://www.upwork.com/',
      service: 'Upwork',
    },
  );
});
