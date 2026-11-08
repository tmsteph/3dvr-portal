import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { verifySignedSeaPayload } from '../auth/sea.js';
import { resolveOperatorDeveloperPolicy } from '../operator/developer-access.js';
import { resolveCharacterPersona } from './characters.js';
import { runCharacterChat as runCharacterChatOpenAi } from './character-chat.js';

const ID = /^[a-zA-Z0-9_-]{12,100}$/;
const digest = value => createHash('sha256').update(value).digest('hex');
// Character chat history: the client's own recent turns, resent with each
// signed request because the OpenAI runner is stateless. Only plain
// user/assistant turns are allowed, so a client can never smuggle in a
// second system prompt; the persona still comes only from the registry.
const HISTORY_LIMIT = 20;
function validHistory(history) {
  return Array.isArray(history) && history.length <= HISTORY_LIMIT && history.every(entry =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
    && Object.keys(entry).sort().join(',') === 'content,role'
    && (entry.role === 'user' || entry.role === 'assistant')
    && typeof entry.content === 'string' && entry.content.length > 0 && entry.content.length <= 6000);
}
const canonicalHistory = history => JSON.stringify((history || []).map(entry => [entry.role, entry.content]));

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

export function helmQueueEnabled(config = process.env) {
  // Server-side Helm queue (helm-queue-design-2026-11-06). Default off:
  // chat keeps the execute-or-429 behavior below, byte for byte. Setting
  // HELM_QUEUE=1 in the Portal service environment turns chat submissions
  // into durable queue records that a dispatcher drains per session; the
  // flag is the whole rollback, and no other behavior moves with it.
  const raw = config.HELM_QUEUE;
  if (raw === undefined) return false;
  return ['1', 'true', 'on', 'yes'].includes(String(raw).trim().toLowerCase());
}

export function helmConcurrency(config = process.env) {
  // Gateway turns the queue dispatcher may present at once. This must be
  // set in lockstep with the gateway's agents.defaults.maxConcurrent:
  // raising the dispatcher alone strands turns waiting inside the gateway
  // (measured in step 0 of the queue design: excess runs wait, they do
  // not error), and raising the gateway alone changes nothing while the
  // bridge serializes. Default 1, so enabling the queue never presents
  // concurrency the gateway has not been configured for.
  const parsed = Number.parseInt(config.HELM_CONCURRENCY, 10);
  if (!Number.isSafeInteger(parsed)) return 1;
  return Math.min(4, Math.max(1, parsed));
}

export function helmCodexToolsEnabled(config = process.env) {
  // Kill switch for the Native Codex agent posture. Default on for the owner
  // engine; an explicit off value returns Helm's Codex sessions to the
  // chat-only pilot with no deploy: set HELM_CODEX_TOOLS in the Portal
  // service environment and restart the service.
  const raw = config.HELM_CODEX_TOOLS;
  if (raw === undefined) return true;
  return !['0', 'false', 'off', 'no'].includes(String(raw).trim().toLowerCase());
}

