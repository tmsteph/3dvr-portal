// Mobile-friendly hosted task client. Signing is supplied by the existing
// authenticated Portal session; never persist or transmit a private SEA key.
export function createHostedPilotClient({ sign, fetchImpl = fetch, endpoint = '/api/hosted-operator' }) {
  if (typeof sign !== 'function') throw new TypeError('sign_required');
  async function request(action, fields) {
    const proof = await sign('hosted-operator-task', action, fields);
    if (!proof?.authProof || !proof?.authPub) throw new Error('sign_in_required');
    const response = await fetchImpl(endpoint, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...fields, action, authProof: proof.authProof, authPub: proof.authPub })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'pilot_request_failed');
    return payload;
  }
  return {
    submit(repository, idempotencyKey) {
      return request('submit', { kind: 'repo-status', repository, idempotencyKey });
    },
    status(taskId) { return request('status', { taskId }); }
  };
}
