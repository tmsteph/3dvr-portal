export const CHAT_PUSH_PROOF_PAYLOAD = Object.freeze({
  title: '3DVR Chat test',
  body: 'This notification came through the live server push path.',
  room: 'general',
  messageId: '',
  tag: 'chat-push-delivery-test'
});

export async function sendChatPushProof(subscription, webpushClient) {
  await webpushClient.sendNotification(
    subscription,
    JSON.stringify(CHAT_PUSH_PROOF_PAYLOAD),
    { TTL: 60, urgency: 'high' }
  );
  return { deliveryAccepted: true };
}
