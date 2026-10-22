import { createSignedPortalProof } from '../forge.js';
import { createHostedPilotClient } from '../hosted-pilot-client.js';

const form = document.querySelector('#pilot-form');
const status = document.querySelector('#pilot-status');
const result = document.querySelector('#pilot-result');
const button = document.querySelector('#pilot-submit');
const cancel = document.querySelector('#pilot-cancel');
const check = document.querySelector('#pilot-check');
const client = createHostedPilotClient({ sign: createSignedPortalProof });

function show(message, data = '') {
  status.textContent = message;
  result.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}
async function refresh(taskId) {
  const task = await client.status(taskId);
  show('Task: ' + task.status, task.result || '');
  cancel.hidden = !['queued', 'running'].includes(task.status);
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
    check.hidden = false;
    cancel.hidden = !['queued', 'running'].includes(task.status);
    cancel.onclick = async () => {
      cancel.disabled = true;
      check.disabled = true;
      button.disabled = true;
      try {
        const stopped = await client.cancel(task.id);
        show('Task: ' + stopped.status);
        cancel.hidden = true;
      } catch (error) {
        show(error.message);
      } finally {
        cancel.disabled = false;
        check.disabled = false;
        button.disabled = false;
      }
    };
    check.onclick = async () => {
      check.disabled = true;
      cancel.disabled = true;
      button.disabled = true;
      try { await refresh(task.id); }
      catch (error) { show(error.message); }
      finally { check.disabled = false; cancel.disabled = false; button.disabled = false; }
    };
  } catch (error) {
    show(error.message === 'not_found' ? 'Hosted pilot is not enabled on this server.' : error.message);
  } finally {
    button.disabled = false;
  }
});
