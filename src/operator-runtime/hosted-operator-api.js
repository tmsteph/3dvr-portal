import { HostedTaskStore } from './hosted-task-store.js';
import { createHostedTaskHandler } from './hosted-task-handler.js';

export default async function handler(req, res) {
  const send = (status, error) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify({ error }));
  };
  const env = process.env;
  if (env.HOSTED_OPERATOR_PILOT_ENABLED !== 'true') return send(404, 'not_found');
  if (!env.HOSTED_OPERATOR_PILOT_STORE || !env.HOSTED_OPERATOR_PILOT_ORIGIN) return send(503, 'not_configured');
  if (req.method !== 'POST') return send(405, 'method_not_allowed');
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  if (JSON.stringify(body).length > 8192) return send(413, 'request_too_large');
  // No durable per-tenant budget reservation or spending ledger exists yet.
  // A fabricated positive allowance must never authorize paid work.
  if (body.action === 'submit') return send(503, 'budget_accounting_unavailable');
  const path = body.action === 'submit' ? '/tasks' : body.action === 'status' ? '/tasks/status' : '';
  if (!path) return send(400, 'invalid_action');
  try {
    const store = new HostedTaskStore(env.HOSTED_OPERATOR_PILOT_STORE);
    const pilot = createHostedTaskHandler({
      store, origin: env.HOSTED_OPERATOR_PILOT_ORIGIN,
      limits: { maxActive: 2, remainingCents: 0 }
    });
    return await pilot({ method: 'POST', url: path, body }, res);
  } catch {
    return send(503, 'pilot_unavailable');
  }
}
