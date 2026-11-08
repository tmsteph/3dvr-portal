import { createSignedPortalProof, openHelmMessageStore } from '/operator/forge.js';
import { createOutbox } from './outbox.js';
import { readHelmResponse } from './stream.js';

const $ = id => document.getElementById(id);
let sessionKey = `3dvr.helm.session.${localStorage.getItem('userPubKey') || localStorage.getItem('alias') || 'guest'}`;
let sessionId = globalThis.sessionStorage?.getItem(sessionKey) || crypto.randomUUID();
globalThis.sessionStorage?.setItem(sessionKey, sessionId);
// OpenClaw is the default engine: a fresh visit always starts on it, no
// matter which engine an earlier chat used. The picker still switches the
// engine for the current chat, and History resume restores that chat's own.
let engine = 'openclaw';
globalThis.sessionStorage?.setItem(`${sessionKey}.engine`, engine);
const engineNames = { openclaw: 'OpenClaw', codex: 'Codex', 'codex-backup': 'Codex backup' };
let busy = false;
let saving = false;
let connected = false;
let verifiedAccount = false;
let storePromise;
let store;
let epoch = 0;
let liveReply = null;
let outbox = makeOutbox();

function signedIn() { return localStorage.getItem('signedIn') === 'true'; }

function ensureMessages() {
  if (!storePromise) {
    const currentEpoch = epoch;
    storePromise = openHelmMessageStore({
      onRecord(record) {
        if (currentEpoch !== epoch) return;
        outbox.merge(record);
        if (connected) void drain();
      },
      onSync(text) { if (currentEpoch === epoch) $('queue-storage').textContent = text; }
    }).then(value => {
      if (currentEpoch !== epoch) { value.close(); throw new Error('Account changed.'); }
      store = value;
      return value;
    }).catch(error => { if (currentEpoch === epoch) storePromise = null; throw error; });
  }
  return storePromise;
}

function makeOutbox() {
  const currentEpoch = epoch;
  const saveRecord = async record => {
    if (currentEpoch !== epoch) throw new Error('Account changed.');
    const target = await ensureMessages();
    if (currentEpoch !== epoch) throw new Error('Account changed.');
    await target.save(record);
  };
  // One turn driver serves both dispatch and reattach: the outbox
  // calls it as send for fresh messages and as poll for records an
  // earlier page life already dispatched (restored in 'sending'
  // state). Both paths resubmit the same signed payload; the server
  // receipt decides what is still true, so a poll can never become a
  // second send, and the live preview below is rebuilt from the
  // receipt rather than from this page's memory.
  const sendTurn = async record => {
      busy = true;
      updateControls();
      const started = Date.now();
      let queuePosition = null;
      liveReply = { id: record.id, text: '', activity: null, startedAt: null };
      const showWaiting = () => {
        if (currentEpoch !== epoch) return;
        const label = liveReply?.activity ? liveReply.activity
          : liveReply?.text ? 'Receiving agent reply'
          : queuePosition !== null ? (queuePosition > 0 ? `Queued · ${queuePosition} ahead` : 'Queued · next up')
          : 'Waiting for agent reply';
        $('connection').textContent = label;
        $('activity').textContent = `${label} · ${Math.floor((Date.now() - started) / 1000)}s elapsed`;
      };
      showWaiting();
      const progress = setInterval(showWaiting, 1000);
      try {
        const result = await request('chat', record, text => {
          if (currentEpoch !== epoch) return;
          liveReply.text += text;
          showWaiting();
          renderMessages();
        }, position => {
          if (currentEpoch !== epoch) return;
          queuePosition = typeof position === 'number' ? position : null;
          showWaiting();
        }, preview => {
          if (currentEpoch !== epoch) return;
          // A poll answer carries the receipt's rolling preview: its
          // accumulated text replaces (never appends to) any locally
          // streamed fragments, and its activity line names what the
          // agent is doing right now. This is what keeps the working
          // bubble alive across queued waits and page reloads.
          if (preview) {
            if (typeof preview.text === 'string') liveReply.text = preview.text;
            liveReply.activity = preview.activity ?? null;
            if (preview.startedAt) liveReply.startedAt = preview.startedAt;
          }
          showWaiting();
          renderMessages();
        }, activity => {
          if (currentEpoch !== epoch) return;
          liveReply.activity = activity;
          showWaiting();
          renderMessages();
        });
        if (currentEpoch === epoch) {
          $('connection').textContent = 'Agent replied';
          $('activity').textContent = `Reply received after ${Math.floor((Date.now() - started) / 1000)}s.`;
        }
        return result;
      } catch (error) {
        if (currentEpoch === epoch) {
          connected = false;
          $('dot').classList.remove('connected');
          $('connection').textContent = error.retryable ? 'Agent busy' : error.stale ? 'Message expired' : 'Reply not confirmed';
          $('activity').textContent = error.retryable
            ? 'Agent busy. Your saved message will retry until it expires.'
            : `${error.message} Check History before sending again.`;
        }
        throw error;
      } finally {
        clearInterval(progress);
        if (currentEpoch === epoch) { liveReply = null; busy = false; updateControls(); }
      }
  };
  return createOutbox({
    save: saveRecord,
    send: sendTurn,
    poll: sendTurn,
    canSend: record => (record.engine ?? 'openclaw') === engine,
    isReady: () => currentEpoch === epoch && connected && !busy && signedIn(),
    onChange: () => { if (currentEpoch === epoch) renderMessages(); }
  });
}

