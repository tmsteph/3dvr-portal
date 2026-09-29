import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildFilter,
  eventsFromSync,
  renderTranscript,
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
