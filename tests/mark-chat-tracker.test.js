import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildFilter,
  eventsFromSync,
  renderTranscript,
  fitTranscript,
  DEFAULTS,
} = await import('../scripts/ops/mark-chat-tracker.mjs');

test('Mark tracker Matrix filter is constrained to the GUN room and message timeline', () => {
  const filter = buildFilter(DEFAULTS.roomId);
  assert.deepEqual(filter.room.rooms, [DEFAULTS.roomId]);
  assert.deepEqual(filter.room.timeline.types, ['m.room.message']);
  assert.equal(filter.room.timeline.limit, 100);
});

test('Mark tracker extracts only message events from the connected room', () => {
  const payload = {
    rooms: {
      join: {
        [DEFAULTS.roomId]: {
          timeline: {
            events: [
              {
                type: 'm.room.message',
                event_id: '$one',
                sender: '@amark:gitter.im',
                origin_server_ts: 1_790_000_000_000,
                content: { msgtype: 'm.text', body: 'GUN update' },
              },
              {
                type: 'm.room.member',
                event_id: '$two',
                sender: '@someone:gitter.im',
                content: {},
              },
            ],
          },
        },
      },
    },
  };
  const events = eventsFromSync(payload, DEFAULTS.roomId);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, '$one');
  assert.equal(events[0].body, 'GUN update');
});

test('Mark tracker renders a private rolling transcript without credentials', () => {
  const text = renderTranscript({
    messages: [{ id: '$one', sender: '@amark:gitter.im', ts: 1_790_000_000_000, body: 'hello' }],
    updatedAt: '2026-09-29T00:00:00.000Z',
  });
  assert.match(text, /# Mark Nadal \/ GUN chat tracker/);
  assert.match(text, /@amark:gitter\.im/);
  assert.match(text, /hello/);
  assert.doesNotMatch(text, /accessToken|refreshToken/);
});

test('Mark tracker trims retained messages to fit the private knowledge byte budget', () => {
  const messages = Array.from({ length: 80 }, (_, i) => ({
    id: `$${i}`,
    sender: '@amark:gitter.im',
    ts: 1_790_000_000_000 + i,
    body: 'x'.repeat(4000),
  }));
  const kept = fitTranscript(messages, { maxNoteBytes: 32 * 1024, maxMessages: 80 });
  const text = renderTranscript({ messages: kept, updatedAt: '2026-09-29T00:00:00.000Z' });
  assert.ok(kept.length < messages.length);
  assert.ok(Buffer.byteLength(text, 'utf8') <= 32 * 1024);
});
