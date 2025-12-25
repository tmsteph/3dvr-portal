const DEFAULT_PEERS = [
  'wss://relay.3dvr.tech/gun',
  'wss://gun-relay-3dvr.fly.dev/gun'
];

function setupAudienceForm() {
  const form = document.querySelector('[data-audience-form]');
  if (!form) {
    return;
  }

  const status = document.querySelector('[data-form-status]');
  const audienceKey = form.dataset.audienceKey;
  const audienceLabel = form.dataset.audienceLabel || audienceKey;
  const sourceLabel = form.dataset.sourceLabel || 'Ideas Lab audience test';
  const questionLabel = form.dataset.questionLabel || 'Optional prompt';

  const gun = Gun(window.__GUN_PEERS__ || DEFAULT_PEERS);

  // Node shape:
  // 3dvr-audience-tests/v1/{audienceKey}/signups -> { id, name, email, prompt, promptLabel, source, audienceLabel, createdAt }
  const signups = gun
    .get('3dvr-audience-tests')
    .get('v1')
    .get(audienceKey)
    .get('signups');

  function setStatus(message, tone = 'info') {
    if (!status) {
      return;
    }
    status.textContent = message;
    status.dataset.tone = tone;
  }

  function trim(value) {
    return String(value || '').trim();
  }

  function putAsync(node, data) {
    return new Promise((resolve, reject) => {
      node.set(data, ack => {
        if (ack && ack.err) {
          reject(new Error(ack.err));
        } else {
          resolve(ack);
        }
      });
    });
  }

  form.addEventListener('submit', event => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = trim(formData.get('name'));
    const email = trim(formData.get('email'));
    const prompt = trim(formData.get('prompt'));

    if (!name || !email) {
      setStatus('Please add your name and email so we can keep you in the loop.', 'error');
      return;
    }

    const payload = {
      id: crypto.randomUUID ? crypto.randomUUID() : `audience-${Date.now()}`,
      name,
      email,
      prompt,
      promptLabel: questionLabel,
      source: sourceLabel,
      audienceKey,
      audienceLabel,
      createdAt: new Date().toISOString(),
      referrer: document.referrer || 'direct'
    };

    setStatus('Sending your note…', 'info');

    putAsync(signups, payload)
      .then(() => {
        form.reset();
        setStatus('Thanks. You are on the early list.', 'success');
      })
      .catch(error => {
        console.error('Audience signup failed', error);
        setStatus('Something went wrong. Please try again in a moment.', 'error');
      });
  });
}

document.addEventListener('DOMContentLoaded', setupAudienceForm);
