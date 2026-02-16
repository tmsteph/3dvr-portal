import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOfferHtml,
  deployOfferToVercel,
  publishOfferToGitHub,
  resolveAutopilotConfig,
  runAutopilotCycle
} from '../src/money/autopilot.js';

function createGithubFetchMock() {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });

    if (String(url).includes('/contents/') && (!options.method || options.method === 'GET')) {
      return {
        ok: false,
        status: 404,
        async text() {
          return 'Not found';
        },
        async json() {
          return { message: 'Not found' };
        }
      };
    }

    if (String(url).includes('/contents/') && options.method === 'PUT') {
      return {
        ok: true,
        status: 201,
        async text() {
          return '';
        },
        async json() {
          return {
            content: {
              path: 'money-ai/offers/run-1.html',
              html_url: 'https://github.com/example/repo/blob/main/money-ai/offers/run-1.html'
            },
            commit: {
              sha: 'abc123'
            }
          };
        }
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  return { fetchImpl, calls };
}

function createVercelFetchMock() {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });

    if (String(url).includes('api.vercel.com/v13/deployments')) {
      return {
        ok: true,
        status: 200,
        async text() {
          return '';
        },
        async json() {
          return {
            id: 'dpl_123',
            url: 'autopilot.example.vercel.app',
            inspectUrl: 'https://vercel.com/example/deployments/dpl_123'
          };
        }
      };
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  return { fetchImpl, calls };
}

test('resolveAutopilotConfig applies budget cap and defaults', () => {
  const config = resolveAutopilotConfig({
    env: {
      MONEY_AUTOPILOT_MARKET: 'small agencies',
      MONEY_AUTOPILOT_KEYWORDS: 'a,b,c',
      MONEY_AUTOPILOT_CHANNELS: 'reddit,linkedin',
      MONEY_AUTOPILOT_WEEKLY_BUDGET: '900',
      MONEY_AUTOPILOT_MAX_BUDGET: '250',
      MONEY_AUTOPILOT_CHECKOUT_URL: 'https://buy.stripe.com/example123'
    }
  });

  assert.equal(config.market, 'small agencies');
  assert.deepEqual(config.keywords, ['a', 'b', 'c']);
  assert.deepEqual(config.channels, ['reddit', 'linkedin']);
  assert.equal(config.budget, 250);
  assert.equal(config.autoDiscover, true);
  assert.equal(config.monetization.checkoutUrl, 'https://buy.stripe.com/example123');
  assert.equal(config.monetization.checkoutCtaLabel, 'Start Paid Plan');
});

test('buildOfferHtml renders top opportunity details', () => {
  const html = buildOfferHtml({
    report: {
      generatedAt: '2026-02-13T00:00:00.000Z',
      executionChecklist: ['Step one', 'Step two']
    },
    opportunity: {
      title: 'Lead Follow Up Automator',
      problem: 'Leads are dropped during manual follow-up.',
      solution: 'Automate reminder and outreach templates.',
      suggestedPrice: '$49/mo'
    },
    market: 'freelancers and small agencies'
  });

  assert.match(html, /Lead Follow Up Automator/);
  assert.match(html, /Leads are dropped during manual follow-up/);
  assert.match(html, /\$49\/mo/);
  assert.match(html, /freelancers and small agencies/);
  assert.match(html, /Step one/);
});

test('buildOfferHtml uses checkout CTA when monetization checkout URL is configured', () => {
  const html = buildOfferHtml({
    report: {
      generatedAt: '2026-02-13T00:00:00.000Z',
      monetization: {
        checkoutUrl: 'https://buy.stripe.com/example123',
        checkoutCtaLabel: 'Start Paid Plan'
      }
    },
    opportunity: {
      title: 'Inbound Follow-up Copilot',
      problem: 'Lead replies are too slow.',
      solution: 'Automate first-touch responses.',
      suggestedPrice: '$59/mo'
    },
    market: 'software startups and saas teams'
  });

  assert.match(html, /https:\/\/buy\.stripe\.com\/example123/);
  assert.match(html, /Start Paid Plan/);
});

test('publishOfferToGitHub creates or updates content via GitHub API', async () => {
  const { fetchImpl, calls } = createGithubFetchMock();

  const result = await publishOfferToGitHub({
    token: 'ghp_test',
    repo: 'owner/repo',
    path: 'money-ai/offers/run-1.html',
    branch: 'main',
    content: '<html>test</html>',
    message: 'Autopilot publish run-1',
    fetchImpl
  });

  assert.equal(result.path, 'money-ai/offers/run-1.html');
  assert.equal(result.commitSha, 'abc123');

  const putCall = calls.find(call => call.options.method === 'PUT');
  assert.ok(putCall);
  const body = JSON.parse(putCall.options.body);
  assert.equal(body.message, 'Autopilot publish run-1');
  assert.equal(body.branch, 'main');
});

test('deployOfferToVercel sends deployment payload', async () => {
  const { fetchImpl, calls } = createVercelFetchMock();

  const result = await deployOfferToVercel({
    token: 'vercel-token',
    projectName: 'autopilot-demo',
    html: '<html>ok</html>',
    target: 'production',
    fetchImpl
  });

  assert.equal(result.id, 'dpl_123');
  assert.equal(result.url, 'https://autopilot.example.vercel.app');

  const call = calls[0];
  assert.ok(call);
  const payload = JSON.parse(call.options.body);
  assert.equal(payload.target, 'production');
  assert.equal(payload.name, 'autopilot-demo');
});

