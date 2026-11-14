// Secrets broker client for the agent core: resolves a secret value by
// alias over the broker's local Unix socket, the same protocol the
// apps/agent connectors use (POST /v1/resolve with a bearer agent token).
// The token is read from its file at call time and the value is returned
// to the caller in memory only: nothing here logs, stores, or prints a
// secret. The broker enforces per-alias policy, capability, and scope, so
// a denied resolve surfaces as an error the caller can show the user.
import { readFile } from 'node:fs/promises';
import http from 'node:http';

export const BROKER_DEFAULTS = Object.freeze({
  socketPath: '/run/3dvr-secrets-broker/broker.sock',
  tokenFile: '/home/debian/.3dvr/secrets/muse-broker.token',
  scope: 'secrets:3dvr-agent',
  purpose: 'agent-core',
  timeoutMs: 10000,
});

export function brokerConfig(config = process.env) {
  return {
    socketPath: config.THREEDVR_SECRETS_BROKER_SOCKET || BROKER_DEFAULTS.socketPath,
    tokenFile: config.THREEDVR_CORE_BROKER_TOKEN_FILE
      || config.THREEDVR_SECRETS_BROKER_TOKEN_FILE || BROKER_DEFAULTS.tokenFile,
    scope: config.THREEDVR_CORE_BROKER_SCOPE || BROKER_DEFAULTS.scope,
    purpose: config.THREEDVR_CORE_BROKER_PURPOSE || BROKER_DEFAULTS.purpose,
    timeoutMs: BROKER_DEFAULTS.timeoutMs,
  };
}

function brokerRequest(settings, token, pathName, payload, requestImpl) {
  if (requestImpl) return requestImpl({ ...settings, token, pathName, payload });
  return new Promise((resolvePromise, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request({
      socketPath: settings.socketPath,
      path: pathName,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        Authorization: `Bearer ${token}`,
      },
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed = {};
        try { parsed = raw ? JSON.parse(raw) : {}; } catch {}
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const reason = String(parsed?.reason || parsed?.decision || `status ${response.statusCode}`).slice(0, 300);
          reject(new Error(`Secrets broker request denied (${reason})`));
          return;
        }
        resolvePromise(parsed);
      });
    });
    request.setTimeout(settings.timeoutMs, () => {
      request.destroy(new Error('Secrets broker request timed out'));
    });
    request.on('error', reject);
    request.end(body);
  });
}

// Resolves one alias to its secret string. Throws with a human-readable
// reason on any failure (missing token file, broker down, policy denial);
// callers turn that into the user-visible error.
export async function resolveBrokerSecret(alias, { config = process.env, requestImpl, readFileImpl = readFile } = {}) {
  const settings = brokerConfig(config);
  let token;
  try {
    token = (await readFileImpl(settings.tokenFile, 'utf8')).trim();
  } catch {
    throw new Error(`broker agent token is not readable at ${settings.tokenFile}`);
  }
  if (!token) throw new Error('broker agent token file is empty');
  const result = await brokerRequest(settings, token, '/v1/resolve', {
    secret: alias,
    capability: 'secret.read',
    scope: settings.scope,
    purpose: settings.purpose,
  }, requestImpl);
  if (typeof result?.secret !== 'string' || !result.secret) {
    throw new Error('Secrets broker returned no secret value');
  }
  return result.secret;
}
