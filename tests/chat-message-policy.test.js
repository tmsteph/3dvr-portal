import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shouldNotifyForChatPublish } from '../services/newsletter-store/chat-message-policy.mjs';

describe('chat message publish policy', () => {
  it('notifies for normal live publishes', () => {
    assert.equal(shouldNotifyForChatPublish({}), true);
    assert.equal(shouldNotifyForChatPublish({ backfill: false }), true);
  });

  it('suppresses notifications for legacy history backfills', () => {
    assert.equal(shouldNotifyForChatPublish({ backfill: true }), false);
  });
});
