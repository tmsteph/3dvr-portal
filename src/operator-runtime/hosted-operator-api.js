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
  // Accounting readiness is an explicit rollout gate, separate from pilot enablement.
  if (body.action === 'submit' && env.HOSTED_OPERATOR_PILOT_ACCOUNTING_READY !== 'true') {
    return send(503, 'budget_accounting_unavailable');
  }
  const reservationCents = Number(env.HOSTED_OPERATOR_PILOT_RESERVATION_CENTS);
  if (body.action === 'submit' && (!Number.isSafeInteger(reservationCents) || reservationCents < 1)) {
    return send(503, 'budget_not_configured');
  }
  const path = body.action === 'submit' ? '/tasks' : body.action === 'status' ? '/tasks/status' : '';
  if (!path) return send(400, 'invalid_action');
  try {
    // Node 20 fallback can boot while the Node 22+ pilot remains disabled.
    const { HostedTaskStore } = await import('./hosted-task-store.js');
    const store = new HostedTaskStore(env.HOSTED_OPERATOR_PILOT_STORE);
    const pilot = createHostedTaskHandler({
      store, origin: env.HOSTED_OPERATOR_PILOT_ORIGIN,
      limits: { maxActive: 2, reservationCents }
    });
    return await pilot({ method: 'POST', url: path, body }, res);
  } catch {
    return send(503, 'pilot_unavailable');
  }
}
