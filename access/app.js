import { createSignedPortalProof } from '/operator/forge.js';

const byId = id => document.getElementById(id);
const approvalDialog = byId('approvalDialog');
const approvalButton = byId('bitwardenApproval');
const refreshButton = byId('refreshAccess');
const approvalList = byId('approvalList');
const bitwardenToken = byId('bitwardenToken');
const connectBitwarden = byId('connectBitwarden');
const bitwardenSetupMessage = byId('bitwardenSetupMessage');
const saveSecretDialog = byId('saveSecretDialog');
const openSaveSecret = byId('openSaveSecret');
const saveSecret = byId('saveSecret');
const secretKey = byId('secretKey');
const secretValue = byId('secretValue');
const secretNote = byId('secretNote');
const secretSaveMessage = byId('secretSaveMessage');
const secretSaveStatus = byId('secretSaveStatus');
const secretHandoffDialog = byId('secretHandoffDialog');
const openSecretHandoff = byId('openSecretHandoff');
const handoffKey = byId('handoffKey');
const handoffLabel = byId('handoffLabel');
const handoffRecipient = byId('handoffRecipient');
const handoffPurpose = byId('handoffPurpose');
const handoffTtl = byId('handoffTtl');
const handoffMessage = byId('handoffMessage');
const handoffResult = byId('handoffResult');
const handoffLink = byId('handoffLink');
const createHandoff = byId('createHandoff');
const copyHandoffLink = byId('copyHandoffLink');

