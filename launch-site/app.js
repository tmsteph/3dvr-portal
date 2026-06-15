import { readDefaultSecret } from '../web-builder-app/defaults.js';

const gun = window.Gun ? Gun({ peers: window.__GUN_PEERS__ || undefined }) : null;
const defaultsNode = gun?.get('3dvr-portal')?.get('ai-workbench')?.get('defaults');

const form = document.getElementById('site-form');
const businessNameInput = document.getElementById('business-name');
const purposeInput = document.getElementById('site-purpose');
const audienceInput = document.getElementById('site-audience');
const actionInput = document.getElementById('site-action');
const styleInput = document.getElementById('site-style');
const slugInput = document.getElementById('site-slug');
const notesInput = document.getElementById('site-notes');
const revisionInput = document.getElementById('revision-request');
const generateButton = document.getElementById('generate-site');
const reviseButton = document.getElementById('revise-site');
const publishButton = document.getElementById('publish-site');
const statusBox = document.getElementById('launcher-status');
const previewFrame = document.getElementById('site-preview');
const previewTitle = document.getElementById('preview-title');
const publishResult = document.getElementById('publish-result');

const statusClasses = ['status--info', 'status--success', 'status--warning', 'status--error'];
const draftStorageKey = 'site-launcher-current-draft';
const sharedDefaultsWaitMs = 6000;

let currentHtml = '';
let currentTitle = '';
let lastPrompt = '';
let sharedSecrets = {
  openai: '',
  vercel: ''
};
const sharedSecretResolvers = {
  openai: [],
  vercel: []
};
const defaultButtonText = {
  generate: 'Generate Site',
  revise: 'Revise Draft',
  publish: 'Publish'
};

renderEmptyPreview();
hydrateStoredDraft();
subscribeToSharedDefaults();
wireEvents();

function wireEvents() {
  businessNameInput.addEventListener('input', () => {
    if (!slugInput.value.trim()) {
      slugInput.value = sanitizeSlug(businessNameInput.value);
    }
  });

  slugInput.addEventListener('input', () => {
    const start = slugInput.selectionStart;
    slugInput.value = sanitizeSlug(slugInput.value);
    slugInput.setSelectionRange(start, start);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    generateSite();
  });

  reviseButton.addEventListener('click', reviseSite);
  publishButton.addEventListener('click', publishSite);
}

function collectFormState() {
  return {
    businessName: businessNameInput.value.trim(),
    purpose: purposeInput.value.trim(),
    audience: audienceInput.value.trim(),
    action: actionInput.value.trim(),
    style: styleInput.value,
    slug: sanitizeSlug(slugInput.value),
    notes: notesInput.value.trim()
  };
}

function sanitizeSlug(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 48);
}

function subscribeToSharedDefaults() {
  if (!defaultsNode) {
    resolveSharedSecretWaiters('openai');
    resolveSharedSecretWaiters('vercel');
    return;
  }

  defaultsNode.on(data => {
    if (!hasDefaultRecord(data)) {
      return;
    }

    sharedSecrets = {
      openai: readDefaultSecret(data, 'openai'),
      vercel: readDefaultSecret(data, 'vercel')
    };
    if (sharedSecrets.openai) {
      resolveSharedSecretWaiters('openai');
    }
    if (sharedSecrets.vercel) {
      resolveSharedSecretWaiters('vercel');
    }
  });
}

function hasDefaultRecord(data) {
  return Boolean(
    data &&
    typeof data === 'object' &&
    Object.keys(data).some(key => key !== '_')
  );
}

function resolveSharedSecretWaiters(targetKey) {
  const waiters = sharedSecretResolvers[targetKey] || [];
  while (waiters.length) {
    waiters.shift()?.();
  }
}

function wait(ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms);
  });
}

async function waitForSharedSecret(targetKey, message) {
  if (sharedSecrets[targetKey]) {
    return true;
  }

  if (!defaultsNode) {
    return false;
  }

  setStatus(message, 'info');
  await Promise.race([
    new Promise(resolve => {
      sharedSecretResolvers[targetKey]?.push(resolve);
    }),
    wait(sharedDefaultsWaitMs)
  ]);

  return Boolean(sharedSecrets[targetKey]);
}

