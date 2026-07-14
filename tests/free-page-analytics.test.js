import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FREE_PAGE_ANALYTICS_PATH,
  createFreePageAnalyticsEvent,
  summarizeFreePageAnalytics,
  writeFreePageAnalyticsEvent
} from '../src/analytics/freePage.js';
import { fetchFirstPartyAnalyticsHints } from '../src/analytics/freePageReader.js';

function trackingGun() {
  const writes = [];
  function node(path = []) {
    return {
      get(key) {
        return node([...path, String(key)]);
      },
      put(value, callback) {
        writes.push({ path, value });
        callback?.({ ok: true });
      }
    };
  }
  return { gun: node(), writes };
}

test('creates a privacy-safe append-only Free Page event', async () => {
  const tracker = trackingGun();
  const event = createFreePageAnalyticsEvent('page_view', {
    id: 'event-1',
    sessionId: 'session-1',
    now: '2026-07-14T04:00:00.000Z'
  });

  await writeFreePageAnalyticsEvent(tracker.gun, event);

  assert.deepEqual(tracker.writes[0].path, [
    ...FREE_PAGE_ANALYTICS_PATH,
    '2026-07-14',
    'event-1'
  ]);
  assert.equal(tracker.writes[0].value.eventType, 'page_view');
  assert.equal(tracker.writes[0].value.page, '/free-page/');
  assert.equal('email' in tracker.writes[0].value, false);
  assert.equal('ip' in tracker.writes[0].value, false);
});

test('summarizes unique sessions, views, and leads while ignoring malformed events', () => {
  const events = [
    createFreePageAnalyticsEvent('page_view', {
      id: 'view-1', sessionId: 'session-1', now: '2026-07-14T04:00:00.000Z'
    }),
    createFreePageAnalyticsEvent('page_view', {
      id: 'view-2', sessionId: 'session-1', now: '2026-07-14T04:05:00.000Z'
    }),
    createFreePageAnalyticsEvent('generate_lead', {
      id: 'lead-1', sessionId: 'session-1', now: '2026-07-14T04:06:00.000Z'
    }),
    { id: 'bad', eventType: 'steal_data', page: '/free-page/', sessionId: 'x', timestamp: '2026-07-14T04:00:00Z' }
  ];

  assert.deepEqual(summarizeFreePageAnalytics(events), {
    sessions: 1,
    pageViews: 2,
    leads: 1,
    eventCount: 3
  });
});

test('returns Money Printer compatible analytics from a Gun reader', async () => {
  const events = {
    '2026-07-14': [
      createFreePageAnalyticsEvent('page_view', {
        id: 'view-1', sessionId: 'session-1', now: '2026-07-14T04:00:00.000Z'
      }),
      createFreePageAnalyticsEvent('generate_lead', {
        id: 'lead-1', sessionId: 'session-1', now: '2026-07-14T04:01:00.000Z'
      })
    ]
  };
  const result = await fetchFirstPartyAnalyticsHints({}, {
    now: '2026-07-14T05:00:00.000Z',
    client: {
      async readDay(day) {
        return events[day] || [];
      }
    }
  });

  assert.equal(result.enabled, true);
  assert.equal(result.source, 'gun-first-party');
  assert.equal(result.sessions, 1);
  assert.equal(result.pageViews, 1);
  assert.equal(result.leads, 1);
  assert.deepEqual(result.topPaths, ['/free-page/']);
});
