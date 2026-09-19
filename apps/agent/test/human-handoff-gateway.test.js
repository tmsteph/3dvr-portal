const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hashToken,
  normalizeGuideSteps,
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

test('guide steps are small, ordered, and sanitized', () => {
  const steps = normalizeGuideSteps([
    ' Read the agreement ',
    { id: 'approve', label: 'Confirm if you agree', targetText: ' I acknowledge ' },
    {},
  ]);
  assert.deepEqual(steps, [
    { id: 'step-1', instruction: 'Read the agreement', targetText: '' },
    { id: 'approve', instruction: 'Confirm if you agree', targetText: 'I acknowledge' },
  ]);
  assert.equal(normalizeGuideSteps('not-an-array').length, 0);
});

test('persisted handoffs exclude runtime credentials and frame data', () => {
  const saved = persistableHandoff({
    id: 'handoff-1',
    lane: 'general',
    origin: 'https://example.com',
    serviceName: 'Example',
    reason: 'Human step',
    guideSteps: [{ instruction: 'Confirm', targetText: 'I acknowledge' }],
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
  assert.deepEqual(saved.guideSteps, [
    { id: 'step-1', instruction: 'Confirm', targetText: 'I acknowledge' },
  ]);
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

test('identity lane is available for independent OAuth handoffs', () => {
  const source = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../thomas-agent/node/human-handoff-gateway.js'),
    'utf8',
  );
  assert.match(source, /identity:\s*9666/);
});
