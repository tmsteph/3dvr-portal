import { createSignedPortalProof } from '/operator/forge.js';

const byId = id => document.getElementById(id);
const approvalDialog = byId('approvalDialog');
const approvalButton = byId('bitwardenApproval');
const refreshButton = byId('refreshAccess');
const approvalList = byId('approvalList');
const bitwardenToken = byId('bitwardenToken');
const connectBitwarden = byId('connectBitwarden');
const bitwardenSetupMessage = byId('bitwardenSetupMessage');

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

async function sha256(value) {
  const bytes = new TextEncoder().encode(String(value || ''));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function brokerAction(action, extra = {}, proofExtra = extra) {
  const proof = await createSignedPortalProof('secrets-broker-owner', action, proofExtra);
  if (!proof) throw new Error('Sign in with your 3DVR owner account to manage machine access.');
  const response = await fetch('/api/secrets-broker', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...proof, action, ...extra }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || payload.reason || 'Secrets broker request failed.');
  return payload;
}

function renderStatus(status) {
  const bitwarden = (status.backends || []).find(item => item.name === 'bitwarden');
  setPill('controlNodeStatus', status.controlNode === 'ovh' ? 'OVH live' : 'Unexpected', status.controlNode === 'ovh' ? 'ready' : 'waiting');
  setPill('bitwardenStatus', bitwarden?.ready ? 'Connected' : 'Setup needed', bitwarden?.ready ? 'ready' : 'waiting');
  setPill('auditStatus', status.audit?.ok ? 'Verified' : 'Attention', status.audit?.ok ? 'ready' : 'waiting');
  byId('auditDetail').textContent = status.audit?.ok ? `${status.audit.entries || 0} audit events; chain verified.` : 'Audit chain needs attention.';
  const enabledAgents = (status.agents || []).filter(agent => agent.enabled !== false);
  setPill('agentStatus', `${enabledAgents.length} active`, 'ready');
  byId('agentDetail').textContent = `${status.configuredSecrets || 0} secret policies · ${enabledAgents.length} scoped machine identities.`;
  byId('brokerMessage').textContent = bitwarden?.ready
    ? 'OVH broker is live. Agents can request scoped access; owner approval remains the gate.'
    : 'OVH broker is live. Bitwarden machine access still needs its one-time private handoff.';
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
  try {
    const [status, approvals] = await Promise.all([
      brokerAction('status'),
      brokerAction('approvals'),
    ]);
    renderStatus(status);
    renderApprovals(approvals.approvals || []);
  } catch (error) {
    byId('brokerMessage').textContent = error.message;
    setPill('controlNodeStatus', 'Unavailable', 'waiting');
    setPill('approvalCount', 'Unavailable', 'waiting');
    approvalList.innerHTML = `<p class="muted">${escapeHtml(error.message)}</p>`;
  } finally {
    refreshButton?.removeAttribute('disabled');
  }
}
approvalButton?.addEventListener('click', () => {
  if (typeof approvalDialog?.showModal === 'function') approvalDialog.showModal();
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

refreshButton?.addEventListener('click', loadAccess);

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

loadAccess();
