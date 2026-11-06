// Character chat client: the same signed envelope Helm uses
// (POST /api/openclaw, scope 'openclaw-helm', owner-only), with one extra
// signed field — characterId. The server maps that id to a persona it
// holds; no persona text is sent from the browser. Character turns run
// server-side on the OpenAI API (the Helm/OpenClaw path is separate and
// untouched). The runner is stateless, so this page keeps the recent
// conversation and resends it, signed, as `history` — user/assistant
// turns only; the server rejects anything else.
import { createSignedPortalProof } from '/operator/forge.js';
import { readHelmResponse } from '/helm/stream.js';
import { getCharacter, defaultCharacter } from '../characters.js';

const params = new URLSearchParams(location.search);
const character = getCharacter(params.get('c')) || defaultCharacter();

const $ = id => document.getElementById(id);
const log = $('chatLog');
const form = $('chatForm');
const input = $('chatMessage');
const send = $('chatSend');
const status = $('chatStatus');

const sessionKey = `3dvr.girl-chat.session.${character.id}`;
let sessionId = globalThis.sessionStorage?.getItem(sessionKey) || crypto.randomUUID();
globalThis.sessionStorage?.setItem(sessionKey, sessionId);
let busy = false;
// Recent turns for the stateless runner: user/assistant only, capped the
// same way the server caps them. The greeting is hers but is not a turn
// she actually sent, so it stays out.
const HISTORY_LIMIT = 20;
const history = [];

function signedIn() {
  try { return localStorage.getItem('signedIn') === 'true'; } catch { return false; }
}

function bubble(who, text) {
  const article = document.createElement('article');
  article.className = `msg msg--${who}`;
  const label = document.createElement('span');
  label.className = 'msg__label';
  label.textContent = who === 'her' ? character.name : 'You';
  const body = document.createElement('p');
  body.textContent = text;
  article.append(label, body);
  log.append(article);
  log.scrollTop = log.scrollHeight;
  return body;
}

function setStatus(text) { status.textContent = text; }

function refreshGate() {
  const open = signedIn();
  send.disabled = busy || !open;
  input.disabled = busy || !open;
  if (!open) setStatus('Sign in with the owner account to talk with her. This chat is private, like Helm.');
}

bubble('her', character.chat.greeting);
refreshGate();

form.addEventListener('submit', async event => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  if (!signedIn()) { refreshGate(); return; }
  busy = true;
  refreshGate();
  bubble('you', text);
  input.value = '';
  const replyBody = bubble('her', '');
  replyBody.textContent = '…';
  setStatus(`${character.name} is thinking…`);
  const started = Date.now();
  try {
    // Stream fragments into the reply bubble as they arrive.
    const now = Date.now();
    const payload = {
      requestId: crypto.randomUUID(),
      sessionId,
      message: text,
      characterId: character.id,
      engine: 'openclaw',
      history: [...history],
      createdAt: now,
      expiresAt: now + 10 * 60 * 1000
    };
    const proof = await createSignedPortalProof('openclaw-helm', 'chat', payload);
    if (!proof) throw Object.assign(new Error('Sign in with the owner account, then retry.'), { code: 401 });
    const response = await fetch('/api/openclaw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ ...payload, action: 'chat', ...proof }),
      signal: AbortSignal.timeout(110000)
    });
    let streamed = '';
    const result = await readHelmResponse(response, fragment => {
      streamed += fragment;
      replyBody.textContent = streamed;
      log.scrollTop = log.scrollHeight;
    });
    if (!response.ok || !result.ok) {
      const error = new Error(result.error || 'She could not reply just now.');
      error.code = response.status;
      error.stale = result.stale === true;
      throw error;
    }
    const reply = result.reply || streamed;
    replyBody.textContent = reply;
    history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
    while (history.length > HISTORY_LIMIT) history.shift();
    setStatus(`Replied after ${Math.max(1, Math.round((Date.now() - started) / 1000))}s.`);
  } catch (error) {
    replyBody.textContent = '';
    if (error.code === 401) setStatus('Sign in with the owner account to talk with her.');
    else if (error.code === 403) setStatus('This chat is private to the owner account (tmsteph), like Helm.');
    else if (error.code === 429) setStatus('She is mid-reply on another message. Give it a moment.');
    else if (error.stale) setStatus('That message expired before it reached her. Try again.');
    else setStatus(error.message || 'Something interrupted the reply. Try again.');
  } finally {
    busy = false;
    refreshGate();
    input.focus();
  }
});

window.addEventListener('storage', event => {
  if (['signedIn', 'alias', 'userPubKey'].includes(event.key)) refreshGate();
});
window.addEventListener('focus', refreshGate);
