import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifySignedSeaPayload } from '../auth/sea.js';
import { resolveOperatorDeveloperPolicy } from '../operator/developer-access.js';

const ID = /^[a-zA-Z0-9_-]{12,100}$/;
const digest = value => createHash('sha256').update(value).digest('hex');

function json(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  if (req.body) {
    if (Buffer.byteLength(JSON.stringify(req.body)) > 24000) throw new Error('large');
    return req.body;
  }
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 24000) throw new Error('large');
  }
  return JSON.parse(text || '{}');
}

export function openClawSshCommand(config = process.env, uid = process.getuid?.()) {
  const user = config.THREEDVR_OPENCLAW_SSH_USER || 'debian';
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(user)) throw new Error('Invalid SSH identity.');
  // The root Portal service uses the existing unprivileged mesh identity.
  // Never copy SSH keys or grant the browser a root connection.
  return uid === 0
    ? { command: '/usr/sbin/runuser', prefix: ['-u', user, '--', 'ssh'] }
    : { command: 'ssh', prefix: [] };
}

export async function runOpenClaw(request, options = {}) {
  const config = options.config || process.env;
  const script = await readFile(new URL('./remote.py', import.meta.url), 'utf8');
  const encoded = Buffer.from(JSON.stringify({ ...request, stream: Boolean(options.onDelta) })).toString('base64url');
  const host = config.THREEDVR_OPENCLAW_SSH_HOST || '3dvr-hetzner';
  // Only fixed code and base64url data cross the SSH shell; credentials stay on Hetzner.
  return new Promise((resolve, reject) => {
    const { command, prefix } = openClawSshCommand(config, options.uid ?? process.getuid?.());
    const child = (options.spawn || spawn)(command, [...prefix, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host,
      'python3', '-', encoded], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    let received = 0;
    let result;
    let invalid = false;
    const decoder = new StringDecoder('utf8');
    const consume = line => {
      if (!line.trim()) return;
      const data = JSON.parse(line);
      if (result !== undefined) throw new Error('extra output');
      if (data.type === 'delta' && typeof data.text === 'string') options.onDelta?.(data.text);
      else if (typeof data.ok === 'boolean') result = data;
      else throw new Error('invalid output');
    };
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('timeout')); }, 100000);
    child.stdout.on('data', chunk => {
      try {
        received += Buffer.byteLength(chunk);
        if (received > 400000) throw new Error('output limit');
        output += decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        let end;
        while ((end = output.indexOf('\n')) >= 0) {
          consume(output.slice(0, end));
          output = output.slice(end + 1);
        }
      } catch { invalid = true; child.kill('SIGTERM'); }
    });
    child.stderr.on('data', () => {});
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      try {
        if (code !== 0 || invalid) throw new Error('transport');
        consume(output + decoder.end());
        if (!result) throw new Error('missing result');
        resolve(result);
      } catch { reject(new Error('transport')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(script);
  });
}