function showAccount(identity) {
  const account = $('account');
  if (identity?.verified) {
    verifiedAccount = true;
    account.textContent = `✓ ${identity.username}`;
    account.title = 'Account verified by the server';
    account.href = '/profile.html#profile';
    account.dataset.verified = 'true';
    return;
  }
  if (verifiedAccount) return;
  delete account.dataset.verified;
  try {
    globalThis.AuthIdentity?.syncStorageFromSharedIdentity?.(localStorage);
    const shared = globalThis.AuthIdentity?.readSharedIdentity?.() || {};
    const signedIn = localStorage.getItem('signedIn') === 'true';
    const alias = localStorage.getItem('alias') || shared.alias || '';
    const username = localStorage.getItem('username') || shared.username || alias.split('@')[0];
    account.textContent = signedIn ? username || 'Account' : 'Sign in';
    account.href = signedIn ? '/profile.html#profile' : '/auth/sign-in.html?returnTo=%2Fhelm%2F';
    account.title = signedIn ? 'Signed in · checking agent access automatically' : 'Sign in to use Helm';
  } catch { account.textContent = 'Sign in'; }
}
async function request(action, record, onDelta, onQueue, onPreview, onActivity) {
  const requestEpoch = epoch;
  const payload = record
    ? { requestId: record.id, sessionId: record.sessionId, message: record.text, createdAt: record.createdAt, expiresAt: record.expiresAt, engine: record.engine ?? 'openclaw' }
    : { requestId: crypto.randomUUID(), sessionId, engine };
  // Server-side queue: a chat submit can answer 202 with a queue
  // position instead of a result. Poll by resubmitting the identical
  // signed payload (the receipt fingerprint makes each poll a safe
  // replay of the same message, never a second send) with a fresh proof,
  // because proofs age out after 120 s while a queue wait can run
  // longer. A server without the queue never sends 202, so this loop is
  // inert until the queue is enabled there.
  let response;
  let result;
  for (;;) {
    const proof = await createSignedPortalProof('openclaw-helm', action, payload);
    if (requestEpoch !== epoch) throw new Error('Account changed.');
    if (!proof) throw new Error('Sign in with your owner account, then retry.');
    response = await fetch('/api/openclaw', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...(onDelta ? { Accept: 'text/event-stream' } : {}) },
      body: JSON.stringify({ ...payload, action, ...proof }),
      signal: AbortSignal.timeout(110000)
    });
    result = await readHelmResponse(response, text => {
      if (requestEpoch === epoch) onDelta?.(text);
    }, text => {
      if (requestEpoch === epoch) onActivity?.(text);
    });
    if (requestEpoch !== epoch) throw new Error('Account changed.');
    if (response.status !== 202 || !result?.queued) break;
    onQueue?.(result.position);
    onPreview?.(result.preview ?? null);
    if (record && Date.now() > record.expiresAt + 30000) {
      throw new Error('The wait outlasted the message lifetime. Check History before sending again.');
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  if (result.identity?.verified) showAccount(result.identity);
  if (response.status === 401) {
    verifiedAccount = false;
    delete $('account').dataset.verified;
    $('account').textContent = 'Sign in again';
    $('account').href = '/auth/sign-in.html?returnTo=%2Fhelm%2F';
  }
  if (!response.ok || !result.ok) {
    const error = new Error(result.error || 'The selected engine is unavailable.');
    error.stale = result.stale === true;
    // This endpoint rejects 429 before creating a receipt or invoking the agent.
    error.retryable = response.status === 429;
    throw error;
  }
  return result;
}

