import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  CHAT_PUSH_PROOF_PAYLOAD,
  sendChatPushProof
} from '../services/newsletter-store/chat-push-proof.mjs';

describe('chat push delivery proof', () => {
  it('uses the real Web Push sender with a visible server-path message', async () => {
    const subscription = { endpoint: 'https://push.example.test/subscription' };
    const webpushClient = {
      sendNotification: mock.fn(async () => ({ statusCode: 201 }))
    };

    const result = await sendChatPushProof(subscription, webpushClient);

    assert.deepEqual(result, { deliveryAccepted: true });
    assert.equal(webpushClient.sendNotification.mock.calls.length, 1);
    const [actualSubscription, rawPayload, options] = webpushClient.sendNotification.mock.calls[0].arguments;
    assert.equal(actualSubscription, subscription);
    assert.deepEqual(JSON.parse(rawPayload), CHAT_PUSH_PROOF_PAYLOAD);
    assert.match(JSON.parse(rawPayload).body, /live server push path/);
    assert.deepEqual(options, { TTL: 60, urgency: 'high' });
  });

  it('does not claim verification when the push service rejects delivery', async () => {
    const deliveryError = Object.assign(new Error('expired'), { statusCode: 410 });
    const webpushClient = {
      sendNotification: mock.fn(async () => { throw deliveryError; })
    };

    await assert.rejects(
      sendChatPushProof({ endpoint: 'https://push.example.test/expired' }, webpushClient),
      deliveryError
    );
  });
});
