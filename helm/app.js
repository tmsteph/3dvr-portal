import { createSignedPortalProof } from '/operator/forge.js';

const $ = id => document.getElementById(id);
let sessionId = crypto.randomUUID();
let busy = false;
let connected = false;
let verifiedAccount = false;

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
showAccount();
window.addEventListener('storage', () => {
  verifiedAccount = false;
  connected = false;
  showAccount();
  updateControls();
  void checkConnection({ automatic: true });
});
window.addEventListener('focus', () => {
  showAccount();
  if (!connected) void checkConnection({ automatic: true });
});
window.addEventListener('online', () => { if (!connected) void checkConnection({ automatic: true }); });
window.addEventListener('offline', () => {
  connected = false;
  $('connection').textContent = 'Offline · reconnecting when your network returns';
  $('dot').classList.remove('connected');
  updateControls();
});

function updateControls() {
  $('send').disabled = busy || !connected;
  $('new-chat').disabled = busy;
  $('connect').disabled = busy;
  $('connect').hidden = connected;
  $('connect').textContent = busy ? 'Checking…' : 'Retry connection';
}

async function request(action, message = '') {
  const requestId = crypto.randomUUID();
  const payload = { requestId, sessionId, ...(action === 'chat' ? { message } : {}) };
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
  if (!response.ok || !result.ok) throw new Error(result.error || 'OpenClaw is unavailable.');
  return result;
}

function addMessage(role, text) {
  $('welcome').hidden = true;
  const article = document.createElement('article');
  article.className = `message ${role}`;
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = role === 'user' ? 'YOU' : 'OPENCLAW';
  article.append(label, document.createTextNode(text));
  $('messages').append(article);
  article.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function checkConnection({ automatic = false } = {}) {
  if (busy) return;
  if (automatic && localStorage.getItem('signedIn') !== 'true') {
    $('connection').textContent = 'Sign in to use your agent';
    $('activity').textContent = 'Sign in with your account above. Helm connects automatically.';
    return;
  }
  busy = true;
  updateControls();
  $('connection').textContent = 'Checking…';
  try {
    const result = await request('status');
    connected = result.gateway === 'reachable' && result.chatEnabled;
    $('connection').textContent = connected ? 'Gateway reachable · chat enabled' : 'Gateway reachable · chat setup needed';
    $('dot').classList.toggle('connected', connected);
    $('activity').textContent = connected ? 'Ready for your message.' : 'The gateway needs its server-side chat endpoint enabled.';
  } catch (error) {
    connected = false;
    $('connection').textContent = error.message;
    $('dot').classList.remove('connected');
    $('activity').textContent = verifiedAccount
      ? 'Your account is verified. The agent connection needs attention; try checking again.'
      : 'Check your account above, then try connecting again.';
  } finally { busy = false; updateControls(); }
}
$('connect').addEventListener('click', () => checkConnection());

$('chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = $('message').value.trim();
  if (!text || busy || !connected) return;
  busy = true;
  updateControls();
  addMessage('user', text);
  $('message').value = '';
  $('activity').textContent = 'Sending to OpenClaw… Waiting for its reply.';
  const started = Date.now();
  const timer = setInterval(() => {
    $('activity').textContent = `Waiting for OpenClaw · ${Math.floor((Date.now() - started) / 1000)}s elapsed`;
  }, 1000);
  try {
    const result = await request('chat', text);
    addMessage('assistant', result.reply);
    $('activity').textContent = 'OpenClaw replied.';
  } catch (error) {
    $('activity').textContent = `${error.message} No automatic resend was made.`;
  } finally { clearInterval(timer); busy = false; updateControls(); }
});

$('new-chat').addEventListener('click', () => {
  sessionId = crypto.randomUUID();
  $('messages').replaceChildren();
  $('welcome').hidden = false;
  $('activity').textContent = 'New conversation. Previous OpenClaw sessions remain on the server.';
});
for (const button of document.querySelectorAll('[data-prompt]')) {
  button.addEventListener('click', () => { $('message').value = button.dataset.prompt; $('message').focus(); });
}
updateControls();
void checkConnection({ automatic: true });
