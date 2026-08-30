function value(input) {
  return String(input || '').trim();
}

function storeConfig(config = process.env) {
  const baseUrl = value(config.NEWSLETTER_STORE_URL).replace(/\/$/, '');
  const token = value(config.NEWSLETTER_STORE_TOKEN);
  if (!baseUrl || !token) throw new Error('Newsletter store is not configured.');
  return { baseUrl, token };
}

async function postStore(path, input, config = process.env, fetchImpl = fetch) {
  const { baseUrl, token } = storeConfig(config);
  const response = await fetchImpl(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(8_000)
  });
  if (!response.ok) throw new Error(`Newsletter store returned ${response.status}.`);
  return response.json();
}

export function saveNewsletterSubscriber(input, config = process.env, fetchImpl = fetch) {
  return postStore('/v1/subscribers', input, config, fetchImpl);
}

export function callChatPushStore(path, input, config = process.env, fetchImpl = fetch) {
  return postStore(`/v1/chat/${path}`, input, config, fetchImpl);
}
