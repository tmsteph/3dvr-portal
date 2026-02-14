import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildKeywordList,
  fetchHackerNewsSignals
} from '../src/money/sources.js';

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

test('buildKeywordList removes redundant single terms covered by phrase keywords', () => {
  const keywords = buildKeywordList({
    market: 'freelancers and small agencies',
    keywords: ['client', 'client onboarding', 'lead follow up']
  });

  assert.equal(keywords.includes('client'), false);
  assert.equal(keywords.includes('client onboarding'), true);
  assert.equal(keywords.includes('lead follow up'), true);
});

test('fetchHackerNewsSignals filters weak single-token matches for multi-word keyword phrases', async () => {
  const fetchImpl = async () => {
    return createResponse({
      hits: [
        {
          objectID: 'hn-noise',
          title: 'Zoom client vulnerability allows malicious websites to enable camera',
          story_text: '',
          points: 300,
          num_comments: 140,
          url: 'https://example.com/noise',
          created_at: '2026-02-10T00:00:00.000Z'
        },
        {
          objectID: 'hn-fit',
          title: 'Client onboarding checklist that doubled agency retention',
          story_text: 'A repeatable onboarding workflow and automation template set.',
          points: 80,
          num_comments: 42,
          url: 'https://example.com/fit',
          created_at: '2026-02-11T00:00:00.000Z'
        }
      ]
    });
  };

  const signals = await fetchHackerNewsSignals({
    keywords: ['client onboarding'],
    limit: 12,
    fetchImpl
  });

  const signalIds = signals.map(signal => signal.id);
  assert.ok(signalIds.includes('hn-fit'));
  assert.equal(signalIds.includes('hn-noise'), false);
});

test('fetchHackerNewsSignals keeps best keyword match when duplicate urls appear across keyword queries', async () => {
  const fetchImpl = async (url) => {
    const query = new URL(url).searchParams.get('query');
    if (query === 'lead follow-up') {
      return createResponse({
        hits: [
          {
            objectID: 'hn-dup',
            title: 'Proposal workflow automation for agencies',
            story_text: 'Step-by-step template for onboarding and handoff.',
            points: 90,
            num_comments: 20,
            url: 'https://example.com/dup',
            created_at: '2026-02-10T00:00:00.000Z'
          }
        ]
      });
    }

    return createResponse({
      hits: [
        {
          objectID: 'hn-dup',
          title: 'Proposal workflow automation for agencies',
          story_text: 'Step-by-step template for onboarding and handoff.',
          points: 90,
          num_comments: 20,
          url: 'https://example.com/dup',
          created_at: '2026-02-10T00:00:00.000Z'
        }
      ]
    });
  };

  const signals = await fetchHackerNewsSignals({
    keywords: ['lead follow-up', 'proposal workflow'],
    limit: 12,
    fetchImpl
  });

  assert.equal(signals.length, 1);
  assert.equal(signals[0].keyword, 'proposal workflow');
});
