function value(input) {
  return String(input || '').trim();
}

export async function saveNewsletterSubscriber(input, config = process.env, fetchImpl = fetch) {
  const baseUrl = value(config.NEWSLETTER_STORE_URL).replace(/\/$/, '');
  const token = value(config.NEWSLETTER_STORE_TOKEN);
  if (!baseUrl || !token) throw new Error('Newsletter store is not configured.');
  const response = await fetchImpl(`${baseUrl}/v1/subscribers`, {
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
