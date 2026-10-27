import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import SEA from 'gun/sea.js';

// This is an explicitly authorized, signed canary. Never enqueue legacy Gun
// records: the managed worker only accepts owner-authenticated HTTP tasks.
export async function runOperatorRuntimeE2E({
  env = process.env,
  sea = SEA,
  fetchImpl = globalThis.fetch,
  log = console.log,
  now = () => Date.now(),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  newId = randomUUID
} = {}) {
  if (env.OPERATOR_RUNTIME_E2E_RUN_AUTHORIZED !== '1') {
    throw new Error('Signed Operator E2E is disabled; explicit run and cost authorization required.');
  }
  const origin = 'https://portal.3dvr.tech';
  const encodedPair = env.OPERATOR_RUNTIME_E2E_SEA_PAIR || '';
  const expectedPub = env.OPERATOR_RUNTIME_E2E_OWNER_PUB || '';
  if (!encodedPair || !expectedPub) throw new Error('Signed owner identity is not configured.');
  let pair;
  try { pair = JSON.parse(encodedPair); } catch { throw new Error('Signed owner identity is invalid.'); }
  if (!pair?.pub || pair.pub !== expectedPub || !pair.priv || !pair.epriv) {
    throw new Error('Signed owner identity does not match the expected owner.');
  }
  const probe = { scope: 'operator-runtime-e2e-self-check', pub: pair.pub, iat: now() };
  const selfCheck = await sea.verify(await sea.sign(probe, pair), pair.pub);
  if (selfCheck?.scope !== probe.scope || selfCheck?.pub !== pair.pub) {
    throw new Error('Signed owner identity failed self-check.');
  }
  const requestId = `operator-e2e-${newId().replace(/-/g, '')}`;
  const task = {
    action: 'enqueue', requestId,
    title: 'Signed Operator execution canary',
    text: 'Calculate 6 times 7. Return only the answer and a short explanation. Do not access networks, files, accounts, or external services; do not make changes.'
  };
  const timeoutMs = Math.min(240000, Math.max(1000, Number(env.OPERATOR_RUNTIME_E2E_TIMEOUT_MS) || 120000));
  const pollMs = 2000;
  const states = [];
  async function request(fields) {
    const authProof = await sea.sign({ ...fields, scope: 'operator-runtime-task', pub: pair.pub, origin, iat: now() }, pair);
    // Never log or persist the signing pair or proof.
    const response = await fetchImpl(`${origin}/api/operator-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify({ ...fields, authPub: pair.pub, authProof }),
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    return { status: response.status, result };
  }
  log(`E2E_TASK_REQUEST_ID=${requestId}`);
  let admission;
  try { admission = await request(task); }
  catch { log('E2E_ADMISSION=uncertain'); }
  if (admission && ![202, 503].includes(admission.status)) {
    throw new Error(`Signed task admission rejected (HTTP ${admission.status}).`);
  }
  if (admission?.status === 202 && admission.result?.ok !== true) {
    throw new Error('Signed task admission was not confirmed.');
  }
  // An uncertain admission must be observed with the same request ID, never
  // resubmitted. A 404 can mean the original request was not persisted.
  const deadline = now() + timeoutMs;
  let lastRecord;
  while (now() < deadline) {
    let response;
    try { response = await request({ action: 'status', requestId }); }
    catch { await sleep(pollMs); continue; }
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Signed status authorization rejected (HTTP ${response.status}).`);
    }
    if (response.status === 200 && response.result?.ok && response.result?.record) {
      lastRecord = response.result.record;
      const state = lastRecord.status || 'unknown';
      if (states.at(-1) !== state) { states.push(state); log(`E2E_STATE=${state}`); }
      if (['completed', 'failed', 'blocked', 'review', 'cancelled'].includes(state)) break;
    }
    await sleep(pollMs);
  }
  log(`E2E_TRANSITIONS=${JSON.stringify(states)}`);
  if (lastRecord?.status !== 'completed') {
    throw new Error(`Signed task did not complete; last state: ${lastRecord?.status || 'unknown'}. Do not resubmit the request.`);
  }
  if (!lastRecord.startedAt || !lastRecord.completedAt ||
      !Number.isFinite(Date.parse(lastRecord.startedAt)) ||
      !Number.isFinite(Date.parse(lastRecord.completedAt)) ||
      Date.parse(lastRecord.completedAt) < Date.parse(lastRecord.startedAt) ||
      !lastRecord.workerDeviceId ||
      !(lastRecord.resultText || lastRecord.resultSummary)) {
    throw new Error('Task completed without a durable, attributable execution receipt.');
  }
  log(`E2E_RECEIPT=${JSON.stringify({ requestId, status: lastRecord.status,
    startedAt: lastRecord.startedAt, completedAt: lastRecord.completedAt,
    workerDeviceId: lastRecord.workerDeviceId, hasResult: true })}`);
  log('E2E_PASS=true');
  return { requestId, states, receipt: lastRecord };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runOperatorRuntimeE2E().catch(error => {
    console.error(`E2E_FAIL=${error.message}`);
    process.exitCode = 1;
  });
}
