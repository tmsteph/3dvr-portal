import { createSignedPortalProof } from '/operator/forge.js';

const $ = id => document.getElementById(id);
let sessionId = crypto.randomUUID();
let busy = false;
let connected = false;

function updateControls() {
  $('send').disabled = busy || !connected;
  $('new-chat').disabled = busy;
  $('connect').disabled = busy;
}

async function request(action, message = '') {
  const requestId = crypto.randomUUID();
  const payload = { requestId, sessionId, ...(action === 'chat' ? { message } : {}) };
  const proof = await createSignedPortalProof('openclaw-helm', action, payload);
  if (!proof) throw new Error('Sign in with your owner account, then connect again.');
  const response = await fetch('/api/openclaw', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, action, ...proof }),
    signal: AbortSignal.timeout(110000)
  });
  const result = await response.json();
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

$('connect').addEventListener('click', async () => {
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
    $('activity').textContent = 'Connection not established. Use the existing Telegram chat or try again.';
  } finally { busy = false; updateControls(); }
});

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
