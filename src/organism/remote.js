import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function normalizeText(value = '', max = 4000) {
  return String(value || '').trim().slice(0, max);
}

function remoteOptions(options = {}) {
  return {
    sshHost: normalizeText(options.sshHost || process.env.THREEDVR_ORGANISM_SSH_HOST || '3dvr-ovh', 200),
    remoteScript: normalizeText(
      options.remoteScript
        || process.env.THREEDVR_ORGANISM_REMOTE_SCRIPT
        || '/home/debian/services/3dvr-portal-organism/apps/agent/thomas-agent/node/digital-organism-bridge.js',
      1000
    ),
    execImpl: options.execFileImpl || execFileAsync,
    timeoutMs: options.timeoutMs || 15000
  };
}

async function runBridge(args = [], options = {}) {
  const { sshHost, remoteScript, execImpl, timeoutMs } = remoteOptions(options);
  const { stdout } = await execImpl('ssh', [
    '-o', 'BatchMode=yes',
    '-o', 'ConnectTimeout=8',
    '-o', 'ServerAliveInterval=10',
    sshHost,
    'node', remoteScript, ...args
  ], {
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024
  });

  try {
    return JSON.parse(String(stdout || '').trim());
  } catch {
    throw new Error('OVH Digital Organism returned an invalid response.');
  }
}

export async function recallFromOvh(query, options = {}) {
  const text = normalizeText(query, 2000);
  if (!text) throw new Error('Question is required.');
  const limit = Math.min(10, Math.max(1, Number.parseInt(options.limit || '5', 10) || 5));
  const encoded = Buffer.from(text, 'utf8').toString('base64url');
  const parsed = await runBridge(['context', encoded, String(limit)], options);
  if (!parsed?.ok || !parsed.context) {
    throw new Error(parsed?.error || 'OVH Digital Organism recall failed.');
  }
  return parsed.context;
}

async function retrievalFeedbackOnOvh(query, memoryId, outcome, options = {}) {
  const text = normalizeText(query, 2000);
  const id = normalizeText(memoryId, 300);
  const normalizedOutcome = outcome === 'rejected' ? 'rejected' : 'approved';
  if (!text) throw new Error('Question is required.');
  if (!id) throw new Error('Memory id is required.');
  const encoded = Buffer.from(text, 'utf8').toString('base64url');
  const command = normalizedOutcome === 'rejected' ? 'reject' : 'approve';
  const parsed = await runBridge([command, encoded, id], options);
  if (!parsed?.ok || parsed.memoryId !== id || parsed.outcome !== normalizedOutcome) {
    throw new Error(parsed?.error || `OVH Digital Organism ${command} failed.`);
  }
  return {
    ok: true,
    memoryId: id,
    outcome: normalizedOutcome,
    duplicate: Boolean(parsed.duplicate)
  };
}

export async function approveRetrievalOnOvh(query, memoryId, options = {}) {
  return retrievalFeedbackOnOvh(query, memoryId, 'approved', options);
}

export async function rejectRetrievalOnOvh(query, memoryId, options = {}) {
  return retrievalFeedbackOnOvh(query, memoryId, 'rejected', options);
}
