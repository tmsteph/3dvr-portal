const form = document.getElementById('nicheForm');
const clearButton = document.getElementById('clearNiche');
const valueMap = document.getElementById('valueMap');
const valueMapBody = document.getElementById('valueMapBody');
const copyButton = document.getElementById('copyValueMap');

const fields = ['asked', 'learned', 'energy', 'teach', 'problem'];
const labels = {
  asked: 'People already trust me for',
  learned: 'Hard-earned knowledge',
  energy: 'Energy / curiosity',
  teach: 'Something I can teach now',
  problem: 'A problem I keep noticing'
};

const storageKey = '3dvr-human-value-network';

function getValues() {
  return Object.fromEntries(fields.map((name) => [name, form.elements[name].value.trim()]));
}

function saveDraft() {
  localStorage.setItem(storageKey, JSON.stringify(getValues()));
}

function restoreDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    fields.forEach((name) => {
      if (saved[name]) form.elements[name].value = saved[name];
    });
  } catch {
    localStorage.removeItem(storageKey);
  }
}

function buildMap(values) {
  const entries = fields.filter((name) => values[name]);
  valueMapBody.innerHTML = '';

  const dl = document.createElement('dl');
  entries.forEach((name) => {
    const wrapper = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = labels[name];
    dd.textContent = values[name];
    wrapper.append(dt, dd);
    dl.append(wrapper);
  });

  const experiment = document.createElement('p');
  experiment.innerHTML = '<strong>Next experiment:</strong> Pick one person with a real need and offer one small useful outcome. Learn from the exchange before trying to build a whole business.';

  valueMapBody.append(dl, experiment);
}

function mapAsText() {
  const values = getValues();
  const lines = ['3DVR HUMAN VALUE MAP', ''];
  fields.forEach((name) => {
    if (values[name]) lines.push(`${labels[name]}:\n${values[name]}\n`);
  });
  lines.push('Next experiment: Pick one person with a real need and offer one small useful outcome. Learn from the exchange before building a whole business.');
  return lines.join('\n');
}

form.addEventListener('input', saveDraft);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const values = getValues();
  if (!fields.some((name) => values[name])) {
    form.elements.asked.focus();
    return;
  }

  buildMap(values);
  valueMap.hidden = false;
  valueMap.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

clearButton.addEventListener('click', () => {
  form.reset();
  valueMap.hidden = true;
  valueMapBody.innerHTML = '';
  localStorage.removeItem(storageKey);
  form.elements.asked.focus();
});

copyButton.addEventListener('click', async () => {
  const original = copyButton.textContent;
  try {
    await navigator.clipboard.writeText(mapAsText());
    copyButton.textContent = 'Copied';
  } catch {
    copyButton.textContent = 'Select and copy instead';
  }
  window.setTimeout(() => {
    copyButton.textContent = original;
  }, 1800);
});

restoreDraft();
