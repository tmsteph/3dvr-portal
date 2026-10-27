import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { verifySignedSeaPayload } from '../auth/sea.js';
import { resolveOperatorDeveloperPolicy } from '../operator/developer-access.js';
import { openClawSshCommand } from '../openclaw/handler.js';
import { buildOperatorDelegatedTask } from '../../operator/delegate-task.js';

// The existing managed SQLite worker is authoritative. No relay, new worker,
// credential copy, or historical queue replay is involved in this transport.
export const REMOTE_QUEUE_SCRIPT = `set -euo pipefail
if [ -f "$HOME/.3dvr/config/env" ]; then set -a; . "$HOME/.3dvr/config/env"; set +a; fi
export THREEDVR_AGENT_QUEUE_GUN_SYNC=0
cd "$HOME/.3dvr/portal/apps/agent"
/opt/node-v22/bin/node - "$1" <<'QUEUE_NODE'
const { DatabaseSync } = require('node:sqlite');
const { homedir } = require('node:os');
const { join } = require('node:path');
const input = JSON.parse(Buffer.from(process.argv[2], 'base64url').toString());
if (process.env.THREEDVR_AGENT_QUEUE_STORE !== 'sqlite' || process.env.THREEDVR_AGENT_OWNER_ALIAS !== '3dvr-managed') throw Error('Managed queue configuration mismatch');
const capabilities = (process.env.THREEDVR_AGENT_WORKER_CAPABILITIES || '').split(',');
if (!capabilities.includes('codex')) throw Error('Codex worker is not configured');
const db = new DatabaseSync(process.env.THREEDVR_AGENT_QUEUE_DB || join(homedir(), '.3dvr', 'task-queue.sqlite'));
db.exec('PRAGMA busy_timeout=5000');
try {
  db.exec('BEGIN IMMEDIATE');
  const owner = '3dvr-managed';
  let row = db.prepare('SELECT status,record_json,source FROM tasks WHERE owner_alias=? AND id=?').get(owner,input.id);
  // An imported/public legacy row must never impersonate a signed Operator
  // task, even when its ID and task text collide with a legitimate request.
  if (row && row.source !== 'operator-http') throw Error('Task identity conflict');
  if (input.action === 'enqueue') {
    if (row && JSON.parse(row.record_json).task !== input.record.task) throw Error('Task identity conflict');
    if (!row) {
      const count = db.prepare("SELECT count(*) AS n FROM tasks WHERE owner_alias=? AND id LIKE ? AND status IN ('queued','running')").get(owner,input.prefix+'%').n;
      if (count >= 5) throw Error('Five tasks are already pending; wait for a result');
      const record = input.record;
      db.prepare('INSERT INTO tasks (owner_alias,id,status,updated_at,record_json,source) VALUES (?,?,?,?,?,?)').run(owner,input.id,'queued',record.updatedAt,JSON.stringify(record),'operator-http');
      row = { status:'queued', record_json:JSON.stringify(record) };
    }
  }
  db.exec('COMMIT');
  if (!row) console.log(JSON.stringify({ok:false,missing:true,error:'Task not found.'}));
  else {
    const record = JSON.parse(row.record_json);
    console.log(JSON.stringify({ok:true,record:{id:input.id,status:row.status,createdAt:record.createdAt,startedAt:record.startedAt,updatedAt:record.updatedAt,resultSummary:record.resultSummary || '',resultText:String(record.resultText || '').slice(0,24000),resultSummaryTruncated:record.resultSummaryTruncated === true,resultTruncated:record.resultTruncated === true,error:record.error || '',workerDeviceId:record.workerDeviceId || ''}}));
  }
} finally { db.close(); }
QUEUE_NODE
`;

export function runManagedQueue(input, options = {}) {
  const config = options.config || process.env;
  const { command, prefix } = openClawSshCommand(config, options.uid ?? process.getuid?.());
  const encoded = Buffer.from(JSON.stringify(input)).toString('base64url');
  return new Promise((resolve, reject) => {
    const child = (options.spawn || spawn)(command, [...prefix, '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
      config.THREEDVR_OPERATOR_TASK_SSH_HOST || '3dvr-do', 'bash', '-s', '--', encoded], { stdio:['pipe','pipe','pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('Task service timed out.')); }, 20000);
    child.stdout.on('data', chunk => {
      output += chunk;
      if (Buffer.byteLength(output) > 256000) child.kill('SIGTERM');
    });
    child.stderr.on('data', () => {});
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      try {
        if (code !== 0 || Buffer.byteLength(output) > 256000) throw Error('transport');
        resolve(JSON.parse(output));
      } catch { reject(new Error('Task service unavailable.')); }
    });
    child.stdin.on('error', () => {});
    child.stdin.end(REMOTE_QUEUE_SCRIPT);
  });
}

export function createOperatorDispatchHandler(options = {}) {
  const config = options.config || process.env;
  const run = options.run || (input => runManagedQueue(input, options));
  const verify = options.verify || verifySignedSeaPayload;
  const reply = (res, status, value) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(JSON.stringify(value));
  };
  return async (req, res) => {
    if (req.method !== 'POST') return reply(res, 405, {ok:false,error:'Use a signed POST request.'});
    const body = req.body || {};
    if (Buffer.byteLength(JSON.stringify(body)) > 24000) return reply(res, 400, {ok:false,error:'Request too large.'});
    const {action, requestId, text, title} = body;
    if (!['enqueue','status'].includes(action) || !/^[a-zA-Z0-9_-]{12,100}$/.test(requestId || '')
      || (action === 'enqueue' && (typeof text !== 'string' || !text.trim() || text.length > 6000 || typeof title !== 'string' || title.length > 160))) {
      return reply(res, 400, {ok:false,error:'Invalid task request.'});
    }
    const origin = req.headers?.origin || '';
    if (!['https://portal.3dvr.tech','https://operator.3dvr.tech'].includes(origin)) return reply(res, 403, {ok:false,error:'Operator origin is not allowed.'});
    const auth = await verify(body, {scope:'operator-runtime-task',expectedOrigin:origin,maxAgeMs:120000});
    if (!auth.ok) return reply(res, 401, {ok:false,error:'Sign in again to send this task.'});
    if (auth.identity.pub !== resolveOperatorDeveloperPolicy(config).ownerBindings.get('tmsteph@3dvr')) {
      return reply(res, 403, {ok:false,error:'Task execution is private to tmsteph.'});
    }
    const signed = auth.verified;
    if (signed.action !== action || signed.requestId !== requestId
      || (action === 'enqueue' && (signed.text !== text || signed.title !== title))) {
      return reply(res, 403, {ok:false,error:'Task does not match its signature.'});
    }
    const prefix = `operator-http-${createHash('sha256').update(auth.identity.pub).digest('hex').slice(0,24)}-`;
    const id = prefix + requestId;
    const input = {action,id,prefix};
    if (action === 'enqueue') {
      const built = buildOperatorDelegatedTask({text,title}, {id,tenantAlias:'operator-owner'});
      input.record = {...built.record, backend:'codex', requiredCapabilities:'codex', unsafe:false};
    }
    try {
      const result = await run(input);
      return reply(res, result.ok ? action === 'enqueue' ? 202 : 200 : result.missing ? 404 : 503, {...result,requestId});
    } catch {
      return reply(res, 503, {ok:false,requestId,error:'Task delivery is not confirmed. Check this task before submitting it again.'});
    }
  };
}
