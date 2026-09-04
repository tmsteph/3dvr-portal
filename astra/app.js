import { createOperatorDeveloperProof } from '../operator/forge.js';

const form = document.getElementById('astra-form');
const promptInput = document.getElementById('prompt');
const effortInput = document.getElementById('effort');
const sendButton = document.getElementById('send');
const result = document.getElementById('result');

function show(value) {
  result.textContent = String(value || '');
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  sendButton.disabled = true;
  show('Signing owner proof...');

  try {
    const developerAuth = await createOperatorDeveloperProof();
    if (!developerAuth) {
      throw new Error('Sign in to the 3DVR Portal with the owner account first.');
    }

    show('Asking GPT-6 Astra...');
    const response = await fetch('/api/openai-site?provider=astra', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptInput.value,
        reasoningEffort: effortInput.value,
        developerAuth
      })
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Astra canary returned HTTP ${response.status}.`);
    }

    show([
      `Astra available: ${payload.available === true ? 'yes' : 'no'}`,
      `Transport: ${payload.transport || 'unknown'}`,
      `Reasoning: ${payload.reasoningEffort || 'unknown'}`,
      '',
      payload.text || '(No text returned.)'
    ].join('\n'));
  } catch (error) {
    show(`Not available yet: ${error.message || error}`);
  } finally {
    sendButton.disabled = false;
  }
});