function buildPrompt(state) {
  return [
    `Create a polished one-page website for "${state.businessName}".`,
    `The site address will be ${state.slug}.3dvr.tech.`,
    `Offer: ${state.purpose}.`,
    state.audience ? `Audience: ${state.audience}.` : '',
    state.action ? `Primary action: ${state.action}.` : 'Primary action: contact the business.',
    `Visual direction: ${state.style}.`,
    state.notes ? `Important details: ${state.notes}.` : '',
    'Include a hero, clear offer section, trust section, contact/action section, and footer.',
    'Use realistic public-facing copy based only on details provided. Do not invent phone numbers, addresses, prices, certifications, or reviews.',
    'Return json with title, summary, and html keys. The html must be a complete standalone HTML document with inline CSS only.'
  ].filter(Boolean).join('\n');
}

function buildRevisionPrompt(revisionRequest) {
  return [
    'Revise this website draft.',
    `Revision request: ${revisionRequest}`,
    'Return json with title, summary, and html keys. The html must be the complete updated document.',
    'Current HTML:',
    currentHtml
  ].join('\n\n');
}

async function generateSite() {
  const state = collectFormState();
  slugInput.value = state.slug;

  if (!state.businessName || !state.purpose || !state.slug) {
    setStatus('Name, offer, and address are required.', 'warning');
    return;
  }

  lastPrompt = buildPrompt(state);
  await requestSiteDraft(lastPrompt, 'Preparing site draft...', 'generate');
}

async function reviseSite() {
  const revisionRequest = revisionInput.value.trim();
  if (!currentHtml) {
    setStatus('Generate a draft first.', 'warning');
    return;
  }
  if (!revisionRequest) {
    setStatus('Add a revision request.', 'warning');
    revisionInput.focus();
    return;
  }

  await requestSiteDraft(buildRevisionPrompt(revisionRequest), 'Preparing revision...', 'revise');
  revisionInput.value = '';
}

async function requestSiteDraft(prompt, message, operation = 'generate') {
  setBusy(true, operation);
  setStatus(message, 'info');
  publishResult.innerHTML = '';

  try {
    await waitForSharedSecret('openai', 'Loading shared site generator key...');
    setStatus(operation === 'revise'
      ? 'Sending revision request to the site generator...'
      : 'Sending site request to the generator...', 'info');
    const response = await fetch('/api/openai-site', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model: 'gpt-4.1-mini',
        ...(sharedSecrets.openai ? { apiKey: sharedSecrets.openai } : {})
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || 'The site generator is not available.');
    }

    setStatus('Rendering the preview...', 'info');
    currentHtml = result.html || '';
    currentTitle = result.title || collectFormState().businessName || 'Website draft';
    previewTitle.textContent = currentTitle;
    previewFrame.srcdoc = currentHtml;
    setStatus(result.summary || 'Draft ready.', 'success');
    setDraftControlsEnabled(true);
    storeDraft();
  } catch (error) {
    setStatus(error.message || 'Unable to generate the site.', 'error');
  } finally {
    setBusy(false);
  }
}