function updateControls() {
  // Agent boot and model execution never block capture of the next message.
  $('send').disabled = saving || !signedIn();
  $('send').textContent = connected && !busy ? 'Send ↑' : 'Queue ↑';
  $('new-chat').disabled = saving;
  $('connect').disabled = busy;
  $('engine').disabled = busy || saving;
  $('connect').hidden = connected;
  $('connect').textContent = busy ? 'Checking…' : 'Retry connection';
}

function messageCard(record, history = false) {
  const article = document.createElement('article');
  article.className = 'message user';
  const label = document.createElement('span');
  label.className = 'label';
  const names = { queued: 'Queued · waiting for agent', deferred: 'Queued · agent busy', sending: 'Sending · waiting for the agent',
    completed: 'Sent', stale: 'History · expired without sending', uncertain: 'History · check delivery before resending', cancelled: 'History · cancelled' };
  label.textContent = `${engineNames[record.engine ?? 'openclaw']} · ${names[record.status]}`;
  article.append(label, document.createTextNode(record.text));
  // The working bubble: while this record's turn is in flight, its
  // reply area shows whatever progress is known (fragments streamed on
  // a held connection, or the receipt's rolling preview when polling)
  // above a quiet working line naming the current activity and the
  // elapsed time. When the final reply lands it replaces the bubble
  // in the same position.
  const live = liveReply?.id === record.id && record.status === 'sending' && !record.reply ? liveReply : null;
  const partial = live ? live.text : '';
  if (record.reply || partial) {
    const reply = document.createElement('p');
    reply.className = live ? 'saved-reply live' : 'saved-reply';
    reply.textContent = record.reply || partial;
    if (live) reply.setAttribute('aria-label', 'Reply arriving; completion not yet confirmed');
    article.append(reply);
  }
  if (live) {
    const working = document.createElement('small');
    working.className = 'working-note';
    const elapsed = Math.max(0, Math.floor((Date.now() - (live.startedAt ?? record.createdAt)) / 1000));
    working.textContent = `${live.activity || (partial ? 'Receiving reply' : 'Working')} · ${elapsed}s`;
    article.append(working);
  }
  if (record.note) {
    const note = document.createElement('small');
    note.textContent = record.note;
    article.append(note);
  }
  if (['queued', 'deferred'].includes(record.status)) {
    const cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => { void outbox.cancel(record.id).catch(showStorageError); });
    article.append(cancel);
  }
  if (history && ['stale', 'uncertain', 'cancelled'].includes(record.status)) {
    const reuse = document.createElement('button');
    reuse.type = 'button'; reuse.textContent = 'Use as new message';
    reuse.addEventListener('click', () => { $('message').value = record.text; $('message').focus(); });
    article.append(reuse);
  }
  return article;
}

function resumeChat(resumeSessionId, resumeEngine) {
  // Same state updates as an engine switch, except the session id is the
  // resumed chat's own: its gateway session is keyed by that id, so the
  // conversation's context follows it.
  engine = resumeEngine;
  globalThis.sessionStorage?.setItem(`${sessionKey}.engine`, engine);
  sessionId = resumeSessionId;
  globalThis.sessionStorage?.setItem(sessionKey, sessionId);
  connected = false;
  $('dot').classList.remove('connected');
  showEngine();
  renderMessages(); updateControls();
  $('history').hidden = true;
  $('show-history').setAttribute('aria-expanded', 'false');
  $('activity').textContent = 'Conversation resumed. Its earlier messages are shown above.';
  $('message').focus();
  void checkConnection({ automatic: true });
}

const expandedHistory = new Set();

function previewText(text) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > 64 ? `${clean.slice(0, 61)}…` : clean;
}

