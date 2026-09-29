#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const DEFAULTS = Object.freeze({
  homeserver: 'https://gitter.ems.host',
  roomAlias: '#amark_gun:gitter.im',
  roomId: '!apmkrFyPwFRRvQgtEw:gitter.im',
  secretKey: 'MATRIX_GITTER_TMSTEPH',
  stateFile: '/var/lib/3dvr-mark-chat-tracker/state.json',
  noteFile: '/home/debian/.local/share/3dvr/knowledge/mark-nadal/gun-chat.md',
  maxMessages: 300,
  maxNoteBytes: 112 * 1024,
});

function clean(value, max = 4000) {
  return String(value == null ? '' : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function atomicWrite(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, value, { mode });
  fs.renameSync(temp, file);
  fs.chmodSync(file, mode);
}

export function buildFilter(roomId) {
  return {
    presence: { types: [] },
    account_data: { types: [] },
    room: {
      rooms: [roomId],
      state: { types: [] },
      ephemeral: { types: [] },
      account_data: { types: [] },
      timeline: { limit: 100, types: ['m.room.message'] },
    },
  };
}

export function eventsFromSync(payload, roomId) {
  const events = payload?.rooms?.join?.[roomId]?.timeline?.events;
  if (!Array.isArray(events)) return [];
  return events
    .filter(event => event?.type === 'm.room.message' && event?.event_id)
    .map(event => ({
      id: clean(event.event_id, 500),
      sender: clean(event.sender, 500),
      ts: Number(event.origin_server_ts) || 0,
      msgtype: clean(event.content?.msgtype, 100),
      body: clean(event.content?.body, 8000),
    }))
    .filter(event => event.body);
}

function markdownBody(body = '') {
  return clean(body, 8000)
    .split('\n')
    .map(line => `    ${line}`)
    .join('\n');
}

export function renderTranscript({ messages = [], roomAlias = DEFAULTS.roomAlias, roomId = DEFAULTS.roomId, updatedAt = new Date().toISOString() } = {}) {
  const ordered = [...messages].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  const sections = ordered.map(item => {
    const when = item.ts ? new Date(item.ts).toISOString() : 'unknown time';
    return `### ${when} — ${clean(item.sender, 500) || 'unknown sender'}\n\n${markdownBody(item.body)}`;
  });
  return [
    '# Mark Nadal / GUN chat tracker',
    '',
    `Updated: ${updatedAt}`,
    `Source: ${roomAlias}`,
    `Room ID: ${roomId}`,
    'Storage: private 3DVR knowledge on OVH',
    '',
    'This is a server-side rolling transcript of recent public GUN room messages. The Matrix credential is stored separately in OpenBao.',
    '',
    '## Recent messages',
    '',
    sections.length ? sections.join('\n\n') : 'No messages have been captured yet.',
    '',
  ].join('\n');
}

export function fitTranscript(messages, options = {}) {
  const maxBytes = Number(options.maxNoteBytes) || DEFAULTS.maxNoteBytes;
  const ordered = [...messages].sort((a, b) => (b.ts || 0) - (a.ts || 0));
  let kept = ordered.slice(0, Number(options.maxMessages) || DEFAULTS.maxMessages);
  while (kept.length > 1) {
    const rendered = renderTranscript({
      messages: kept,
      roomAlias: options.roomAlias || DEFAULTS.roomAlias,
      roomId: options.roomId || DEFAULTS.roomId,
      updatedAt: options.updatedAt,
    });
    if (Buffer.byteLength(rendered, 'utf8') <= maxBytes) return kept;
    kept.pop();
  }
  return kept;
}

async function requestJson(url, { method = 'GET', token = '', body, timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const raw = await response.text();
    let payload = {};
    if (raw) {
      try { payload = JSON.parse(raw); } catch {}
    }
    if (!response.ok) {
      const error = new Error(clean(payload?.error || `HTTP ${response.status}`, 500));
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

async function refreshCredential(creds, backend, config) {
  if (!creds.refreshToken) throw new Error('Matrix access expired and no refresh token is available');
  const refreshed = await requestJson(`${creds.homeserver}/_matrix/client/v3/refresh`, {
    method: 'POST',
    body: { refresh_token: creds.refreshToken },
  });
  const next = {
    ...creds,
    accessToken: clean(refreshed.access_token, 20000),
    refreshToken: clean(refreshed.refresh_token || creds.refreshToken, 20000),
    expiresInMs: Number(refreshed.expires_in_ms) || 0,
    refreshedAt: Date.now(),
  };
  backend.create({ key: config.secretKey, value: JSON.stringify(next) });
  return next;
}

async function ensureRoom(creds, backend, config) {
  if (creds.roomId) return creds;
  const joined = await requestJson(`${creds.homeserver}/_matrix/client/v3/join/${encodeURIComponent(config.roomAlias)}`, {
    method: 'POST',
    token: creds.accessToken,
    body: {},
  });
  const next = { ...creds, roomId: clean(joined.room_id, 500) || config.roomId };
  backend.create({ key: config.secretKey, value: JSON.stringify(next) });
  return next;
}

function readState(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function run(options = {}) {
  const config = { ...DEFAULTS, ...options };
  const require = createRequire(import.meta.url);
  const { OpenBaoBackend } = require('/opt/3dvr/secrets-broker/openbao.js');
  const backend = new OpenBaoBackend();
  const raw = backend.get({ key: config.secretKey });
  let creds;
  try { creds = JSON.parse(raw); } catch { throw new Error('Stored Matrix credential is invalid JSON'); }
  creds.homeserver = clean(creds.homeserver, 2000) || config.homeserver;
  if (!creds.accessToken) throw new Error('Stored Matrix credential has no access token');

  creds = await ensureRoom(creds, backend, config);
  const roomId = clean(creds.roomId, 500) || config.roomId;
  const state = readState(config.stateFile);
  const filter = encodeURIComponent(JSON.stringify(buildFilter(roomId)));
  const since = clean(state.nextBatch, 2000);
  const url = `${creds.homeserver}/_matrix/client/v3/sync?timeout=0&filter=${filter}${since ? `&since=${encodeURIComponent(since)}` : ''}`;

  let payload;
  try {
    payload = await requestJson(url, { token: creds.accessToken });
  } catch (error) {
    if (error.status !== 401) throw error;
    creds = await refreshCredential(creds, backend, config);
    payload = await requestJson(url, { token: creds.accessToken });
  }

  const incoming = eventsFromSync(payload, roomId);
  const prior = Array.isArray(state.messages) ? state.messages : [];
  const byId = new Map(prior.map(item => [item.id, item]));
  for (const event of incoming) byId.set(event.id, event);
  const updatedAt = new Date().toISOString();
  const messages = fitTranscript([...byId.values()], {
    maxMessages: config.maxMessages,
    maxNoteBytes: config.maxNoteBytes,
    roomAlias: config.roomAlias,
    roomId,
    updatedAt,
  });

  const nextState = {
    roomId,
    roomAlias: config.roomAlias,
    nextBatch: clean(payload.next_batch, 2000) || since,
    updatedAt,
    messages,
  };
  atomicWrite(config.stateFile, JSON.stringify(nextState, null, 2) + '\n', 0o600);
  atomicWrite(config.noteFile, renderTranscript({ messages, roomAlias: config.roomAlias, roomId, updatedAt }), 0o644);
  process.stdout.write(JSON.stringify({ ok: true, newMessages: incoming.length, totalMessages: messages.length, updatedAt }) + '\n');
}

export async function main() {
  try {
    await run();
  } catch (error) {
    const message = clean(error?.message || error, 500);
    if (/OpenBao secret value is missing|Matrix credential/i.test(message)) {
      process.stdout.write(JSON.stringify({ ok: false, waitingForConnection: true, error: message }) + '\n');
      return;
    }
    console.error(JSON.stringify({ ok: false, error: message }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
