// Load SEA only when the production verifier is needed.

// Explicit opt-in pilot handler; do not mount until a trusted server-side
// origin and persistent private store are configured.
export function createHostedTaskHandler({ store, origin, verify = async (...args) => { const { verifySignedSeaPayload } = await import('../auth/sea.js'); return verifySignedSeaPayload(...args); }, limits = { maxActive: 2 } }) {
  if (!store || !origin || !/^https:\/\//.test(origin)) throw new Error('pilot_not_configured');
  return async function handle(req, res) {
    const send = (status, payload) => {
      res.statusCode = status;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify(payload));
    };
    if (!['GET', 'POST'].includes(req.method)) return send(405, { error: 'method_not_allowed' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const proof = await verify(body, { scope: 'hosted-operator-task', expectedOrigin: origin });
    if (!proof.ok || !proof.identity?.pub) return send(401, { error: 'unauthorized' });
    const tenantId = 'sea:' + proof.identity.pub;
    const expectedAction = body.action === 'submit' ? 'submit' : body.action === 'status' ? 'status' : '';
    if (!expectedAction || proof.identity.action !== expectedAction) return send(401, { error: 'unauthorized' });
    const signed = proof.verified || {};
    const signedFields = expectedAction === 'submit'
      ? ['kind', 'repository', 'idempotencyKey'] : ['taskId'];
    if (signedFields.some(key => signed[key] !== body[key])) return send(401, { error: 'unauthorized' });
    // Signed POST requests carry fresh SEA proofs; GET request bodies are unreliable.
    // Never accept tenant identity from input.
    const url = new URL(req.url || '/', origin);
    if (req.method === 'POST' && url.pathname === '/tasks') {
      const result = await store.submit(tenantId, {
        kind: body.kind, repository: body.repository, idempotencyKey: body.idempotencyKey
      }, limits);
      return send(result.ok ? 202 : 400, result.ok
        ? { id: result.task.id, status: result.task.status, duplicate: result.duplicate }
        : { error: result.reason });
    }
    const match = req.method === 'POST' && url.pathname === '/tasks/status' &&
      typeof body.taskId === 'string' && /^[a-f0-9-]{36}$/.test(body.taskId);
    if (match) {
      const task = await store.get(tenantId, body.taskId);
      return task ? send(200, {
        id: task.id, status: task.status, result: task.result || null,
        createdAt: task.createdAt, updatedAt: task.updatedAt
      }) : send(404, { error: 'not_found' });
    }
    return send(404, { error: 'not_found' });
  };
}
