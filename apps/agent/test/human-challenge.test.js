const test = require('node:test');
const assert = require('node:assert/strict');

const { fillContactForm } = require('../thomas-agent/node/contact-form-fill');
const { detectHumanChallenge } = require('../thomas-agent/node/human-challenge');

test('detectHumanChallenge recognizes common providers and verification text', () => {
  assert.equal(detectHumanChallenge('<div class="g-recaptcha"></div>').kind, 'recaptcha');
  assert.equal(detectHumanChallenge('<iframe src="https://hcaptcha.com/1/api.js"></iframe>').kind, 'hcaptcha');
  assert.equal(detectHumanChallenge('<div class="cf-turnstile"></div>').kind, 'turnstile');
  assert.equal(detectHumanChallenge('<h1>Verify you are human</h1>').kind, 'human-verification');
  assert.deepEqual(detectHumanChallenge('<form><input name="email"></form>'), { detected: false });
});

test('fillContactForm stops before filling when a human challenge is already present', async () => {
  let adapterCalled = false;
  const page = {
    async goto() {},
    async content() { return '<div class="cf-turnstile"></div>'; },
  };
  const result = await fillContactForm(page, { name: 'Example', link: 'https://example.test' }, 'Hello', {
    targetUrl: 'https://example.test/contact',
    adapter: { id: 'test', async fill() { adapterCalled = true; return { submitted: true }; } },
  });

  assert.equal(adapterCalled, false);
  assert.equal(result.status, 'human-challenge');
  assert.equal(result.requiresHuman, true);
  assert.equal(result.challenge.kind, 'turnstile');
  assert.equal(result.submitted, false);
});

test('fillContactForm notices a challenge that appears after submit', async () => {
  let reads = 0;
  const page = {
    async goto() {},
    async content() {
      reads += 1;
      return reads === 1 ? '<form><input name="email"></form>' : '<div class="g-recaptcha"></div>';
    },
    url() { return 'https://example.test/contact'; },
  };
  const result = await fillContactForm(page, { name: 'Example', link: 'https://example.test' }, 'Hello', {
    targetUrl: 'https://example.test/contact',
    adapter: {
      id: 'test',
      async fill() { return { submitted: true, filled: [{ role: 'email' }] }; },
    },
  });

  assert.equal(result.status, 'human-challenge');
  assert.equal(result.challenge.kind, 'recaptcha');
  assert.equal(result.submitted, false);
  assert.equal(result.filled.length, 1);
});
