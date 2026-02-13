import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildOfferHtml,
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

test('resolveAutopilotConfig applies budget cap and defaults', () => {
  const config = resolveAutopilotConfig({
    env: {
      MONEY_AUTOPILOT_MARKET: 'small agencies',
      MONEY_AUTOPILOT_KEYWORDS: 'a,b,c',
      MONEY_AUTOPILOT_CHANNELS: 'reddit,linkedin',
      MONEY_AUTOPILOT_WEEKLY_BUDGET: '900',
      MONEY_AUTOPILOT_MAX_BUDGET: '250'
    }
  });

  assert.equal(config.market, 'small agencies');
  assert.deepEqual(config.keywords, ['a', 'b', 'c']);
  assert.deepEqual(config.channels, ['reddit', 'linkedin']);
  assert.equal(config.budget, 250);
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
    }
  });

  assert.match(html, /Lead Follow Up Automator/);
  assert.match(html, /Leads are dropped during manual follow-up/);
  assert.match(html, /\$49\/mo/);
  assert.match(html, /Step one/);
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

test('runAutopilotCycle executes loop with defaults and skips publish when disabled', async () => {
  let receivedPayload = null;

  const result = await runAutopilotCycle({
    env: {
      MONEY_AUTOPILOT_MARKET: 'creator businesses',
      MONEY_AUTOPILOT_KEYWORDS: 'newsletter,follow-up',
      MONEY_AUTOPILOT_CHANNELS: 'reddit,x',
      MONEY_AUTOPILOT_WEEKLY_BUDGET: '120',
      MONEY_AUTOPILOT_PUBLISH: 'false'
    },
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
  assert.equal(result.publish.published, false);
  assert.equal(result.publish.reason, 'publish disabled');
  assert.match(result.artifacts.offerHtml, /Newsletter follow-up assistant/);
});