function setPill(id, text, state = 'progress') {
  const element = byId(id);
  if (!element) return;
  element.textContent = text;
  element.className = `pill ${state}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function registryPillState(status) {
  if (status === 'working') return 'ready';
  if (status === 'partial') return 'waiting';
  return 'progress';
}

function renderConnectionRegistry(payload) {
  const list = byId('connectionList');
  const summary = byId('connectionSummary');
  if (!list || !summary) return;
  const rows = (payload.capabilities || []).filter(capability => capability.showInAccess);
  const working = rows.filter(capability => capability.status === 'working').length;
  const partial = rows.filter(capability => capability.status === 'partial').length;
  summary.textContent = `${rows.length} documented access paths · ${working} working · ${partial} partial/session-dependent · registry updated ${payload.updated || 'unknown'}.`;
  list.innerHTML = rows.map(capability => `
    <article class="connection-item">
      <div class="connection-head">
        <div><strong>${escapeHtml(capability.name)}</strong><small>${escapeHtml(capability.category || '')}</small></div>
        <span class="pill ${registryPillState(capability.status)}">${escapeHtml(payload.statuses?.[capability.status] || capability.status)}</span>
      </div>
      <p><b>Via</b><span>${escapeHtml(capability.access || 'Not documented')}</span></p>
      ${capability.healthCheck ? `<p><b>Check</b><span>${escapeHtml(capability.healthCheck)}</span></p>` : ''}
      ${capability.fallback ? `<p><b>Fallback</b><span>${escapeHtml(capability.fallback)}</span></p>` : ''}
    </article>`).join('');
}

async function loadConnectionRegistry() {
  const list = byId('connectionList');
  const summary = byId('connectionSummary');
  try {
    const response = await fetch('/abilities/abilities.json', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    renderConnectionRegistry(await response.json());
  } catch (error) {
    if (summary) summary.textContent = 'Capability map is unavailable.';
    if (list) list.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  }
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function readPortalSession() {
  try {
    const response = await fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' });
    if (!response.ok) return { authenticated: false };
    return await response.json();
  } catch {
    return { authenticated: false };
  }
}

let brokerOriginPromise = null;

async function resolveBrokerOrigin() {
  if (brokerOriginPromise) return brokerOriginPromise;
  brokerOriginPromise = (async () => {
    const response = await fetch('/runtime/organism-bridge.json', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error('OVH control-plane address is unavailable.');
    const payload = await response.json();
    const parsed = new URL(String(payload?.origin || ''));
    const allowedHost = parsed.protocol === 'https:'
      && (parsed.hostname.endsWith('.trycloudflare.com') || parsed.hostname === 'control.3dvr.tech');
    if (!allowedHost) throw new Error('OVH control-plane address is invalid.');
    return parsed.origin;
  })().catch(error => {
    brokerOriginPromise = null;
    throw error;
  });
  return brokerOriginPromise;
}

async function brokerAction(action, extra = {}, proofExtra = extra) {
  const proof = await createSignedPortalProof('secrets-broker-owner', action, proofExtra);
  if (!proof) throw new Error('Sign in with your 3DVR owner account to manage machine access.');
  const brokerOrigin = await resolveBrokerOrigin();
  const response = await fetch(`${brokerOrigin}/api/secrets-broker`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...proof, action, ...extra }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.reason || 'Secrets broker request failed.');
  return payload;
}

async function createSecretHandoff(details) {
  const ttlMinutes = Math.max(10, Math.min(Number(details.ttlMinutes) || 1440, 10080));
  const normalized = {
    key: String(details.key || '').trim(),
    label: String(details.label || '').trim(),
    purpose: String(details.purpose || '').trim(),
    recipient: String(details.recipient || '').trim(),
    ttlMinutes,
  };
  const handoffRequestHash = await sha256(JSON.stringify([
    normalized.key,
    normalized.label,
    normalized.purpose,
    normalized.recipient,
    normalized.ttlMinutes,
  ]));
  const proof = await createSignedPortalProof('secret-handoff-owner', 'create', { handoffRequestHash });
  if (!proof) throw new Error('Sign in with your 3DVR owner account to create a secure request.');
  const brokerOrigin = await resolveBrokerOrigin();
  const response = await fetch(`${brokerOrigin}/api/secret-handoff`, {
    method: 'POST',
    mode: 'cors',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...proof, action: 'create', ...normalized }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Secure handoff request failed.');
  return payload;
}

function renderStatus(status) {
  const bitwarden = (status.backends || []).find(item => item.name === 'bitwarden');
  const openbao = (status.backends || []).find(item => item.name === 'openbao');
  const secretsReady = Boolean(openbao?.ready || bitwarden?.ready);
  setPill('controlNodeStatus', status.controlNode === 'ovh' ? 'OVH live' : 'Unexpected', status.controlNode === 'ovh' ? 'ready' : 'waiting');
  setPill('bitwardenStatus', openbao?.ready ? 'OpenBao connected' : bitwarden?.ready ? 'Bitwarden connected' : 'Setup needed', secretsReady ? 'ready' : 'waiting');
  setPill('auditStatus', status.audit?.ok ? 'Verified' : 'Attention', status.audit?.ok ? 'ready' : 'waiting');
  byId('auditDetail').textContent = status.audit?.ok ? `${status.audit.entries || 0} audit events; chain verified.` : 'Audit chain needs attention.';
  const enabledAgents = (status.agents || []).filter(agent => agent.enabled !== false);
  setPill('agentStatus', `${enabledAgents.length} active`, 'ready');
  byId('agentDetail').textContent = `${status.configuredSecrets || 0} secret policies · ${enabledAgents.length} scoped machine identities.`;
  const connected = secretsReady;
  byId('next-title').textContent = connected ? '3DVR Secrets connected ✓' : 'Create 3DVR machine access';
  byId('brokerDot').className = `status-dot ${connected ? 'ready' : 'attention'}`;
  if (approvalButton) {
    approvalButton.textContent = connected ? 'Connected ✓' : 'Connect Bitwarden';
    approvalButton.disabled = connected;
    approvalButton.setAttribute('aria-disabled', connected ? 'true' : 'false');
  }
  if (openSaveSecret) {
    openSaveSecret.disabled = !connected;
    openSaveSecret.setAttribute('aria-disabled', connected ? 'false' : 'true');
  }
  if (openSecretHandoff) {
    openSecretHandoff.disabled = !connected;
    openSecretHandoff.setAttribute('aria-disabled', connected ? 'false' : 'true');
  }
  byId('brokerMessage').textContent = connected
    ? `OVH broker is live and ${openbao?.ready ? 'OpenBao' : 'Bitwarden'} is connected. Agents can request scoped access through policy.`
    : 'OVH broker is live. A secrets backend still needs its one-time private setup.';
}

function renderApprovals(records = []) {
  setPill('approvalCount', records.length ? `${records.length} pending` : 'Clear', records.length ? 'waiting' : 'ready');
  if (!records.length) {
    approvalList.innerHTML = '<p class="muted">No pending secret approvals.</p>';
    return;
  }
  approvalList.innerHTML = records.map(item => `
    <article class="approval-item" data-approval-id="${escapeHtml(item.id)}">
      <div>
        <strong>${escapeHtml(item.secretAlias || 'Secret access')}</strong>
        <span>${escapeHtml(item.agent || 'agent')} · ${escapeHtml(item.capability || '')}</span>
        <small>${escapeHtml(item.scope || '')}</small>
        <p>${escapeHtml(item.purpose || '')}</p>
      </div>
      <div class="approval-actions">
        <button type="button" class="ghost" data-decision="deny">Deny</button>
        <button type="button" class="primary" data-decision="approve">Approve</button>
      </div>
    </article>`).join('');
}

async function loadAccess() {
  refreshButton?.setAttribute('disabled', '');
  const portalSession = await readPortalSession();
  try {
    const [status, approvals] = await Promise.all([
      brokerAction('status'),
      brokerAction('approvals'),
    ]);
    renderStatus(status);
    renderApprovals(approvals.approvals || []);
  } catch (error) {
    const signedIn = portalSession?.authenticated === true;
    byId('brokerMessage').textContent = signedIn
      ? 'Signed in. Routine browser credentials are available automatically; secure signing is only needed for sensitive approvals.'
      : error.message;
    setPill('controlNodeStatus', signedIn ? 'Owner session' : 'Unavailable', signedIn ? 'ready' : 'waiting');
    setPill('approvalCount', signedIn ? 'Automatic' : 'Unavailable', signedIn ? 'ready' : 'waiting');
    approvalList.innerHTML = signedIn
      ? '<p class="muted">Routine machine access is automatic. Sensitive recovery or root actions will appear here only when they truly need you.</p>'
      : `<p class="muted">${escapeHtml(error.message)}</p>`;
  } finally {
    refreshButton?.removeAttribute('disabled');
  }
}

approvalButton?.addEventListener('click', () => {
  if (typeof approvalDialog?.showModal === 'function') approvalDialog.showModal();
});

openSaveSecret?.addEventListener('click', () => {
  secretSaveMessage.textContent = '';
  if (typeof saveSecretDialog?.showModal === 'function') saveSecretDialog.showModal();
});

openSecretHandoff?.addEventListener('click', () => {
  handoffMessage.textContent = '';
  handoffResult.hidden = true;
  handoffLink.value = '';
  if (!handoffKey.value) handoffKey.value = 'CVW_N8N_API_KEY';
  if (!handoffLabel.value) handoffLabel.value = 'n8n API key';
  if (!handoffRecipient.value) handoffRecipient.value = 'Tom';
  if (!handoffPurpose.value) handoffPurpose.value = 'Connect CVW n8n securely to 3DVR';
  if (typeof secretHandoffDialog?.showModal === 'function') secretHandoffDialog.showModal();
});

createHandoff?.addEventListener('click', async () => {
  const details = {
    key: handoffKey?.value || '',
    label: handoffLabel?.value || '',
    recipient: handoffRecipient?.value || '',
    purpose: handoffPurpose?.value || '',
    ttlMinutes: handoffTtl?.value || 1440,
  };
  handoffMessage.textContent = '';
  if (!details.key.trim() || !details.label.trim()) {
    handoffMessage.textContent = 'Add a destination name and a human-readable label.';
    return;
  }
  createHandoff.disabled = true;
  try {
    const result = await createSecretHandoff(details);
    handoffLink.value = result.shareUrl || '';
    handoffResult.hidden = !handoffLink.value;
    handoffMessage.textContent = handoffLink.value
      ? 'Secure one-time link created. Send the link to the recipient normally.'
      : 'The request was created but no share link was returned.';
    byId('handoffCreateStatus').textContent = `Active request for ${details.label.trim()} ✓`;
  } catch (error) {
    handoffMessage.textContent = error.message;
  } finally {
    createHandoff.disabled = false;
  }
});

copyHandoffLink?.addEventListener('click', async () => {
  const value = handoffLink?.value || '';
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
    handoffMessage.textContent = 'Secure link copied.';
  } catch {
    handoffLink.focus();
    handoffLink.select();
    document.execCommand('copy');
    handoffMessage.textContent = 'Secure link copied.';
  }
});

saveSecret?.addEventListener('click', async () => {
  const key = secretKey?.value.trim() || '';
  const value = secretValue?.value || '';
  const note = secretNote?.value.trim() || '';
  secretSaveMessage.textContent = '';
  if (!key || !value) {
    secretSaveMessage.textContent = 'Add a name and value first.';
    return;
  }
  saveSecret.disabled = true;
  try {
    const secretValueHash = await sha256(value);
    const result = await brokerAction('store-secret', { key, value, note }, { secretKey: key, secretValueHash });
    if (!result?.ok || result?.decision !== 'allowed' || !result?.stored?.id) {
      throw new Error(result?.decision === 'approval_required'
        ? 'This save still needs approval. The value is still here so you can retry.'
        : '3DVR Secrets did not confirm the save. The value is still here so you can retry.');
    }
    if (secretValue) secretValue.value = '';
    if (secretKey) secretKey.value = '';
    if (secretNote) secretNote.value = '';
    const storedKey = result?.stored?.key || key;
    secretSaveMessage.textContent = `Saved ${storedKey} securely.`;
    secretSaveStatus.textContent = `Saved ${storedKey} ✓`;
    setTimeout(() => saveSecretDialog?.close(), 650);
    loadAccess();
  } catch (error) {
    secretSaveMessage.textContent = error.message;
  } finally {
    saveSecret.disabled = false;
  }
});

connectBitwarden?.addEventListener('click', async () => {
  const accessToken = bitwardenToken?.value || '';
  bitwardenSetupMessage.textContent = '';
  if (accessToken.length < 20) {
    bitwardenSetupMessage.textContent = 'Paste the Bitwarden machine access token first.';
    return;
  }
  connectBitwarden.disabled = true;
  try {
    const accessTokenHash = await sha256(accessToken);
    await brokerAction('configure-bitwarden', { accessToken }, { accessTokenHash });
    if (bitwardenToken) bitwardenToken.value = '';
    bitwardenSetupMessage.textContent = 'Connected. The token is now held by the OVH broker, not this page.';
    setTimeout(() => {
      approvalDialog?.close();
      loadAccess();
    }, 500);
  } catch (error) {
    bitwardenSetupMessage.textContent = error.message;
  } finally {
    connectBitwarden.disabled = false;
  }
});

refreshButton?.addEventListener('click', () => Promise.allSettled([loadAccess(), loadConnectionRegistry()]));

approvalList?.addEventListener('click', async event => {
  const button = event.target.closest('button[data-decision]');
  const item = button?.closest('[data-approval-id]');
  if (!button || !item) return;
  const decision = button.dataset.decision;
  const approvalId = item.dataset.approvalId;
  button.disabled = true;
  try {
    await brokerAction(decision, { approvalId });
    await loadAccess();
  } catch (error) {
    byId('brokerMessage').textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

Promise.allSettled([loadAccess(), loadConnectionRegistry()]);
