import assert from 'node:assert/strict';
import test from 'node:test';
import { runMoneyLoop } from '../src/money/engine.js';

function createResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    }
  };
}

function createFetchStub({ openAi }) {
  return async (url, request = {}) => {
    if (String(url).includes('hn.algolia.com')) {
      return createResponse({
        hits: [
          {
            objectID: 'hn-1',
            title: 'Freelancers lose deals from slow follow-up',
            points: 120,
            num_comments: 48,
            url: 'https://example.com/hn-1',
            created_at: '2026-02-10T00:00:00.000Z'
          }
        ]
      });
    }

    if (String(url).includes('reddit.com') && String(url).includes('search.json')) {
      return createResponse({
        data: {
          children: [
            {
              data: {
                id: 'rd-1',
                title: 'Need better proposal workflow automation',
                selftext: 'Manual steps are killing us.',
                score: 180,
                num_comments: 63,
                created_utc: 1739059200,
                permalink: '/r/freelance/comments/rd-1/example/'
              }
            }
          ]
        }
      });
    }

    if (String(url).includes('api.openai.com')) {
      if (!openAi) {
        return createResponse({ error: 'OpenAI disabled in this test' }, 500);
      }

      const body = JSON.parse(request.body || '{}');
      assert.equal(body.model, 'gpt-4o-mini');

      return createResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                opportunities: [
                  {
                    id: 'ai-1',
                    title: 'Proposal follow-up autopilot',
                    problem: 'Leads go cold before founders respond',
                    audience: 'solo agencies',
                    solution: 'Automate follow-up drafts with CRM reminders.',
                    mvp: 'Inbox + CRM sync and one-click sequence',
                    suggestedPrice: '$49/mo',
                    painScore: 86,
                    willingnessToPay: 78,
                    speedToBuild: 62,
                    competitionGap: 59,
                    evidence: ['Signal cluster indicates repeated complaint.']
                  }
                ],
                adDrafts: [
                  {
                    id: 'ad-1',
                    channel: 'linkedin',
                    headline: 'Stop losing leads to follow-up lag',
                    body: 'Launch an autopilot follow-up flow in one day.',
                    cta: 'Book a pilot',
                    linkedOpportunityId: 'ai-1'
                  }
                ],
                monetizationNotes: ['Offer setup fee plus monthly plan.']
              })
            }
          }
        ]
      });
    }

    throw new Error(`Unexpected URL in test: ${url}`);
  };
}

test('runMoneyLoop builds fallback opportunities without OpenAI', async () => {
  const report = await runMoneyLoop(
    {
      market: 'freelancers managing outreach',
      keywords: ['lead follow-up', 'proposal workflow'],
      channels: ['reddit', 'x'],
      budget: 100
    },
    {
      fetchImpl: createFetchStub({ openAi: false }),
      now: () => new Date('2026-02-13T10:00:00.000Z'),
      openAiApiKey: ''
    }
  );

  assert.equal(report.usedOpenAi, false);
  assert.ok(report.signals.length >= 1);
  assert.ok(report.opportunities.length > 0);
  assert.ok(report.topOpportunity);
  assert.ok(report.executionChecklist.length >= 4);
  if (report.opportunities.length > 1) {
    assert.ok(report.opportunities[0].score >= report.opportunities[1].score);
  }
});

test('runMoneyLoop uses OpenAI output when API key is present', async () => {
  const report = await runMoneyLoop(
    {
      market: 'solo agencies',
      keywords: ['follow up'],
      channels: ['linkedin'],
      budget: 200
    },
    {
      fetchImpl: createFetchStub({ openAi: true }),
      now: () => new Date('2026-02-13T10:00:00.000Z'),
      openAiApiKey: 'sk-test'
    }
  );

  assert.equal(report.usedOpenAi, true);
  assert.equal(report.topOpportunity?.id, 'ai-1');
  assert.equal(report.adDrafts[0]?.id, 'ad-1');
  assert.equal(report.monetizationNotes[0], 'Offer setup fee plus monthly plan.');
});
