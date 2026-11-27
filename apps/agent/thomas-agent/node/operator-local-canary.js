const { request } = require('node:http');

const MAX_BYTES = 64 * 1024;
const DEADLINE_MS = 30000;

// Deliberately not a general agent or a production backend. Only the existing
// signed canary's exact claimed task may use a separately reviewed local lane.
function localCanaryConfig(record, env) {
  const id = env.OPERATOR_RUNTIME_E2E_EXPECTED_TASK_ID;
  const digest = env.OPERATOR_RUNTIME_E2E_EXPECTED_REQUEST_DIGEST;
  const worker = env.OPERATOR_RUNTIME_E2E_EXPECTED_WORKER_DEVICE_ID;
  const endpoint = env.OPERATOR_RUNTIME_E2E_LOCAL_MODEL_URL || '';
  const model = env.OPERATOR_RUNTIME_E2E_LOCAL_MODEL || '';
  if (env.OPERATOR_RUNTIME_E2E_RUN_AUTHORIZED !== '1'
      || env.OPERATOR_RUNTIME_E2E_LOCAL_MODEL_ENABLED !== '1'
      || !/^operator-http-[a-f0-9]{24}-operator-e2e-[A-Za-z0-9_-]{12,80}$/.test(id || '')
      || record.id !== id || !/^[a-f0-9]{64}$/.test(digest || '')
      || record.operatorRequestDigest !== digest
      || record.backend !== 'local-canary' || record.unsafe !== false
      || typeof record.claimToken !== 'string' || !record.claimToken
      || !worker || record.workerDeviceId !== worker
      || typeof record.task !== 'string' || !record.task.trim()
      || Buffer.byteLength(record.task) > 24000) {
    throw new Error('Local Operator canary is not authorized for this claim.');
  }
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(endpoint)
      || Number(endpoint.split(':').at(-1)) > 65535
      || !model || model.length > 512 || model.trim() !== model) {
    throw new Error('Explicit loopback local model configuration required.');
  }
  return { endpoint, model };
}

async function runOperatorLocalCanary(record, { env = process.env, requestImpl = request } = {}) {
  const { endpoint, model } = localCanaryConfig(record, env);
  const payload = JSON.stringify({ model, messages: [{ role: 'user', content: record.task }],
    max_tokens: 256, temperature: 0, stream: false });
  return new Promise((resolve, reject) => {
    let timer;
    let req;
    const fail = () => {
      clearTimeout(timer);
      req?.destroy();
      reject(new Error('Local model did not return a complete canary response.'));
    };
    // Native HTTP to a literal loopback address: no proxy, redirects, tools,
    // remote fallback, credentials, or retries. Never echo provider errors.
    req = requestImpl(endpoint + '/v1/chat/completions', {
      method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, res => {
      if (res.statusCode !== 200) { res.destroy(); fail(); return; }
      const chunks = [];
      let bytes = 0;
      res.on('error', fail);
      res.on('aborted', fail);
      res.on('data', chunk => {
        bytes += chunk.length;
        if (bytes > MAX_BYTES) { res.destroy(); fail(); return; }
        chunks.push(chunk);
      });
      res.on('end', () => {
        clearTimeout(timer);
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          const choice = result.choices?.[0];
          if (bytes > MAX_BYTES || result.model !== model || result.choices?.length !== 1
              || choice?.finish_reason !== 'stop' || choice.message?.role !== 'assistant'
              || choice.message?.tool_calls || choice.message?.function_call
              || typeof choice.message?.content !== 'string' || !choice.message.content.trim()
              || choice.message.content.length > 24000) throw Error('invalid response');
          resolve({ ok: true, backend: 'local-canary', result: { stdout: choice.message.content } });
        } catch { fail(); }
      });
    });
    req.on('error', fail);
    timer = setTimeout(fail, DEADLINE_MS);
    req.end(payload);
  });
}

module.exports = { runOperatorLocalCanary, localCanaryConfig };
