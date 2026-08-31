import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildKeywordList,
  collectDemandSignals,
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

test('fetchHackerNewsSignals bounds request concurrency and keeps successful partial results', async () => {
  let activeRequests = 0;
  let maxActiveRequests = 0;
  const fetchImpl = async url => {
    activeRequests += 1;
    maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
    const query = new URL(url).searchParams.get('query');
    await new Promise(resolve => setTimeout(resolve, 5));
    activeRequests -= 1;

    if (query === 'failed workflow') {
      throw new Error('source unavailable');
    }

    return createResponse({
      hits: [{
        objectID: query,
        title: `${query} demand from small businesses`,
        story_text: `${query} demand is growing`,
        points: 20,
        num_comments: 5,
        url: `https://example.com/${encodeURIComponent(query)}`,
        created_at: new Date().toISOString()
      }]
    });
  };

  const signals = await fetchHackerNewsSignals({
    keywords: ['client onboarding', 'failed workflow', 'proposal automation'],
    limit: 12,
    concurrency: 2,
    fetchImpl
  });

  assert.equal(maxActiveRequests, 2);
  assert.deepEqual(signals.map(signal => signal.keyword).sort(), [
    'client onboarding',
    'proposal automation'
  ]);
});

test('collectDemandSignals times out stalled requests and returns other source results', async () => {
  const fetchImpl = async url => {
    if (url.includes('reddit.com')) {
      return new Promise(() => {});
    }

    return createResponse({
      hits: [{
        objectID: 'hn-fit',
        title: 'Client onboarding demand from small agencies',
        story_text: 'Client onboarding workflow demand is increasing.',
        points: 20,
        num_comments: 5,
        url: 'https://example.com/fit',
        created_at: new Date().toISOString()
      }]
    });
  };

  const startedAt = Date.now();
  const result = await collectDemandSignals({
    keywords: ['client onboarding'],
    requestTimeoutMs: 20,
    fetchImpl
  });

  assert.ok(Date.now() - startedAt < 500);
  assert.equal(result.signals.length, 1);
  assert.match(result.warnings.join(' '), /timed out/i);
});
