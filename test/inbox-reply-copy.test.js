const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLocalReplyDraft,
  buildLlmReplyDraft,
  buildPublicAgentReplyDraft,
  buildPublicAgentReplyText,
  buildFreeDesignReplyDraft,
  buildReplyDraft,
  buildReplyHeadline,
  buildReplyText,
  replyContactFooter,
  detectReplyIntent,
  pickReplyPreviewCandidates,
  printReplyPreviews,
} = require('../thomas-agent/node/inbox-monitor');
const { buildContactFooter } = require('../thomas-agent/node/contact-footer');

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

test('builds a personalized free web design reply when a website is supplied', () => {
  const input = message({
    messageId: '<design-1@example.com>',
    from: 'Avery Owner <avery@example.com>',
    fromEmail: 'avery@example.com',
    subject: 'Free web design',
    preview: 'Our current website is https://www.acme-studio.com.',
  });
  const state = { messages: { [input.messageId]: {} } };
  const draft = buildFreeDesignReplyDraft(input, state);

  assert.equal(draft.source, 'free-design-preview');
  assert.equal(draft.website, 'https://www.acme-studio.com/');
  assert.match(draft.headline, /Acme Studio web design is ready/i);
  assert.match(draft.previewUrl, /^https:\/\/portal\.3dvr\.tech\/free-page\/preview\/\?r=inbound-/);
  assert.match(draft.text, new RegExp(draft.previewUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(draft.text, /no charge and no obligation/i);
  assert.match(draft.text, /3dvr\.tech@gmail\.com/);
});

test('asks for the website when a free design request omits it', () => {
  const input = message({
    from: 'Avery Owner <avery@example.com>',
    fromEmail: 'avery@example.com',
    subject: 'Free web design',
    preview: 'Can you make one for my business?',
  });
  const draft = buildFreeDesignReplyDraft(input, { messages: {} });

  assert.equal(draft.source, 'free-design-intake');
  assert.equal(draft.previewUrl, '');
  assert.match(draft.text, /current website URL/i);
  assert.match(draft.text, /business name if you do not have a site/i);
});

test('reply drafts include website, email, and phone contact details', () => {
  const previousPhone = process.env.THREEDVR_OUTREACH_PHONE;
  const previousWebsite = process.env.THREEDVR_INBOX_AUTO_REPLY_WEBSITE;
  const previousGmail = process.env.GMAIL_USER;
  process.env.THREEDVR_OUTREACH_PHONE = '+18643602659';
  process.env.THREEDVR_INBOX_AUTO_REPLY_WEBSITE = 'https://3dvr.tech';
  process.env.GMAIL_USER = '3dvr.tech@gmail.com';

  try {
    const input = message({ preview: 'Can you help with the booking page?' });
    const text = buildReplyText({ name: 'Acme Studio' }, input, { messages: {} });
    const footer = buildContactFooter({
      website: 'https://3dvr.tech',
      email: '3dvr.tech@gmail.com',
      phone: '+18643602659',
    });

    assert.equal(replyContactFooter(), footer);
    assert.match(text, new RegExp(footer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    process.env.THREEDVR_OUTREACH_PHONE = previousPhone || '';
    process.env.THREEDVR_INBOX_AUTO_REPLY_WEBSITE = previousWebsite || '';
    process.env.GMAIL_USER = previousGmail || '';
  }
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

  assert.equal(draft.source, 'openai');
  assert.equal(draft.headline, 'I can look at the booking page.');
  assert.match(draft.text, /booking URL/);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /chat\/completions/);
  assert.equal(JSON.parse(calls[0].options.body).response_format.type, 'json_object');
});

test('uses mocked local model replies', async () => {
  const input = message({ preview: 'Sure, can you look at my booking page?' });
  const calls = [];
  const draft = await buildLocalReplyDraft({ name: 'Acme Studio', link: 'https://example.com' }, input, { messages: {} }, {
    commandExistsImpl: () => true,
    fileExistsImpl: () => true,
    runCommandImpl: async (command, args, options) => {
      calls.push({ command, args, options });
      return JSON.stringify({
        headline: 'I can look at the booking page.',
        text: 'Hi Jordan,\\n\\nSend the booking URL and what you want visitors to do next. I will start there.',
      });
    },
  });

  assert.equal(draft.source, 'local');
  assert.equal(draft.headline, 'I can look at the booking page.');
  assert.match(draft.text, /booking URL/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].args.includes('--single-turn'));
  assert.ok(calls[0].args.includes('--simple-io'));
  assert.ok(calls[0].args.includes('--no-display-prompt'));
  assert.ok(calls[0].args.includes('--no-show-timings'));
  assert.ok(calls[0].args.includes('--no-warmup'));
  assert.equal(calls[0].args[calls[0].args.indexOf('--temp') + 1], '0.35');
  assert.equal(calls[0].args[calls[0].args.indexOf('-n') + 1], '160');
  assert.equal(calls[0].args[calls[0].args.indexOf('--ctx-size') + 1], '2048');
  assert.equal(calls[0].options.timeoutMs, 120000);
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

test('preview reply candidates include contacted leads and render reply drafts', async () => {
  const previousMode = process.env.THREEDVR_INBOX_REPLY_MODE;
  process.env.THREEDVR_INBOX_REPLY_MODE = 'template';

  const leadMap = new Map([
    ['lead@example.com', { name: 'Acme Studio', link: 'https://example.com', contact: 'mailto:lead@example.com' }],
  ]);
  const messages = [
    message({ preview: 'Can you help with the booking page?', fromEmail: 'lead@example.com' }),
    message({ preview: 'Unrelated message', fromEmail: 'other@example.com' }),
  ];
  const output = [];
  const originalLog = console.log;

  try {
    console.log = (...args) => {
      output.push(args.join(' '));
    };

    const candidates = pickReplyPreviewCandidates(messages, leadMap);
    await printReplyPreviews(messages, leadMap, { messages: {} });

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].lead.name, 'Acme Studio');
    assert.match(output.join('\n'), /Reply preview/);
    assert.match(output.join('\n'), /Acme Studio/);
    assert.match(output.join('\n'), /Headline:/);
    assert.match(output.join('\n'), /Hi Jordan,/i);
  } finally {
    console.log = originalLog;
    process.env.THREEDVR_INBOX_REPLY_MODE = previousMode || '';
  }
});

test('public 3dvr-agent replies ask for a concrete target and include contact details', () => {
  const previousPhone = process.env.THREEDVR_OUTREACH_PHONE;
  process.env.THREEDVR_OUTREACH_PHONE = '+18643602659';
  const input = message({
    from: 'Alex Request <alex@example.com>',
    fromEmail: 'alex@example.com',
    subject: '3dvr-agent help',
    preview: 'Can the agent look at my website?',
  });

  try {
    const draft = buildPublicAgentReplyDraft(input, { messages: {} });
    const text = buildPublicAgentReplyText(input, { messages: {} });

    assert.equal(draft.source, 'public-template');
    assert.equal(draft.headline, '3DVR agent request received.');
    assert.match(text, /Hi Alex,/);
    assert.match(text, /repo, website, file path, or exact task/i);
    assert.match(text, /3dvr.tech@gmail.com/);
    assert.match(text, /\+18643602659/);
  } finally {
    process.env.THREEDVR_OUTREACH_PHONE = previousPhone || '';
  }
});