async function publishSite() {
  const state = collectFormState();
  slugInput.value = state.slug;

  if (!currentHtml) {
    setStatus('Generate a draft first.', 'warning');
    return;
  }
  if (!state.slug) {
    setStatus('Choose an address before publishing.', 'warning');
    slugInput.focus();
    return;
  }

  setBusy(true, 'publish');
  setStatus(`Publishing ${state.slug}.3dvr.tech...`, 'info');
  publishResult.innerHTML = '';

  try {
    await waitForSharedSecret('vercel', 'Loading shared publishing key...');
    setStatus('Creating the deployment in the 3dvr workspace and assigning the address...', 'info');
    const response = await fetch('/api/vercel-deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName: `3dvr-${state.slug}`,
        subdomain: state.slug,
        html: currentHtml,
        title: currentTitle,
        ...(sharedSecrets.vercel ? { token: sharedSecrets.vercel } : {})
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result?.error || 'Publishing failed.');
    }

    setStatus('Preparing the live link...', 'info');
    const liveUrl = result.aliasUrl || result.url || result.inspectUrl;
    if (liveUrl) {
      publishResult.innerHTML = `Live: <a href="${escapeAttribute(liveUrl)}" target="_blank" rel="noopener">${escapeHtml(liveUrl)}</a>`;
      if (result.aliasError) {
        publishResult.innerHTML += [
          '<span class="publish-note">',
          `The 3dvr.tech address was not attached yet. ${escapeHtml(formatAliasError(result))}`,
          '</span>'
        ].join('');
        setStatus('Published on Vercel. The 3dvr.tech address still needs domain setup.', 'warning');
      } else {
        setStatus('Published.', 'success');
      }
    } else {
      setStatus('Published, but no live URL was returned.', 'warning');
    }
  } catch (error) {
    setStatus(error.message || 'Unable to publish the site.', 'error');
  } finally {
    setBusy(false);
  }
}

function formatAliasError(result = {}) {
  if (result.aliasErrorCode === 'domain_not_found') {
    const domain = result.alias || `${collectFormState().slug}.3dvr.tech`;
    return `${domain} is not available in the Vercel team yet.`;
  }
  return result.aliasError || 'Custom address setup failed.';
}

function setBusy(isBusy, operation = '') {
  form.setAttribute('aria-busy', isBusy ? 'true' : 'false');
  generateButton.disabled = isBusy;
  reviseButton.disabled = isBusy || !currentHtml;
  publishButton.disabled = isBusy || !currentHtml;

  generateButton.textContent = operation === 'generate' && isBusy ? 'Generating...' : defaultButtonText.generate;
  reviseButton.textContent = operation === 'revise' && isBusy ? 'Revising...' : defaultButtonText.revise;
  publishButton.textContent = operation === 'publish' && isBusy ? 'Publishing...' : defaultButtonText.publish;
}

function setDraftControlsEnabled(enabled) {
  revisionInput.disabled = !enabled;
  reviseButton.disabled = !enabled;
  publishButton.disabled = !enabled;
}

function setStatus(message, tone = 'info') {
  statusBox.textContent = message;
  statusBox.classList.remove(...statusClasses);
  statusBox.classList.add(`status--${tone}`);
}

function renderEmptyPreview() {
  previewFrame.srcdoc = [
    '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;',
    'font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f4f7f5;color:#17231d;}',
    '.empty{max-width:520px;text-align:center}.empty p{line-height:1.6;color:#52645b}</style></head>',
    '<body><main class="empty"><h1>Website preview</h1><p>Your generated draft will appear here.</p></main></body></html>'
  ].join('');
}

function storeDraft() {
  try {
    localStorage.setItem(draftStorageKey, JSON.stringify({
      html: currentHtml,
      title: currentTitle,
      prompt: lastPrompt,
      form: collectFormState(),
      updatedAt: Date.now()
    }));
  } catch (error) {
    // Local draft history is optional.
  }
}

function hydrateStoredDraft() {
  try {
    const raw = localStorage.getItem(draftStorageKey);
    if (!raw) return;
    const draft = JSON.parse(raw);
    if (!draft?.html) return;

    currentHtml = draft.html;
    currentTitle = draft.title || 'Website draft';
    lastPrompt = draft.prompt || '';

    const formState = draft.form || {};
    businessNameInput.value = formState.businessName || '';
    purposeInput.value = formState.purpose || '';
    audienceInput.value = formState.audience || '';
    actionInput.value = formState.action || '';
    styleInput.value = formState.style || styleInput.value;
    slugInput.value = formState.slug || '';
    notesInput.value = formState.notes || '';

    previewTitle.textContent = currentTitle;
    previewFrame.srcdoc = currentHtml;
    setDraftControlsEnabled(true);
    setStatus('Draft restored.', 'info');
  } catch (error) {
    renderEmptyPreview();
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