export async function runOpenClaw(request, options = {}) {
  const config = options.config || process.env;
  const backup = request.engine === 'codex-backup';
  const native = backup || request.engine === 'codex';
  const script = await readFile(new URL(native ? './native.py' : './remote.py', import.meta.url), 'utf8');
  const encoded = Buffer.from(JSON.stringify({ ...request, stream: Boolean(options.onDelta) })).toString('base64url');
  // The native bridge (the Codex engines, which run native.py) can be
  // routed independently of the OpenClaw gateway: THREEDVR_NATIVE_SSH_HOST
  // names its SSH target when set. When it is unset, routing is exactly
  // the legacy behavior per engine, so setting it is the only change.
  const nativeHost = config.THREEDVR_NATIVE_SSH_HOST;
  const host = backup
    ? nativeHost || '3dvr-do'
    : native && nativeHost
      ? nativeHost
      : config.THREEDVR_OPENCLAW_SSH_HOST || '3dvr-hetzner';
  // The emergency node runs one bounded chat process, never another gateway.
  const remote = backup
    ? ['systemd-run', '--quiet', '--pipe', '--wait', '--collect', `--unit=3dvr-helm-backup-${randomUUID()}`,
      '-p', 'MemoryMax=134217728', '-p', 'CPUQuota=50%', '-p', 'TasksMax=64', '-p', 'RuntimeMaxSec=95s', 'python3', '-', encoded]
    : ['python3', '-', encoded];
  // Only fixed code and base64url data cross SSH; credentials stay on their existing host.
  return new Promise((resolve, reject) => {
    const { command, prefix } = openClawSshCommand(config, options.uid ?? process.getuid?.());
    const child = (options.spawn || spawn)(command, [...prefix, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', host,
      ...remote], { stdio: ['pipe', 'pipe', 'pipe'] });
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
      else if (data.type === 'activity' && typeof data.text === 'string') options.onActivity?.(data.text);
      else if (typeof data.ok === 'boolean') result = data;
      else throw new Error('invalid output');
    };
    // Agent turns run tests and git operations, so a tools-enabled Codex
    // request gets a longer transport window than a chat reply. The queue
    // dispatcher overrides this for gateway turns so the bridge never
    // abandons a turn the gateway (180 s budget) is still working on.
    const timeoutMs = options.timeoutMs ?? (request.engine === 'codex' && request.toolsEnabled ? 295000 : 100000);
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('timeout')); }, timeoutMs);
    child.stdout.on('data', chunk => {
      try {
        received += Buffer.byteLength(chunk);
        if (received > 8 * 1024 * 1024) throw new Error('output limit');
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
  const runCharacter = options.runCharacterChat
    || ((request, runOptions) => runCharacterChatOpenAi(request, { config, fetchImpl: options.fetchImpl, ...runOptions }));
  const stateDir = resolve(config.THREEDVR_HELM_STATE_DIR || '/var/lib/3dvr-helm');
  let chatBusy = false;

  // --- Durable server-side queue (only used when HELM_QUEUE is on) ---
  // The queue record is the receipt file, extended with a status and a
  // server sequence number. Lanes are per session (strict FIFO, one turn
  // in flight per session, forever, so transcript order never depends on
  // gateway behavior); pools are per engine, so a long Codex turn can no
  // longer block a Helm chat and character chats stop queueing behind
  // gateway work they never use. See helm-queue-design-2026-11-06.
  const queueEnabled = helmQueueEnabled(config);
  const GATEWAY_TURN_TIMEOUT_MS = 220000;
  const LANE_DEPTH_CAP = 20;
  const GLOBAL_QUEUED_CAP = 100;
  const UNCERTAIN_RESULT = { ok: false, error: 'Connection interrupted. Delivery is uncertain; check History before resending.' };
  const STALE_RESULT = { ok: false, stale: true, error: 'Message expired before dispatch. Kept in history without sending.' };
  const queue = {
    ready: null,
    seq: 0,
    records: new Map(),
    lanes: new Map(),
    pools: {
      gateway: { cap: helmConcurrency(config), running: new Set() },
      character: { cap: 1, running: new Set() },
      native: { cap: 1, running: new Set() }
    }
  };
  const laneFor = (laneKey, poolName) => {
    let lane = queue.lanes.get(laneKey);
    if (!lane) { lane = { pool: poolName, queue: [], running: null }; queue.lanes.set(laneKey, lane); }
    return lane;
  };
  async function persistRecord(record) {
    const stored = { fingerprint: record.fingerprint, status: record.status, queueSeq: record.queueSeq,
      pool: record.pool, request: record.request,
      ...(record.startedAt ? { startedAt: record.startedAt } : {}),
      ...(record.status === 'running' && record.previewUpdatedAt
        ? { previewText: record.previewText || '', previewActivity: record.previewActivity ?? null,
          previewUpdatedAt: record.previewUpdatedAt } : {}),
      ...(record.personaId ? { personaId: record.personaId } : {}),
      ...(record.history ? { history: record.history } : {}),
      ...(record.result ? { result: record.result } : {}) };
    const temp = `${record.path}.tmp-${randomUUID()}`;
    await writeFile(temp, JSON.stringify(stored), { mode: 0o600 });
    await rename(temp, record.path);
  }
  function admitStored(stored, path) {
    const record = { path, fingerprint: stored.fingerprint, status: 'queued', queueSeq: stored.queueSeq,
      pool: stored.pool, laneKey: `${stored.pool}|${stored.request.session}`, request: stored.request,
      personaId: stored.personaId, history: stored.history, waiter: null };
    queue.records.set(path, record);
    const lane = laneFor(record.laneKey, record.pool);
    lane.queue.push(record);
    lane.queue.sort((a, b) => a.queueSeq - b.queueSeq);
    return record;
  }
  async function scanQueue() {
    try {
      await mkdir(stateDir, { recursive: true, mode: 0o700 });
      let names = [];
      try { names = await readdir(stateDir); } catch { names = []; }
      for (const name of names) {
        if (!name.endsWith('.json')) continue;
        const path = join(stateDir, name);
        let stored;
        try { stored = JSON.parse(await readFile(path, 'utf8')); } catch { continue; }
        if (!stored || typeof stored !== 'object') continue;
        if (typeof stored.queueSeq === 'number') queue.seq = Math.max(queue.seq, stored.queueSeq);
        if (!stored.status) continue; // Legacy receipt; read on demand by the poll path.
        if (stored.status === 'running') {
          // A turn was in flight when the process stopped: exactly the
          // interrupted-delivery semantics the pending receipt always had.
          stored.status = 'uncertain';
          stored.result = UNCERTAIN_RESULT;
          delete stored.previewText; delete stored.previewActivity; delete stored.previewUpdatedAt;
          try {
            const temp = `${path}.tmp-${randomUUID()}`;
            await writeFile(temp, JSON.stringify(stored), { mode: 0o600 });
            await rename(temp, path);
          } catch {}
        } else if (stored.status === 'queued' && stored.request && stored.pool) {
          admitStored(stored, path);
        }
      }
    } catch {}
    pumpQueue();
  }
  const previewOf = record => record.status === 'running'
    ? { text: record.previewText || '', activity: record.previewActivity ?? null,
      startedAt: record.startedAt ?? null, updatedAt: record.previewUpdatedAt ?? null }
    : null;
  function positionOf(record) {
    if (record.status === 'running') return 0;
    // Turns that will run before this one: everything running in the
    // pool, this lane's predecessors, and the head of each other lane
    // whose first submission is older (round-robin by oldest head).
    const pool = queue.pools[record.pool];
    let ahead = pool.running.size;
    const lane = queue.lanes.get(record.laneKey);
    if (lane) ahead += Math.max(0, lane.queue.indexOf(record));
    for (const other of queue.lanes.values()) {
      if (other === lane || other.pool !== record.pool || !other.queue.length) continue;
      if (other.queue[0].queueSeq < record.queueSeq) ahead += 1;
    }
    return ahead;
  }
  async function executeRecord(record) {
    const nowMs = options.now ? options.now() : Date.now();
    if (record.request.expiresAt !== undefined && nowMs >= record.request.expiresAt) {
      return { status: 'stale', result: STALE_RESULT };
    }
    try {
      // Preview capture: a turn's progress belongs on its durable
      // record, not only on a live waiter's connection. The original
      // wiring forwarded deltas solely to a held submitter, so the
      // moment a client fell back to polling (a queued turn, a slow
      // turn past the held request's lifetime, a page reload), every
      // fragment the engines streamed was dropped and the chat showed
      // nothing until the final reply landed. Now deltas and activity
      // lines also accumulate into a rolling preview on the record,
      // persisted at most about once a second; terminal persists omit
      // the preview fields, so the preview clears itself when the
      // receipt resolves. The waiter still receives everything live.
      let lastPreviewPersist = 0;
      let previewTimer = null;
      const notePreview = () => {
        record.previewUpdatedAt = (options.now ? options.now() : Date.now());
        const wait = 1000 - (record.previewUpdatedAt - lastPreviewPersist);
        if (wait <= 0) {
          lastPreviewPersist = record.previewUpdatedAt;
          void persistRecord(record).catch(() => {});
        } else if (!previewTimer) {
          previewTimer = setTimeout(() => {
            previewTimer = null;
            lastPreviewPersist = options.now ? options.now() : Date.now();
            void persistRecord(record).catch(() => {});
          }, wait);
          previewTimer.unref?.();
        }
      };
      const onDelta = text => {
        record.waiter?.onDelta?.(text);
        record.previewText = ((record.previewText || '') + text).slice(-4096);
        notePreview();
      };
      const onActivity = text => {
        record.waiter?.onActivity?.(text);
        if (record.previewActivity !== text) { record.previewActivity = text; notePreview(); }
      };
      const runOptions = { onDelta, onActivity };
      try {
      if (record.personaId) {
        const persona = resolveCharacterPersona(record.personaId);
        if (!persona) return { status: 'uncertain', result: UNCERTAIN_RESULT };
        const result = await runCharacter(
          { persona, message: record.request.message, history: record.history || [], session: record.request.session },
          runOptions);
        return { status: result && result.stale ? 'stale' : 'completed', result };
      }
      // The queued marker is added only to the execution copy, never to
      // the fingerprinted request: remote.py answers it with a
      // per-session lock and a 200 s gateway budget instead of the
      // global lock and 85 s, so a queued turn is never abandoned by
      // its caller while the gateway is still working on it.
      const bridgeRequest = record.pool === 'gateway' ? { ...record.request, queued: true } : record.request;
      const result = await run(bridgeRequest,
        record.pool === 'gateway' ? { ...runOptions, timeoutMs: GATEWAY_TURN_TIMEOUT_MS } : runOptions);
      return { status: result && result.stale ? 'stale' : 'completed', result };
      } finally {
        if (previewTimer) { clearTimeout(previewTimer); previewTimer = null; }
      }
    } catch {
      return { status: 'uncertain', result: UNCERTAIN_RESULT };
    }
  }
  function startRun(lane, pool) {
    const record = lane.queue.shift();
    lane.running = record;
    pool.running.add(record);
    record.status = 'running';
    record.startedAt = options.now ? options.now() : Date.now();
    record.previewText = '';
    record.previewActivity = null;
    record.previewUpdatedAt = null;
    void persistRecord(record).catch(() => {});
    void executeRecord(record).then(async outcome => {
      record.status = outcome.status;
      record.result = outcome.result;
      lane.running = null;
      pool.running.delete(record);
      try { await persistRecord(record); } catch {}
      const waiter = record.waiter;
      record.waiter = null;
      waiter?.resolve(outcome);
      pumpQueue();
    });
  }
  function pumpQueue() {
    for (const [poolName, pool] of Object.entries(queue.pools)) {
      while (pool.running.size < pool.cap) {
        let best = null;
        for (const lane of queue.lanes.values()) {
          if (lane.pool !== poolName || lane.running || !lane.queue.length) continue;
          if (!best || lane.queue[0].queueSeq < best.queue[0].queueSeq) best = lane;
        }
        if (!best) break;
        startRun(best, pool);
      }
    }
  }
  return async (req, res) => {
    if (req.method !== 'POST') return json(res, 405, { error: 'Use a signed POST request.' });
    let body;
    try { body = await readBody(req); } catch { return json(res, 400, { error: 'Invalid or oversized request.' }); }
    const { action, requestId, sessionId, message, createdAt, expiresAt, characterId, history } = body;
    const engine = body.engine ?? 'openclaw';
    if (!['openclaw', 'codex', 'codex-backup'].includes(engine) || !['status', 'chat'].includes(action) || !ID.test(requestId || '') || !ID.test(sessionId || '')
      || (action === 'chat' && (typeof message !== 'string' || !message.trim() || message.length > 6000))) {
      return json(res, 400, { error: 'Invalid Helm request.' });
    }
    // Character chat rides the same signed envelope as Helm: a signed
    // characterId names a persona the server holds (see characters.js),
    // and the owner gate, session naming, and receipts below are shared.
    // Only the execution differs: character turns run on the OpenAI API
    // (character-chat.js), never through the OpenClaw gateway. The wire
    // engine label stays 'openclaw' so the signed envelope v1 clients
    // already hold keeps verifying; it names the envelope, not the engine.
    // Personas never apply to status checks or the Codex engines.
    if (characterId !== undefined && (typeof characterId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(characterId)
      || action !== 'chat' || engine !== 'openclaw')) {
      return json(res, 400, { error: 'Invalid character chat request.' });
    }
    if (history !== undefined && (!characterId || !validHistory(history))) {
      return json(res, 400, { error: 'Invalid character chat history.' });
    }
    const origin = req.headers?.origin || 'https://portal.3dvr.tech';
    const allowed = (config.THREEDVR_HELM_ALLOWED_ORIGINS || 'https://portal.3dvr.tech,https://operator.3dvr.tech,https://helm.3dvr.tech,https://ladies.3dvr.tech').split(',').map(value => value.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return json(res, 403, { error: 'Portal origin is not allowed.' });
    const auth = await verify(body, { scope: 'openclaw-helm', expectedOrigin: origin, maxAgeMs: 120000 });
    if (!auth.ok) return json(res, 401, { error: 'Sign in to connect Helm to your agent.' });
    const policy = resolveOperatorDeveloperPolicy(config);
    // Helm is Thomas's personal workspace, independent of broader Portal owner/admin grants.
    const helmOwnerPub = policy.ownerBindings.get('tmsteph@3dvr');
    if (!helmOwnerPub || auth.identity.pub !== helmOwnerPub) {
      return json(res, 403, { error: 'This Helm workspace is private to tmsteph.' });
    }
    const signed = auth.verified;
    if (auth.identity.action !== action || signed.requestId !== requestId || signed.sessionId !== sessionId
      || (signed.engine ?? 'openclaw') !== engine
      || (signed.characterId || undefined) !== (characterId || undefined)
      || (action === 'chat' && signed.message !== message)
      || canonicalHistory(signed.history) !== canonicalHistory(history)) {
      return json(res, 403, { error: 'Request does not match its signature.' });
    }
    const persona = characterId ? resolveCharacterPersona(characterId) : null;
    if (characterId && !persona) return json(res, 400, { error: 'Unknown character.' });
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
    const request = { action, ...(engine !== 'openclaw' ? { engine } : {}),
      ...(engine === 'codex' ? { toolsEnabled: helmCodexToolsEnabled(config) } : {}),
      session: characterId
        ? `girl-${characterId}-${owner.slice(0, 24)}-${sessionId}`
        : `helm-${owner.slice(0, 24)}-${sessionId}`,
      message,
      ...(persona ? { system: persona.system } : {}),
      ...(action === 'chat' && queued ? { expiresAt } : {}) };
    if (action === 'status') {
      const identity = { verified: true, username: 'tmsteph', alias: 'tmsteph@3dvr' };
      try { return json(res, 200, { ...await run(request), identity }); }
      catch { return json(res, 503, { ok: false, identity, error: 'Account verified, but the selected engine is unavailable. Try checking again.' }); }
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
    const fingerprint = digest(JSON.stringify(persona ? { ...request, history: history || [] } : request));
    if (!queueEnabled) {
    if (chatBusy) return json(res, 429, { error: 'Helm is handling a message. Wait for its result.' });
    chatBusy = true;
    let receipt;
    try {
      await mkdir(stateDir, { recursive: true, mode: 0o700 });
      receipt = join(stateDir, `${owner}-${requestId}.json`);
      try {
        await writeFile(receipt, JSON.stringify({ fingerprint, pending: true }), { flag: 'wx', mode: 0o600 });
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        const prior = JSON.parse(await readFile(receipt, 'utf8'));
        if (prior.fingerprint !== fingerprint) return json(res, 409, { error: 'Request id already used for another message.' });
        if (prior.pending) return json(res, 409, { error: 'Delivery is uncertain. Check History before sending this message again.' });
        return finish(200, prior.result);
      }
      if (wantsStream) beginStream();
      const runOptions = wantsStream ? { onDelta: text => event('delta', { text }) } : {};
      const result = persona
        ? await runCharacter({ persona, message, history: history || [], session: request.session }, runOptions)
        : await run(request, runOptions);
      await writeFile(receipt, JSON.stringify({ fingerprint, result }), { mode: 0o600 });
      return finish(result.ok ? 200 : 503, result);
    } catch {
      const result = { ok: false, error: 'Connection interrupted. Delivery is uncertain; check History before resending.' };
      return streaming ? finish(503, result) : json(res, 503, result);
    } finally { chatBusy = false; }
    }

    // --- Queued chat path (HELM_QUEUE on) ---
    // A submission becomes a durable queue record and the dispatcher
    // drains it. A submitter whose turn dispatches at once simply waits
    // for its result, exactly like the direct path (streaming included).
    // A submitter whose turn must wait gets 202 + queue position, but
    // only when it signed the queue envelope (createdAt/expiresAt): the
    // Helm outbox polls by resubmitting the same signed request, which
    // the receipt fingerprint makes a safe replay. Callers without the
    // envelope (character pages) hold the request open instead, so their
    // contract never changes.
    if (!queue.ready) queue.ready = scanQueue();
    await queue.ready;
    const receiptPath = join(stateDir, `${owner}-${requestId}.json`);
    let record = queue.records.get(receiptPath);
    if (!record) {
      let stored = null;
      try { stored = JSON.parse(await readFile(receiptPath, 'utf8')); } catch {}
      if (stored) {
        if (stored.fingerprint !== fingerprint) return json(res, 409, { error: 'Request id already used for another message.' });
        if (stored.status === 'completed') return finish(200, stored.result);
        if (stored.status === 'stale') return json(res, 410, stored.result);
        if (stored.status === 'uncertain' || stored.pending) {
          return json(res, 409, { error: 'Delivery is uncertain. Check History before sending this message again.' });
        }
        if (stored.status === 'queued' && stored.request && stored.pool) {
          record = admitStored(stored, receiptPath);
          pumpQueue();
        } else if (stored.result) return finish(200, stored.result);
        else return json(res, 409, { error: 'Delivery is uncertain. Check History before sending this message again.' });
      }
    }
    if (record) {
      if (record.fingerprint !== fingerprint) return json(res, 409, { error: 'Request id already used for another message.' });
      if (record.status === 'completed') return finish(200, record.result);
      if (record.status === 'stale') return json(res, 410, record.result);
      if (record.status === 'uncertain') {
        return json(res, 409, { error: 'Delivery is uncertain. Check History before sending this message again.' });
      }
      if (record.status === 'queued' && request.expiresAt !== undefined
        && (options.now ? options.now() : Date.now()) >= request.expiresAt) {
        const lane = queue.lanes.get(record.laneKey);
        if (lane) { const at = lane.queue.indexOf(record); if (at >= 0) lane.queue.splice(at, 1); }
        record.status = 'stale';
        record.result = STALE_RESULT;
        try { await persistRecord(record); } catch {}
        queue.records.delete(receiptPath);
        pumpQueue();
        return json(res, 410, STALE_RESULT);
      }
      return json(res, 202, { queued: true, status: record.status, position: positionOf(record), requestId, preview: previewOf(record) });
    }
    const poolName = persona ? 'character' : engine !== 'openclaw' ? 'native' : 'gateway';
    const laneKey = `${poolName}|${request.session}`;
    const lane = laneFor(laneKey, poolName);
    if (lane.queue.length + (lane.running ? 1 : 0) >= LANE_DEPTH_CAP) {
      return json(res, 429, { error: 'This conversation has too many messages waiting. Wait for its results.' });
    }
    let queuedTotal = 0;
    for (const live of queue.records.values()) if (live.status === 'queued') queuedTotal++;
    if (queuedTotal >= GLOBAL_QUEUED_CAP) {
      return json(res, 429, { error: 'Helm queue is full. Wait a moment and retry.' });
    }
    record = { path: receiptPath, fingerprint, status: 'queued', queueSeq: ++queue.seq, pool: poolName,
      laneKey, request, personaId: characterId || undefined, history: history || undefined, waiter: null };
    queue.records.set(receiptPath, record);
    lane.queue.push(record);
    try { await persistRecord(record); } catch {
      queue.records.delete(receiptPath);
      lane.queue.pop();
      return json(res, 503, { ok: false, error: 'Helm could not record this message. Nothing was sent; try again.' });
    }
    let waiterOutcome = null;
    const waiterDone = new Promise(resolveWaiter => {
      record.waiter = { resolve: outcome => { waiterOutcome = outcome; resolveWaiter(outcome); },
        onDelta: wantsStream ? text => { beginStream(); event('delta', { text }); } : undefined,
        onActivity: wantsStream ? text => { beginStream(); event('activity', { text }); } : undefined };
    });
    pumpQueue();
    if (record.status === 'running' || waiterOutcome) {
      const outcome = waiterOutcome || await waiterDone;
      if (outcome.status === 'stale') return json(res, 410, outcome.result);
      if (outcome.status === 'uncertain') return json(res, 503, outcome.result);
      return finish(outcome.result.ok ? 200 : 503, outcome.result);
    }
    record.waiter = null;
    if (!queued) {
      // No queue envelope: hold the request open until the turn resolves
      // rather than teaching a new response shape to a caller that
      // cannot poll. The receipt still makes the outcome durable.
      const outcome = await new Promise(resolveWaiter => {
        record.waiter = { resolve: resolveWaiter,
          onDelta: wantsStream ? text => { beginStream(); event('delta', { text }); } : undefined,
          onActivity: wantsStream ? text => { beginStream(); event('activity', { text }); } : undefined };
      });
      if (outcome.status === 'stale') return json(res, 410, outcome.result);
      if (outcome.status === 'uncertain') return json(res, 503, outcome.result);
      return finish(outcome.result.ok ? 200 : 503, outcome.result);
    }
    return json(res, 202, { queued: true, status: record.status, position: positionOf(record), requestId, preview: previewOf(record) });
  };
}
