import { createSignedPortalProof } from '../forge.js';
import { createHostedPilotClient } from '../hosted-pilot-client.js';

const form = document.querySelector('#pilot-form');
const status = document.querySelector('#pilot-status');
const result = document.querySelector('#pilot-result');
const button = document.querySelector('#pilot-submit');
const client = createHostedPilotClient({ sign: createSignedPortalProof });

function show(message, data = '') {
  status.textContent = message;
  result.textContent = data;
}
async function refresh(taskId) {
  const task = await client.status(taskId);
  show('Task: ' + task.status, task.result || '');
  return task;
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  show('Signing request…');
  try {
    const repository = document.querySelector('#pilot-repository').value.trim();
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error('Enter owner/repository.');
    const idempotencyKey = crypto.randomUUID();
    const task = await client.submit(repository, idempotencyKey);
    show('Task queued: ' + task.id);
    const check = document.querySelector('#pilot-check');
    check.hidden = false;
    check.onclick = async () => {
      check.disabled = true;
      try { await refresh(task.id); }
      catch (error) { show(error.message); }
      finally { check.disabled = false; }
    };
  } catch (error) {
    show(error.message === 'not_found' ? 'Hosted pilot is not enabled on this server.' : error.message);
  } finally {
    button.disabled = false;
  }
});
