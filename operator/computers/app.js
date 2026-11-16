import { COMPUTER_ENDPOINT, computerRequest, ownerComputerRequest } from '../computer-client.js';

const byId = id => document.getElementById(id);
const ownerStatus = byId('owner-status');
const targetStatus = byId('target-status');
const invitation = byId('invitation');
const preview = byId('preview');
const pair = byId('pair');
const disconnect = byId('disconnect');
let reviewedCode = '';
let session = null;
let inviteTimer;

function run(control, status, handler) {
  return async event => {
    event.preventDefault();
    control.disabled = true;
    status.textContent = '';
    try {
      await handler();
    } catch (error) {
      status.textContent = error.message;
    } finally {
      control.disabled = false;
    }
  };
}

async function refreshConnections() {
  const { devices } = await ownerComputerRequest('list');
  const list = byId('connections');
  list.replaceChildren();
  if (!devices.length) ownerStatus.textContent = 'No computers connected.';
  for (const device of devices) {
    const item = document.createElement('li');
    const check = document.createElement('button');
    check.type = 'button';
    check.textContent = 'Check in Operator';
    check.addEventListener('click', () => {
      sessionStorage.setItem('3dvr.operator.prefill.v1', JSON.stringify({
        prompt: `Is my computer ${device.name} online?`, submit: true
      }));
      location.assign('/operator/');
    });
    const revoke = document.createElement('button');
    revoke.type = 'button';
    revoke.textContent = 'Disconnect';
    revoke.setAttribute('aria-label', `Disconnect ${device.name}`);
    revoke.addEventListener('click', run(revoke, ownerStatus, async () => {
      await ownerComputerRequest('revoke', device.id);
      await refreshConnections();
    }));
    item.append(device.name, check, revoke);
    list.append(item);
  }
}

byId('refresh').addEventListener('click', run(byId('refresh'), ownerStatus, refreshConnections));
byId('invite').addEventListener('click', run(byId('invite'), ownerStatus, async () => {
  const { code, expiresAt } = await ownerComputerRequest('invite');
  byId('pairing-code').textContent = code;
  invitation.hidden = false;
  clearTimeout(inviteTimer);
  inviteTimer = setTimeout(() => {
    invitation.hidden = true;
    byId('pairing-code').textContent = '';
  }, Math.max(0, expiresAt - Date.now()));
}));

preview.addEventListener('submit', run(preview.querySelector('button'), targetStatus, async () => {
  const code = byId('code').value.trim();
  const { requestedBy } = await computerRequest({ action: 'preview', code });
  reviewedCode = code;
  byId('requester').textContent = `Portal account ${requestedBy} is requesting access.`;
  preview.hidden = true;
  pair.hidden = false;
  byId('name').focus();
}));

function resetTarget() {
  reviewedCode = '';
  preview.reset();
  pair.reset();
  preview.hidden = false;
  pair.hidden = true;
  disconnect.hidden = true;
}

byId('cancel').addEventListener('click', () => {
  resetTarget();
  byId('code').focus();
});

function endSession() {
  const ended = session;
  session = null;
  clearTimeout(ended?.timer);
  resetTarget();
  return ended;
}

async function pulse(active, receipt) {
  try {
    const { probeId } = await computerRequest({ action: 'heartbeat', token: active.token, receipt });
    if (session !== active) return;
    if (probeId) {
      void pulse(active, probeId);
    } else {
      active.timer = setTimeout(() => void pulse(active), 2_000);
    }
  } catch (error) {
    if (session !== active) return;
    endSession();
    targetStatus.textContent = `Connection ended. ${error.message}`;
  }
}

pair.addEventListener('submit', run(pair.querySelector('button[type="submit"]'), targetStatus, async () => {
  const name = byId('name').value.trim();
  const cancel = byId('cancel');
  cancel.disabled = true;
  let token;
  try {
    ({ token } = await computerRequest({ action: 'pair', code: reviewedCode, name }));
  } finally {
    cancel.disabled = false;
  }
  reviewedCode = '';
  pair.reset();
  pair.hidden = true;
  disconnect.hidden = false;
  session = { token, timer: null };
  targetStatus.textContent = `${name} is connected for status checks. Keep this tab open.`;
  disconnect.focus();
  void pulse(session);
}));

disconnect.addEventListener('click', run(disconnect, targetStatus, async () => {
  const ended = endSession();
  if (!ended) return;
  await computerRequest({ action: 'disconnect', token: ended.token }, { keepalive: true });
  targetStatus.textContent = 'Disconnected.';
  byId('code').focus();
}));

addEventListener('pagehide', () => {
  if (!session) return;
  const { token } = endSession();
  navigator.sendBeacon(COMPUTER_ENDPOINT, new Blob(
    [JSON.stringify({ action: 'disconnect', token })], { type: 'application/json' }
  ));
});

if (localStorage.getItem('signedIn') === 'true') {
  byId('sign-in').hidden = true;
  void refreshConnections().catch(error => {
    byId('sign-in').hidden = false;
    ownerStatus.textContent = error.message;
  });
}
