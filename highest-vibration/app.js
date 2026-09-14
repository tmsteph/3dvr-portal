const DIMENSIONS = [
  ['body', 'Body', 'Rest, nourishment, breath, movement', '/life/'],
  ['mind', 'Mind', 'Clarity, learning, focus, less noise', '/life/'],
  ['heart', 'Heart', 'Love, gratitude, forgiveness, connection', '/contacts/'],
  ['spirit', 'Spirit', 'Prayer, meditation, awe, silence, meaning', '/life-space/'],
  ['environment', 'Environment', 'Light, nature, beauty, supportive space', '/home/'],
  ['purpose', 'Purpose', 'Knowing what matters and why', '/launch-room/'],
  ['creation', 'Creation', 'Turning inner possibility into something real', '/forge/'],
  ['service', 'Service', 'Using your gifts to improve another life', '/community/'],
  ['community', 'Community', 'People who help one another grow', '/assembly/'],
];

const STORAGE_KEY = '3dvr.highest-vibration.v1';
const dimensionsRoot = document.getElementById('dimensions');
const form = document.getElementById('vibrationForm');
const intention = document.getElementById('intention');
const reflection = document.getElementById('reflection');
const reflectionTitle = document.getElementById('reflectionTitle');
const reflectionBody = document.getElementById('reflectionBody');
const reflectionActions = document.getElementById('reflectionActions');
const resetButton = document.getElementById('resetButton');

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }));
}

function renderDimensions() {
  const saved = loadState();
  dimensionsRoot.innerHTML = DIMENSIONS.map(([id, label, hint]) => {
    const value = Number(saved.values?.[id] || 3);
    return `<label class="dimension" for="${id}">
      <span class="dimension-head"><strong>${label}</strong><output id="${id}Value">${value}</output></span>
      <span class="hint">${hint}</span>
      <input id="${id}" name="${id}" type="range" min="1" max="5" step="1" value="${value}" aria-describedby="${id}Value">
    </label>`;
  }).join('');
  intention.value = saved.intention || '';
  DIMENSIONS.forEach(([id]) => {
    const input = document.getElementById(id);
    input.addEventListener('input', () => { document.getElementById(`${id}Value`).value = input.value; });
  });
}

function collectValues() {
  return Object.fromEntries(DIMENSIONS.map(([id]) => [id, Number(document.getElementById(id).value)]));
}

function reflect(values) {
  const ordered = DIMENSIONS.map(([id, label, hint, href]) => ({ id, label, hint, href, value: values[id] })).sort((a, b) => a.value - b.value);
  const lowest = ordered[0];
  const strongest = [...ordered].sort((a, b) => b.value - a.value)[0];
  const average = ordered.reduce((sum, item) => sum + item.value, 0) / ordered.length;
  const phrase = average >= 4 ? 'You are reporting a strong, supported state.' : average >= 3 ? 'There is a workable center here.' : 'Your system may be asking for gentleness before ambition.';
  reflectionTitle.textContent = phrase;
  reflectionBody.textContent = `${lowest.label} is the quietest signal today. ${strongest.label} looks like a source of support. Rather than optimize everything, choose one small action that helps ${lowest.label.toLowerCase()} feel safer, clearer, or more alive.`;
  reflectionActions.innerHTML = `<a href="${lowest.href}">Support ${lowest.label} →</a><a href="/launch-room/">Turn clarity into movement →</a>`;
  reflection.hidden = false;
  reflection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const values = collectValues();
  saveState({ values, intention: intention.value.trim() });
  reflect(values);
});

resetButton.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  reflection.hidden = true;
  renderDimensions();
});

renderDimensions();