test('runAutopilotCycle executes loop and returns publish/promotion summaries', async () => {
  let receivedPayload = null;

  const result = await runAutopilotCycle({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { rows: [] };
      },
      async text() {
        return '';
      }
    }),
    env: {
      MONEY_AUTOPILOT_MARKET: 'creator businesses',
      MONEY_AUTOPILOT_KEYWORDS: 'newsletter,follow-up',
      MONEY_AUTOPILOT_CHANNELS: 'reddit,x',
      MONEY_AUTOPILOT_WEEKLY_BUDGET: '120',
      MONEY_AUTOPILOT_PUBLISH: 'false',
      MONEY_AUTOPILOT_PROMOTION: 'false',
      MONEY_AUTOPILOT_GA_PROPERTY_ID: 'prop-123',
      MONEY_AUTOPILOT_GA_ACCESS_TOKEN: 'token'
    },
    autoDiscover: false,
    runLoopImpl: async payload => {
      receivedPayload = payload;
      return {
        runId: 'money-run-1',
        generatedAt: '2026-02-13T00:00:00.000Z',
        input: payload,
        topOpportunity: {
          id: 'op-1',
          title: 'Newsletter follow-up assistant',
          problem: 'Newsletter inquiries go unanswered.',
          solution: 'Auto-draft responses and reminders.',
          suggestedPrice: '$39/mo'
        },
        warnings: [],
        signals: [{ id: 's1' }],
        opportunities: [],
        adDrafts: [],
        executionChecklist: ['Ship MVP this week']
      };
    }
  });

  assert.equal(receivedPayload.market, 'creator businesses');
  assert.deepEqual(receivedPayload.keywords, ['newsletter', 'follow-up']);
  assert.deepEqual(receivedPayload.channels, ['reddit', 'x']);
  assert.equal(receivedPayload.budget, 120);

  assert.equal(result.runId, 'money-run-1');
  assert.equal(result.publish.github.published, false);
  assert.equal(result.publish.github.reason, 'github publish disabled');
  assert.equal(result.publish.vercel.reason, 'vercel deploy disabled');
  assert.equal(result.promotion.reason, 'promotion dispatch disabled');
  assert.equal(result.marketSelection.mode, 'configured');
  assert.match(result.artifacts.offerHtml, /Newsletter follow-up assistant/);
});

test('runAutopilotCycle sanitizes discovered keywords before running loop', async () => {
  let receivedPayload = null;

  await runAutopilotCycle({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { rows: [] };
      },
      async text() {
        return '';
      }
    }),
    env: {
      MONEY_AUTOPILOT_PUBLISH: 'false',
      MONEY_AUTOPILOT_PROMOTION: 'false'
    },
    autoDiscover: true,
    collectSignalsImpl: async () => ({
      warnings: [],
      signals: [
        {
          id: 'sig-1',
          source: 'hackernews',
          keyword: 'client onboarding',
          title: 'Client onboarding workflow for freelance teams',
          summary: 'Template and automation playbook for onboarding.',
          popularity: 120,
          comments: 40
        },
        {
          id: 'sig-2',
          source: 'hackernews',
          keyword: 'lead follow up',
          title: 'I&#x27;m testing agency follow-up templates',
          summary: 'Freelance teams share what closes more retainers.',
          popularity: 80,
          comments: 20
        }
      ]
    }),
    runLoopImpl: async payload => {
      receivedPayload = payload;
      return {
        runId: 'money-run-sanitized',
        generatedAt: '2026-02-13T00:00:00.000Z',
        input: payload,
        topOpportunity: {
          id: 'op-1',
          title: 'Sanitized keyword opportunity',
          problem: 'Manual follow-up is slow.',
          solution: 'Automate the flow.',
          suggestedPrice: '$39/mo'
        },
        warnings: [],
        signals: [{ id: 's1' }],
        opportunities: [],
        adDrafts: [],
        executionChecklist: []
      };
    }
  });

  assert.ok(receivedPayload);
  assert.equal(receivedPayload.keywords.includes('x27'), false);
  assert.equal(receivedPayload.keywords.includes('client'), false);
  assert.equal(receivedPayload.keywords.includes('agency'), false);
  assert.ok(receivedPayload.keywords.includes('client onboarding'));
});

test('runAutopilotCycle uses checkout URL as destination fallback', async () => {
  const result = await runAutopilotCycle({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { rows: [] };
      },
      async text() {
        return '';
      }
    }),
    env: {
      MONEY_AUTOPILOT_PUBLISH: 'false',
      MONEY_AUTOPILOT_PROMOTION: 'false',
      MONEY_AUTOPILOT_CHECKOUT_URL: 'https://buy.stripe.com/example123'
    },
    autoDiscover: false,
    runLoopImpl: async payload => ({
      runId: 'money-checkout',
      generatedAt: '2026-02-13T00:00:00.000Z',
      input: payload,
      topOpportunity: {
        id: 'op-1',
        title: 'Checkout fallback opportunity',
        problem: 'Manual checkout links are missing.',
        solution: 'Attach Stripe checkout in generated offer.',
        suggestedPrice: '$39/mo'
      },
      warnings: [],
      signals: [{ id: 's1' }],
      opportunities: [],
      adDrafts: [],
      executionChecklist: []
    })
  });

  assert.equal(result.publish.destinationUrl, 'https://buy.stripe.com/example123');
  assert.equal(result.monetization.checkoutConfigured, true);
  assert.equal(result.monetization.checkoutCtaLabel, 'Start Paid Plan');
});
