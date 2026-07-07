(function () {
  const storageKey = '3dvr:offer-garden:v1';

  const form = document.querySelector('#offer-form');
  const skillInput = document.querySelector('#skill');
  const personInput = document.querySelector('#person');
  const resultInput = document.querySelector('#result');
  const priceInput = document.querySelector('#price');
  const resetButton = document.querySelector('#reset-offer');
  const saveButton = document.querySelector('#save-offer');
  const copyButton = document.querySelector('#copy-message');
  const status = document.querySelector('#status');

  const cardTitle = document.querySelector('#card-title');
  const cardLine = document.querySelector('#card-line');
  const cardPerson = document.querySelector('#card-person');
  const cardResult = document.querySelector('#card-result');
  const cardPrice = document.querySelector('#card-price');
  const shareMessage = document.querySelector('#share-message');

  function clean(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }

  function readDraft() {
    return {
      skill: clean(skillInput.value),
      person: clean(personInput.value),
      result: clean(resultInput.value),
      price: clean(priceInput.value),
      updatedAt: new Date().toISOString(),
    };
  }

  function setStatus(message, tone) {
    status.textContent = message;
    if (tone) {
      status.dataset.tone = tone;
    } else {
      delete status.dataset.tone;
    }
  }

  function buildShareMessage(draft) {
    const skill = draft.skill || 'a small offer';
    const person = draft.person || 'people who may need this';
    const result = draft.result || 'a small win';
    const price = draft.price || 'a starter price';

    return [
      `I am testing a simple offer: ${skill}.`,
      `It is for ${person}.`,
      `You get ${result}.`,
      `It starts at ${price}.`,
      'Want to take a quick look?'
    ].join('\n');
  }

  function render(draft) {
    const skill = draft.skill || 'Your simple offer';
    const person = draft.person || 'Someone who needs this';
    const result = draft.result || 'A small win';
    const price = draft.price || 'Pick a fair starter price';

    cardTitle.textContent = skill;
    cardLine.textContent = draft.skill
      ? 'A clear first offer you can test with one person.'
      : 'Tell us what you can help with. We will turn it into a clear first offer.';
    cardPerson.textContent = person;
    cardResult.textContent = result;
    cardPrice.textContent = price;
    shareMessage.value = buildShareMessage(draft);
  }

  function saveDraft(draft) {
    localStorage.setItem(storageKey, JSON.stringify(draft));
  }

  function loadDraft() {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || 'null');
    } catch {
      return null;
    }
  }

  function fillForm(draft) {
    if (!draft) return;
    skillInput.value = draft.skill || '';
    personInput.value = draft.person || '';
    resultInput.value = draft.result || '';
    priceInput.value = draft.price || '';
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    shareMessage.focus();
    shareMessage.select();
    document.execCommand('copy');
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const draft = readDraft();
    render(draft);
    saveDraft(draft);
    setStatus('Launch Card made. Share it with one person.', 'good');
  });

  [skillInput, personInput, resultInput, priceInput].forEach((input) => {
    input.addEventListener('input', () => {
      render(readDraft());
    });
  });

  saveButton.addEventListener('click', () => {
    saveDraft(readDraft());
    setStatus('Draft saved on this device.', 'good');
  });

  resetButton.addEventListener('click', () => {
    form.reset();
    localStorage.removeItem(storageKey);
    render({});
    setStatus('Cleared.', 'warn');
  });

  copyButton.addEventListener('click', async () => {
    try {
      await copyText(shareMessage.value);
      setStatus('Message copied.', 'good');
    } catch {
      setStatus('Copy did not work. Select the message and copy it.', 'warn');
    }
  });

  const saved = loadDraft();
  fillForm(saved);
  render(saved || {});
})();
