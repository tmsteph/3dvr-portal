const test = require('node:test');
const assert = require('node:assert/strict');
const { ensureState, withFulfillmentLock, sendReplyWithCheckpoint, topicFromRequest, slugify, resolveRequestEmail, junkReason, requestFingerprint } = require('../thomas-agent/node/free-site-worker');

const FORM_BOILERPLATE = [
  'I want a free live one-page website on a 3DVR-hosted address.',
].join('\n');

function formRequest({ name, email, description }) {
  return {
    from: email,
    subject: `Free 3DVR website request — ${name}`,
    body: [
      FORM_BOILERPLATE,
      `Name/business: ${name}`,
      `Best email for the live link: ${email}`,
      'What the website should explain:',
      description,
      'Please build the smallest useful version and email me the live URL.',
    ].join('\n'),
  };
}

test('standard free-site subject resolves to requested name', () => {
  assert.equal(topicFromRequest('Free 3DVR website request — Test', 'Please build it.'), 'Test');
  assert.equal(slugify(topicFromRequest('Free 3DVR website request — Test', 'Please build it.')), 'test');
});

test('duplicated MIME body does not duplicate the topic slug', () => {
  const topic = topicFromRequest('Make me a website', 'A website about cats A website about cats');
  assert.equal(topic, 'cats');
  assert.equal(slugify(topic), 'cats');
});

test('natural language topic remains supported', () => {
  const topic = topicFromRequest('Website', "I'd like a free website please about potatoes.");
  assert.equal(topic, 'potatoes');
});

test('junk filter catches the 2026-11-10 triple-submitted junk request', () => {
  const request = formRequest({
    name: 'UXFtRUNFKiwQFhlXlaqqItd',
    email: '1.3o.ffi.ci.al..je.et@gmail.com',
    description: '1.3o.ffi.ci.al..je.et@gmail.com',
  });
  assert.equal(junkReason(request), 'random-name-and-empty-description');
});

test('junk filter catches the 2026-11-08 junk request', () => {
  const request = formRequest({
    name: 'hDkrjZOHNWokzwjxJszuC',
    email: 'pe.w.us.ida.sik.3.3.7@gmail.com',
    description: 'pe.w.us.ida.sik.3.3.7@gmail.com',
  });
  assert.equal(junkReason(request), 'random-name-and-empty-description');
});

test('junk filter leaves a genuine business request alone', () => {
  const request = formRequest({
    name: 'Cruisers Garage',
    email: 'jonny@example.com',
    description: 'Motorcycle rentals and sales in Old Town San Diego, open weekends.',
  });
  assert.equal(junkReason(request), '');
});

test('junk filter leaves a long-named business with a real description alone', () => {
  const request = formRequest({
    name: 'AbcdefghijKlmnopqrStuv',
    email: 'owner@example.com',
    description: 'We repair vintage radios and sell restored sets at the swap meet.',
  });
  assert.equal(junkReason(request), '');
});

test('request fingerprint matches identical resubmissions but not corrections', () => {
  const first = formRequest({ name: 'Cruisers Garage', email: 'jonny@example.com', description: 'Rentals and sales.' });
  const again = formRequest({ name: 'Cruisers Garage', email: 'jonny@example.com', description: 'Rentals and sales.' });
  const corrected = formRequest({ name: 'Cruisers Garage', email: 'jonny@example.com', description: 'Rentals, sales, and repairs.' });
  assert.equal(requestFingerprint(first), requestFingerprint(again));
  assert.notEqual(requestFingerprint(first), requestFingerprint(corrected));
});

test('free-site request email trusts Reply-To only for the configured mailbox', () => {
  const mailbox = '3dvr.tech@gmail.com';
  assert.equal(resolveRequestEmail({
    from: [{ address: mailbox }],
    replyTo: [{ address: 'customer@example.com' }],
  }, mailbox), 'customer@example.com');

  assert.equal(resolveRequestEmail({
    from: [{ address: 'outside@example.com' }],
    replyTo: [{ address: 'spoofed@example.com' }],
  }, mailbox), 'outside@example.com');

  assert.equal(resolveRequestEmail({
    from: [{ address: mailbox }],
    replyTo: [],
  }, mailbox), '');
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('fulfillment state initializes once and preserves completed requests', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'free-site-state-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stateFile = path.join(dir, 'state.json');
  const initial = ensureState(stateFile);
  assert.equal(initial.version, 1);
  initial.messages['fake-request'] = { status: 'processed' };
  fs.writeFileSync(stateFile, JSON.stringify(initial));
  assert.deepEqual(ensureState(stateFile), initial);
});

test('corrupt or incomplete fulfillment state fails closed without replacing history', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'free-site-state-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stateFile = path.join(dir, 'state.json');
  for (const content of ['{truncated', '{}', '{"version":1,"bootstrapAt":"2026-11-23T00:00:00Z","messages":[]}']) {
    fs.writeFileSync(stateFile, content);
    assert.throws(() => ensureState(stateFile));
    assert.equal(fs.readFileSync(stateFile, 'utf8'), content);
  }
});

test('SMTP failure after possible acceptance quarantines the request across restart', async () => {
  const state = { messages: { fake: { status: 'publishing', prUrl: 'fake-pr' } } };
  let durable;
  let sends = 0;
  const persist = (value) => { durable = JSON.parse(JSON.stringify(value)); };
  const send = async () => {
    assert.equal(durable.messages.fake.status, 'reply_pending');
    sends += 1;
    throw new Error('connection lost after possible acceptance');
  };
  await assert.rejects(sendReplyWithCheckpoint({ state, key: 'fake', siteUrl: 'https://example.com/', send, persist }), /connection lost/);
  assert.equal(durable.messages.fake.prUrl, 'fake-pr');
  await assert.rejects(sendReplyWithCheckpoint({ state: durable, key: 'fake', siteUrl: 'https://example.com/', send, persist }), /manual reconciliation/);
  assert.equal(sends, 1);
});

