import { createSignedPortalProof, openHelmMessageStore } from '/operator/forge.js';
import { createOutbox } from './outbox.js';

const $ = id => document.getElementById(id);
const sessionKey = `3dvr.helm.session.${localStorage.getItem('userPubKey') || localStorage.getItem('alias') || 'guest'}`;
let sessionId = globalThis.sessionStorage?.getItem(sessionKey) || crypto.randomUUID();
globalThis.sessionStorage?.setItem(sessionKey, sessionId);
let busy = false;
let saving = false;
let connected = false;
let verifiedAccount = false;
let storePromise;
let store;
let epoch = 0;
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
  return createOutbox({
    async save(record) {
      if (currentEpoch !== epoch) throw new Error('Account changed.');
      const target = await ensureMessages();
      if (currentEpoch !== epoch) throw new Error('Account changed.');
      await target.save(record);
    },
    async send(record) {
      busy = true;
      updateControls();
      const started = Date.now();
      const showWaiting = () => {
        if (currentEpoch !== epoch) return;
        $('connection').textContent = 'Waiting for agent reply';
        $('activity').textContent = `Waiting for agent reply · ${Math.floor((Date.now() - started) / 1000)}s elapsed`;
      };
      showWaiting();
      const progress = setInterval(showWaiting, 1000);
      try {
        const result = await request('chat', record);
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
        if (currentEpoch === epoch) { busy = false; updateControls(); }
      }
    },
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
async function request(action, record) {
  const payload = record
    ? { requestId: record.id, sessionId: record.sessionId, message: record.text, createdAt: record.createdAt, expiresAt: record.expiresAt }
    : { requestId: crypto.randomUUID(), sessionId };
  const proof = await createSignedPortalProof('openclaw-helm', action, payload);
  if (!proof) throw new Error('Sign in with your owner account, then retry.');
  const response = await fetch('/api/openclaw', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, action, ...proof }),
    signal: AbortSignal.timeout(110000)
  });
  const result = await response.json();
  if (result.identity?.verified) showAccount(result.identity);
  if (response.status === 401) {
    verifiedAccount = false;
    delete $('account').dataset.verified;
    $('account').textContent = 'Sign in again';
    $('account').href = '/auth/sign-in.html?returnTo=%2Fhelm%2F';
  }
  if (!response.ok || !result.ok) {
    const error = new Error(result.error || 'OpenClaw is unavailable.');
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
  $('connect').hidden = connected;
  $('connect').textContent = busy ? 'Checking…' : 'Retry connection';
}

function messageCard(record, history = false) {
  const article = document.createElement('article');
  article.className = 'message user';
  const label = document.createElement('span');
  label.className = 'label';
  const names = { queued: 'Queued · waiting for agent', deferred: 'Queued · agent busy', sending: 'Delivery pending · will not resend',
    completed: 'Sent', stale: 'History · expired without sending', uncertain: 'History · check delivery before resending', cancelled: 'History · cancelled' };
  label.textContent = names[record.status];
  article.append(label, document.createTextNode(record.text));
  if (record.reply) {
    const reply = document.createElement('p');
    reply.className = 'saved-reply';
    reply.textContent = record.reply;
    article.append(reply);
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

function renderMessages() {
  const records = outbox.snapshot();
  const active = records.filter(record => record.sessionId === sessionId && !['stale', 'uncertain', 'cancelled'].includes(record.status));
  $('messages').replaceChildren(...active.map(record => messageCard(record)));
  $('welcome').hidden = active.length > 0;
  $('history-list').replaceChildren(...records.map(record => messageCard(record, true)));
  $('show-history').textContent = records.length ? `History (${records.length})` : 'History';
  const pending = records.filter(record => ['queued', 'deferred'].includes(record.status)).length;
  $('queue-summary').textContent = pending ? `${pending} queued · sends when ready · expires after 10 minutes` : '';
}

function showStorageError(error) { $('activity').textContent = `Could not save the message: ${error.message} Your text stays in the composer.`; }

async function drain() {
  try { await outbox.drain(); }
  catch (error) { $('activity').textContent = `Queue paused: ${error.message}`; }
}

async function checkConnection({ automatic = false } = {}) {
  if (busy) return;
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
    const result = await request('status');
    connected = result.gateway === 'reachable' && result.chatEnabled;
    $('connection').textContent = connected ? 'Gateway reachable · chat enabled' : 'Gateway reachable · chat setup needed';
    $('dot').classList.toggle('connected', connected);
    $('activity').textContent = connected ? 'Ready. Saved messages send automatically.' : 'You can queue a message while the agent starts.';
  } catch (error) {
    connected = false;
    $('connection').textContent = error.message;
    $('dot').classList.remove('connected');
    $('activity').textContent = 'You can save a message now. It stays queued until the agent is ready.';
  } finally { busy = false; updateControls(); }
  await drain();
}

$('connect').addEventListener('click', () => checkConnection());
$('chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('message').value.trim();
  if (!text || saving || !signedIn()) return;
  saving = true;
  updateControls();
  $('activity').textContent = 'Saving your message…';
  try {
    await outbox.enqueue({ id: crypto.randomUUID(), sessionId, text });
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
  renderMessages();
  $('activity').textContent = 'New conversation. Saved messages remain in history.';
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
  epoch += 1; store?.close(); store = null; storePromise = null;
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