export function createOpenClawHandler(options = {}) {
  const config = options.config || process.env;
  const verify = options.verify || verifySignedSeaPayload;
  const run = options.run || ((request, runOptions) => runOpenClaw(request, { ...options, ...runOptions }));
  const stateDir = resolve(config.THREEDVR_HELM_STATE_DIR || '/var/lib/3dvr-helm');
  let chatBusy = false;
  return async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use a signed POST request.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Invalid or oversized request.' }); }
    const { action, requestId, sessionId, message, createdAt, expiresAt } = body;
    if (!['status', 'chat'].includes(action) || !ID.test(requestId || '') || !ID.test(sessionId || '')
      || (action === 'chat' && (typeof message !== 'string' || !message.trim() || message.length > 6000))) {
      return json(res, 400, { error: 'Invalid Helm request.' });
    }
    const origin = req.headers?.origin || 'https://portal.3dvr.tech';
    const allowed = (config.THREEDVR_HELM_ALLOWED_ORIGINS || 'https://portal.3dvr.tech').split(',');
    if (!allowed.includes(origin)) return json(res, 403, { error: 'Portal origin is not allowed.' });
    const auth = await verify(body, { scope: 'openclaw-helm', expectedOrigin: origin, maxAgeMs: 120000 });
    if (!auth.ok) return json(res, 401, { error: 'Sign in to connect Helm to OpenClaw.' });
    const policy = resolveOperatorDeveloperPolicy(config);
    // Helm is Thomas's personal workspace, independent of broader Portal owner/admin grants.
    const helmOwnerPub = policy.ownerBindings.get('tmsteph@3dvr');
    if (!helmOwnerPub || auth.identity.pub !== helmOwnerPub) {
      return json(res, 403, { error: 'This OpenClaw workspace is private to tmsteph.' });
    }
    const signed = auth.verified;
    if (auth.identity.action !== action || signed.requestId !== requestId || signed.sessionId !== sessionId
      || (action === 'chat' && signed.message !== message)) {
      return json(res, 403, { error: 'Request does not match its signature.' });
    }
    const queued = [createdAt, expiresAt, signed.createdAt, signed.expiresAt].some(value => value !== undefined);
    if (action === 'chat' && queued) {
      if (createdAt !== signed.createdAt || expiresAt !== signed.expiresAt) {
        return json(res, 403, { error: 'Queue expiry does not match its signature.' });
      }
      const now = options.now ? options.now() : Date.now();
      if (!Number.isSafeInteger(createdAt) || !Number.isSafeInteger(expiresAt)
        || expiresAt <= createdAt || expiresAt - createdAt > 10 * 60 * 1000 || createdAt > now + 60000) {
        return json(res, 400, { error: 'Invalid queued-message expiry.' });
      }
      if (now >= expiresAt) return json(res, 410, { ok: false, stale: true, error: 'Message expired. Kept in history without sending.' });
    }
    const owner = digest(auth.identity.pub);
    const request = { action, session: `helm-${owner.slice(0, 24)}-${sessionId}`, message,
      ...(action === 'chat' && queued ? { expiresAt } : {}) };
    if (action === 'status') {
      const identity = { verified: true, username: 'tmsteph', alias: 'tmsteph@3dvr' };
      try { return json(res, 200, { ...await run(request), identity }); }
      catch { return json(res, 503, { ok: false, identity, error: 'Account verified, but the OpenClaw connection is unavailable. Try checking again.' }); }
    }
    // Delivery format does not change the signed task or its receipt fingerprint.
    const wantsStream = String(req.headers?.accept || '').includes('text/event-stream');
    let streaming = false;
    const beginStream = () => {
      if (streaming) return;
      streaming = true;
      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'private, no-store, no-transform');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();
    };
    const event = (name, data) => {
      if (res.destroyed || res.writableEnded) return;
      try { res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
    };
    const finish = (status, result) => {
      if (!wantsStream) return json(res, status, result);
      beginStream();
      event('result', result);
      res.end();
    };
    if (chatBusy) return json(res, 429, { error: 'OpenClaw is handling a Helm message. Wait for its result.' });
    chatBusy = true;
    let receipt;
    const fingerprint = digest(JSON.stringify(request));
    try {
      await mkdir(stateDir, { recursive: true, mode: 0o700 });
      receipt = join(stateDir, `${owner}-${requestId}.json`);
      try {
        await writeFile(receipt, JSON.stringify({ fingerprint, pending: true }), { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const prior = JSON.parse(await readFile(receipt, 'utf8'));
        if (prior.fingerprint !== fingerprint) return json(res, 409, { error: 'Request id already used for another message.' });
        if (prior.pending) return json(res, 409, { error: 'Delivery is uncertain. Check OpenClaw before sending this message again.' });
        return finish(200, prior.result);
      }
      if (wantsStream) beginStream();
      const result = await run(request, wantsStream ? { onDelta: text => event('delta', { text }) } : {});
      await writeFile(receipt, JSON.stringify({ fingerprint, result }), { mode: 0o600 });
      return finish(result.ok ? 200 : 503, result);
    } catch {
      const result = { ok: false, error: 'Connection interrupted. Delivery is uncertain; check OpenClaw before resending.' };
      return streaming ? finish(503, result) : json(res, 503, result);
    } finally { chatBusy = false; }
  };
}
