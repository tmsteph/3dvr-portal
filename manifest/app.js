const storageKey = '3dvr.manifest.dailyCard.v1';

const form = document.getElementById('manifestDailyForm');
const copyButton = document.getElementById('copyManifestCard');
const clearButton = document.getElementById('clearManifestCard');
const statusText = document.getElementById('manifestStatus');
const fields = {
  want: document.getElementById('manifestWant'),
  why: document.getElementById('manifestWhy'),
  block: document.getElementById('manifestBlock'),
  action: document.getElementById('manifestAction'),
  evidence: document.getElementById('manifestEvidence')
};

function readCard() {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.value.trim()])
  );
}

function writeCard(card = {}) {
  Object.entries(fields).forEach(([key, field]) => {
    field.value = card[key] || '';
  });
}

function saveCard(card) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(card));
    statusText.textContent = 'Daily card saved on this device. Continue in Life OS when you want to track follow-through.';
  } catch (error) {
    statusText.textContent = 'Storage is unavailable. Copy the card before leaving.';
  }
}

function loadCard() {
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw) {
      writeCard(JSON.parse(raw));
      statusText.textContent = 'Loaded your saved daily card from this device.';
    }
  } catch (error) {
    statusText.textContent = 'Saved card could not be loaded. You can still write or copy a new one.';
  }
}

function formatCard(card) {
  return [
    '3DVR Reality Builder daily card',
    `What do I want? ${card.want || '(not set)'}`,
    `Why does it matter? ${card.why || '(not set)'}`,
    `What blocks me? ${card.block || '(not set)'}`,
    `What will I do today? ${card.action || '(not set)'}`,
    `What evidence did I notice? ${card.evidence || '(not set)'}`
  ].join('\n');
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  saveCard(readCard());
});

copyButton.addEventListener('click', async () => {
  const card = readCard();
  try {
    await navigator.clipboard.writeText(formatCard(card));
    statusText.textContent = 'Daily card copied to clipboard.';
  } catch (error) {
    statusText.textContent = 'Copy is unavailable. Select the fields manually instead.';
  }
});

clearButton.addEventListener('click', () => {
  writeCard();
  try {
    window.localStorage.removeItem(storageKey);
  } catch (error) {
    // Keep the form usable when storage is blocked.
  }
  statusText.textContent = 'Daily card cleared from this device.';
});

loadCard();
