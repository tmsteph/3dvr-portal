const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLlmReplyDraft,
  buildReplyDraft,
  buildReplyHeadline,
  buildReplyText,
  detectReplyIntent,
} = require('../thomas-agent/node/inbox-monitor');

function message(overrides = {}) {
  return {
    messageId: '<m1@example.com>',
    from: 'Jordan Lead <lead@example.com>',
    fromEmail: 'lead@example.com',
    subject: 'Re: quick idea',
    preview: '',
    ...overrides,
  };
}

function stateWithReplies(count, subject = 'Re: quick idea') {
  const messages = {};
  for (let index = 0; index < count; index += 1) {
    messages[`m${index}`] = {
      autoRepliedAt: new Date(Date.now() - index * 1000).toISOString(),
      fromEmail: 'lead@example.com',
      subject,
    };
  }
  return { messages };
}

test('detects test replies and produces explicit test copy', () => {
  const input = message({ preview: 'Test' });

  assert.equal(detectReplyIntent(input), 'test');
  assert.equal(buildReplyHeadline(input, { messages: {} }), 'Test reply received.');
  assert.match(buildReplyText({ name: 'Thomas' }, input, { messages: {} }), /inbox monitor|reply loop|routing/i);
});

test('answers pricing replies with scope-first guidance', () => {
  const input = message({ preview: 'How much does this cost for my website?' });
  const text = buildReplyText({ name: 'Acme Studio' }, input, { messages: {} });

  assert.equal(detectReplyIntent(input), 'pricing');
  assert.equal(buildReplyHeadline(input, { messages: {} }), 'A simple scope is the best place to start.');
  assert.match(text, /depends on how much/i);
  assert.match(text, /smallest useful scope/i);
});

test('answers scheduling replies with concrete next step', () => {
  const input = message({ preview: 'Can we schedule a call next week?' });
  const text = buildReplyText({ name: 'Acme Studio' }, input, { messages: {} });

  assert.equal(detectReplyIntent(input), 'schedule');
  assert.equal(buildReplyHeadline(input, { messages: {} }), 'A quick call can work.');
  assert.match(text, /two times/i);
});

test('varies follow-up replies within the same thread', () => {
  const input = message({ preview: 'Following up here too.' });
  const text = buildReplyText({ name: 'Acme Studio' }, input, stateWithReplies(1));

  assert.equal(buildReplyHeadline(input, stateWithReplies(1)), 'Got your follow-up.');
  assert.doesNotMatch(text, /Thanks for getting back to me/i);
  assert.match(text, /follow-up|tracking|fastest path/i);
});

test('handles no-thanks replies without pushing for a sale', () => {
  const input = message({ preview: 'No thanks, not interested.' });
  const text = buildReplyText({ name: 'Acme Studio' }, input, { messages: {} });

  assert.equal(detectReplyIntent(input), 'decline');
  assert.equal(buildReplyHeadline(input, { messages: {} }), 'Understood.');
  assert.match(text, /will not keep nudging/i);
});

test('uses mocked LLM replies when OpenAI is configured', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test_key';
  const input = message({ preview: 'Sure, can you look at my booking page?' });
  const calls = [];
  const draft = await buildLlmReplyDraft({ name: 'Acme Studio', link: 'https://example.com' }, input, { messages: {} }, {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            choices: [{
              message: {
                content: JSON.stringify({
                  headline: 'I can look at the booking page.',
                  text: 'Hi Jordan,\\n\\nSend the booking URL and the one action you want visitors to take. I will start there.',
                }),
              },
            }],
          };
        },
      };
    },
  });
  process.env.OPENAI_API_KEY = previousKey || '';

  assert.equal(draft.source, 'llm');
  assert.equal(draft.headline, 'I can look at the booking page.');
  assert.match(draft.text, /booking URL/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /chat\/completions/);
  assert.equal(JSON.parse(calls[0].options.body).response_format.type, 'json_object');
});

test('falls back to template reply when LLM is unavailable', async () => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  const input = message({ preview: 'How much does this cost?' });
  const draft = await buildReplyDraft({ name: 'Acme Studio' }, input, { messages: {} });
  process.env.OPENAI_API_KEY = previousKey || '';

  assert.equal(draft.source, 'template');
  assert.match(draft.text, /depends on how much/i);
});