test('failure to persist the pre-send checkpoint prevents SMTP invocation', async () => {
  let sends = 0;
  await assert.rejects(sendReplyWithCheckpoint({
    state: { messages: {} }, key: 'fake', siteUrl: 'https://example.com/',
    send: async () => { sends += 1; },
    persist: () => { throw new Error('disk write failed'); },
  }), /disk write failed/);
  assert.equal(sends, 0);
});

test('separate fulfillment invocations cannot enter the same local ledger concurrently', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'free-site-lock-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const active = withFulfillmentLock(file, () => blocked);
  let calls = 0;
  try {
    await assert.rejects(withFulfillmentLock(file, () => { calls += 1; }), /lock held/);
    assert.equal(calls, 0);
  } finally {
    release();
    await active;
  }
  await withFulfillmentLock(file, () => { calls += 1; });
  assert.equal(calls, 1);
});

test('abandoned fulfillment lock fails closed; ordinary errors release the claim', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'free-site-lock-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  fs.mkdirSync(file + '.lock');
  await assert.rejects(withFulfillmentLock(file, () => assert.fail('must not run')), /reconciliation/);
  assert.ok(fs.existsSync(file + '.lock'));
  fs.rmdirSync(file + '.lock');
  await assert.rejects(withFulfillmentLock(file, async () => { throw new Error('fake failure'); }), /fake failure/);
  assert.equal(fs.existsSync(file + '.lock'), false);
});

test('independent process cannot enter a held ledger and a killed owner leaves the claim quarantined', { timeout: 15000 }, async (t) => {
  const { spawn, spawnSync } = require('node:child_process');
  const { once } = require('node:events');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'free-site-process-lock-test-'));
  const file = path.join(dir, 'state.json');
  const worker = require.resolve('../thomas-agent/node/free-site-worker');
  const ownerCode = `
    const { withFulfillmentLock } = require(process.argv[1]);
    withFulfillmentLock(process.argv[2], () => new Promise(() => {
      process.send('held');
      setInterval(() => {}, 1000);
    })).catch(() => process.exit(2));
  `;
  const contenderCode = `
    const { withFulfillmentLock } = require(process.argv[1]);
    withFulfillmentLock(process.argv[2], () => { process.exitCode = 3; })
      .catch(error => { process.exitCode = /lock held/.test(error.message) ? 0 : 4; });
  `;
  const owner = spawn(process.execPath, ['-e', ownerCode, worker, file], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  const exited = once(owner, 'exit');
  t.after(async () => {
    if (owner.exitCode === null && owner.signalCode === null) owner.kill('SIGKILL');
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const ready = await Promise.race([
    once(owner, 'message').then(([message]) => message),
    exited.then(() => 'exited before acquiring lock'),
  ]);
  assert.equal(ready, 'held');
  const contend = () => spawnSync(process.execPath, ['-e', contenderCode, worker, file], {
    encoding: 'utf8', timeout: 5000,
  });
  const overlapping = contend();
  assert.equal(overlapping.error, undefined);
  assert.equal(overlapping.status, 0, 'other process must fail closed while owner is active');
  assert.equal(owner.kill('SIGKILL'), true);
  const [, signal] = await exited;
  assert.equal(signal, 'SIGKILL');
  assert.ok(fs.existsSync(file + '.lock'), 'abrupt owner death must preserve uncertainty');
  const afterCrash = contend();
  assert.equal(afterCrash.error, undefined);
  assert.equal(afterCrash.status, 0, 'other process must not steal abandoned claim');
  // Only the synthetic fixture is reconciled here; no live ledger is used.
  fs.rmdirSync(file + '.lock');
  let calls = 0;
  await withFulfillmentLock(file, () => { calls += 1; });
  assert.equal(calls, 1);
});

test('ledger file aliases and non-regular paths fail closed without invoking fulfillment', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'free-site-alias-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'state.json');
  const symlink = path.join(dir, 'symlink.json');
  const dangling = path.join(dir, 'dangling.json');
  const hardlink = path.join(dir, 'hardlink.json');
  const directory = path.join(dir, 'directory.json');
  const parent = path.join(dir, 'parent');
  fs.writeFileSync(file, '{}');
  fs.symlinkSync(file, symlink);
  fs.symlinkSync(path.join(dir, 'missing'), dangling);
  fs.mkdirSync(directory);
  fs.symlinkSync(dir, parent, 'dir');
  let calls = 0;
  const work = () => { calls += 1; };
  for (const alias of [symlink, dangling, directory]) {
    await assert.rejects(withFulfillmentLock(alias, work), /Unsupported fulfillment ledger/);
    assert.equal(fs.existsSync(alias + '.lock'), false);
  }
  fs.linkSync(file, hardlink);
  for (const alias of [file, hardlink]) {
    await assert.rejects(withFulfillmentLock(alias, work), /Unsupported fulfillment ledger/);
    assert.equal(fs.existsSync(alias + '.lock'), false);
  }
  assert.equal(calls, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), '{}');
  fs.unlinkSync(hardlink);
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  const owner = withFulfillmentLock(file, () => held);
  try {
    await assert.rejects(withFulfillmentLock(path.join(parent, 'state.json'), work), /lock held/);
  } finally {
    release();
    await owner;
  }
  assert.equal(calls, 0);
  await withFulfillmentLock(file, work);
  await withFulfillmentLock(path.join(dir, 'new.json'), work);
  assert.equal(calls, 2);
});