function relativeTime(timestamp) {
  const elapsed = Date.now() - timestamp;
  if (elapsed < 45 * 1000) return 'just now';
  const minutes = Math.round(elapsed / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)}m ago`;
  const hours = Math.round(elapsed / 3600000);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(elapsed / 86400000);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function historyRow(group) {
  const isActive = group.groupSessionId === sessionId && group.groupEngine === engine;
  const row = document.createElement('section');
  row.className = isActive ? 'history-chat current' : 'history-chat';
  const preview = document.createElement('p');
  preview.className = 'history-preview';
  preview.textContent = previewText(group.records[0].text);
  const meta = document.createElement('small');
  meta.className = 'history-meta';
  meta.textContent = `${relativeTime(group.lastActivity)} · ${engineNames[group.groupEngine]}${isActive ? ' · Current conversation' : ''}`;
  row.append(preview, meta);
  const actions = document.createElement('div');
  actions.className = 'history-actions';
  const expanded = expandedHistory.has(group.key);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = expanded ? 'Hide messages' : `Show messages (${group.records.length})`;
  toggle.setAttribute('aria-expanded', String(expanded));
  toggle.addEventListener('click', () => {
    if (expandedHistory.has(group.key)) expandedHistory.delete(group.key);
    else expandedHistory.add(group.key);
    renderMessages();
  });
  actions.append(toggle);
  if (!isActive) {
    const resume = document.createElement('button');
    resume.type = 'button';
    resume.textContent = 'Resume this chat';
    const { groupSessionId, groupEngine } = group;
    resume.addEventListener('click', () => resumeChat(groupSessionId, groupEngine));
    actions.append(resume);
  }
  row.append(actions);
  if (expanded) {
    const detail = document.createElement('div');
    detail.className = 'history-detail';
    detail.append(...group.records.map(record => messageCard(record, true)));
    row.append(detail);
  }
  return row;
}

function renderMessages() {
  const records = outbox.snapshot();
  const active = records.filter(record => record.sessionId === sessionId && (record.engine ?? 'openclaw') === engine && !['stale', 'uncertain', 'cancelled'].includes(record.status));
  $('messages').replaceChildren(...active.map(record => messageCard(record)));
  $('welcome').hidden = active.length > 0;
  // History is a picker of conversations, not a second message log: one row
  // per conversation (session + engine), newest activity at the top, each
  // row labelled by its first message. Expanding a row shows its records
  // with their actions; Resume restores its session id, and the gateway
  // keys context by session id, so the conversation continues where it left.
  const groups = new Map();
  for (const record of records) {
    const groupEngine = record.engine ?? 'openclaw';
    const key = `${record.sessionId}::${groupEngine}`;
    if (!groups.has(key)) groups.set(key, { key, groupSessionId: record.sessionId, groupEngine, records: [] });
    groups.get(key).records.push(record);
  }
  const ordered = [...groups.values()]
    .map(group => ({ ...group, lastActivity: Math.max(...group.records.map(record => record.updatedAt ?? record.createdAt)) }))
    .sort((a, b) => b.lastActivity - a.lastActivity || a.key.localeCompare(b.key));
  $('history-list').replaceChildren(...ordered.map(group => historyRow(group)));
  $('show-history').textContent = ordered.length ? `History (${ordered.length})` : 'History';
  const pending = records.filter(record => ['queued', 'deferred'].includes(record.status)).length;
  $('queue-summary').textContent = pending ? `${pending} queued · sends when ready · expires after 10 minutes` : '';
}

function showStorageError(error) { $('activity').textContent = `Could not save the message: ${error.message} Your text stays in the composer.`; }

async function drain() {
  const drainEpoch = epoch;
  try { await outbox.drain(); }
  catch (error) { if (drainEpoch === epoch) $('activity').textContent = `Queue paused: ${error.message}`; }
}

async function checkConnection({ automatic = false } = {}) {
  if (busy) return;
  const connectionEpoch = epoch;
  if (automatic && !signedIn()) {
    $('connection').textContent = 'Sign in to use your agent';
    $('activity').textContent = 'Sign in with your account above. Helm connects automatically.';
    return;
  }
  busy = true;
  updateControls();
  $('connection').textContent = 'Checking…';
  try {
    await ensureMessages();
    if (connectionEpoch !== epoch) return;
    const result = await request('status');
    connected = result.gateway === 'reachable' && result.chatEnabled;
    $('connection').textContent = connected ? `${engineNames[engine]} ready` : 'Agent reachable · chat setup needed';
    $('dot').classList.toggle('connected', connected);
    $('activity').textContent = connected ? 'Ready. Saved messages send automatically.' : 'You can queue a message while the agent starts.';
  } catch (error) {
    if (connectionEpoch !== epoch) return;
    connected = false;
    $('connection').textContent = error.message;
    $('dot').classList.remove('connected');
    $('activity').textContent = 'You can save a message now. It stays queued until the agent is ready.';
  } finally {
    if (connectionEpoch === epoch) { busy = false; updateControls(); }
  }
  if (connectionEpoch === epoch) await drain();
}

function showEngine() {
  $('engine').value = engine;
  $('engine-home').textContent = engine === 'codex-backup' ? 'DigitalOcean' : 'Hetzner';
  $('engine-note').textContent = engine === 'codex-backup'
    ? 'Backup chat on DigitalOcean · starts a separate conversation, without OpenClaw tools. Pending messages are never moved or replayed.'
    : engine === 'codex'
    ? 'Native Codex pilot · chat and code advice. OpenClaw integrations are available through OpenClaw.'
    : 'OpenClaw · your existing tools and integrations.';
}
showEngine();
$('engine').addEventListener('change', () => {
  if (busy || saving || !['openclaw', 'codex', 'codex-backup'].includes($('engine').value)) { $('engine').value = engine; return; }
  engine = $('engine').value;
  globalThis.sessionStorage?.setItem(`${sessionKey}.engine`, engine);
  // A new conversation prevents an engine switch from implying shared server history.
  sessionId = crypto.randomUUID();
  globalThis.sessionStorage?.setItem(sessionKey, sessionId);
  connected = false;
  $('dot').classList.remove('connected');
  showEngine();
  renderMessages(); updateControls();
  void checkConnection({ automatic: true });
});
$('connect').addEventListener('click', () => checkConnection());
$('chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('message').value.trim();
  if (!text || saving || !signedIn()) return;
  saving = true;
  updateControls();
  $('activity').textContent = 'Saving your message…';
  try {
    await outbox.enqueue({ id: crypto.randomUUID(), sessionId, text, engine });
    if ($('message').value.trim() === text) $('message').value = '';
    $('queue-storage').textContent = 'Saved encrypted here · syncing with your GunJS account';
    $('activity').textContent = connected ? 'Saved. Sending when the agent is free.' : 'Saved. It will send when the agent is ready.';
  } catch (error) { showStorageError(error); }
  finally { saving = false; updateControls(); }
  await drain();
});
$('new-chat').addEventListener('click', () => {
  sessionId = crypto.randomUUID();
  globalThis.sessionStorage?.setItem(sessionKey, sessionId);
  // A new chat also returns to the default engine.
  const engineChanged = engine !== 'openclaw';
  engine = 'openclaw';
  globalThis.sessionStorage?.setItem(`${sessionKey}.engine`, engine);
  if (engineChanged) {
    connected = false;
    $('dot').classList.remove('connected');
    showEngine();
  }
  $('history').hidden = true;
  $('show-history').setAttribute('aria-expanded', 'false');
  $('message').value = '';
  renderMessages();
  $('activity').textContent = 'New conversation. Saved messages remain in history.';
  $('message').focus();
  if (engineChanged) void checkConnection({ automatic: true });
});
$('show-history').addEventListener('click', () => {
  $('history').hidden = !$('history').hidden;
  $('show-history').setAttribute('aria-expanded', String(!$('history').hidden));
});
for (const button of document.querySelectorAll('[data-prompt]')) {
  button.addEventListener('click', () => { $('message').value = button.dataset.prompt; $('message').focus(); });
}
window.addEventListener('storage', event => {
  if (!['signedIn', 'alias', 'userPubKey'].includes(event.key)) return;
  epoch += 1;
  sessionKey = `3dvr.helm.session.${localStorage.getItem('userPubKey') || localStorage.getItem('alias') || 'guest'}`;
  sessionId = crypto.randomUUID();
  engine = 'openclaw';
  globalThis.sessionStorage?.setItem(`${sessionKey}.engine`, engine);
  showEngine();
  globalThis.sessionStorage?.setItem(sessionKey, sessionId);
  store?.close(); store = null; storePromise = null;
  busy = false; liveReply = null;
  connected = false; verifiedAccount = false; outbox = makeOutbox();
  showAccount(); renderMessages(); updateControls();
  void checkConnection({ automatic: true });
});
window.addEventListener('focus', () => {
  showAccount();
  if (!connected) void checkConnection({ automatic: true });
  else void drain();
});
window.addEventListener('online', () => { if (!connected) void checkConnection({ automatic: true }); });
window.addEventListener('offline', () => {
  connected = false;
  $('connection').textContent = 'Offline · messages can still be saved';
  $('dot').classList.remove('connected'); updateControls();
});
// Only queued work causes periodic status retries; no inference or chat replay occurs here.
setInterval(() => {
  if (!signedIn()) return;
  void outbox.expire().catch(showStorageError);
  if (outbox.snapshot().some(record => ['queued', 'deferred'].includes(record.status))) {
    if (!connected) void checkConnection({ automatic: true });
    else void drain();
  }
}, 15000);
showAccount(); updateControls();
void checkConnection({ automatic: true });
