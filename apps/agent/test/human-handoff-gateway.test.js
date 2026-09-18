const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hashToken,
  parseCli,
  persistableHandoff,
  safeEqual,
  targetMatchesOrigin,
} = require('../thomas-agent/node/human-handoff-gateway');

test('handoff tokens are hashed and compared without plaintext persistence helpers', () => {
  assert.equal(hashToken('alpha'), hashToken('alpha'));
  assert.notEqual(hashToken('alpha'), hashToken('beta'));
  assert.equal(safeEqual('same', 'same'), true);
  assert.equal(safeEqual('same', 'different'), false);
});

test('persisted handoffs exclude runtime credentials and frame data', () => {
  const saved = persistableHandoff({
    id: 'handoff-1',
    lane: 'general',
    origin: 'https://example.com',
    serviceName: 'Example',
    reason: 'Human step',
    state: 'human_active',
    createdAt: 1,
    expiresAt: 2,
    initialHash: 'initial-hash',
    sessionHash: 'session-hash',
    targetId: 'target-1',
    leaseToken: 'never-persist-this',
    client: { connected: true },
    latestFrame: Buffer.from('private pixels'),
  });
  assert.equal(saved.id, 'handoff-1');
  assert.equal(saved.sessionHash, 'session-hash');
  assert.equal('leaseToken' in saved, false);
  assert.equal('client' in saved, false);
  assert.equal('latestFrame' in saved, false);
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