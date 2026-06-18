const STORAGE_KEY = '3dvr.launch-room.movement-brief.v1';

const form = document.getElementById('movementBriefForm');
const clearButton = document.querySelector('[data-action="clear"]');
const copyButton = document.querySelector('[data-action="copy"]');
const downloadButton = document.querySelector('[data-action="download"]');
const status = document.getElementById('draftStatus');
const fields = {
  movementName: document.getElementById('movementName'),
  worldPain: document.getElementById('worldPain'),
  worldWish: document.getElementById('worldWish'),
  firstAudience: document.getElementById('firstAudience'),
  tinyProject: document.getElementById('tinyProject')
};
const briefTargets = {
  movementName: document.querySelector('[data-brief="movementName"]'),
  mission: document.querySelector('[data-brief="mission"]'),
  worldview: document.querySelector('[data-brief="worldview"]'),
  audience: document.querySelector('[data-brief="audience"]'),
  tinyProject: document.querySelector('[data-brief="tinyProject"]'),
  checklist: document.querySelector('[data-brief="checklist"]'),
  actions: document.querySelector('[data-brief="actions"]')
};

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function titleCase(value) {
  return clean(value)
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function fallback(value, phrase) {
  return clean(value) || phrase;
}

function loadDraft() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveDraft(state) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Local-only draft persistence should fail quietly.
  }
}

function getState() {
  return Object.fromEntries(
    Object.entries(fields).map(([key, input]) => [key, input.value])
  );
}

function setState(state) {
  Object.entries(fields).forEach(([key, input]) => {
    input.value = state[key] || '';
  });
}

function asSentence(text) {
  const normalized = clean(text);
  return normalized ? `${normalized.replace(/[.?!]+$/, '')}.` : '';
}

function slugify(text) {
  const slug = clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'movement-brief';
}

function buildBrief(state) {
  const movementName = titleCase(state.movementName) || 'Your movement';
  const worldPain = fallback(state.worldPain, 'the pattern you are ready to change');
  const worldWish = fallback(state.worldWish, 'a better option that is easier to live inside');
  const audience = fallback(state.firstAudience, 'the first people who need this most');
  const tinyProject = fallback(state.tinyProject, 'a tiny version that can exist this week');

  return {
    movementName,
    mission: `We are building ${movementName} to move beyond ${worldPain} and make ${worldWish} real for ${audience}.`,
    worldview: `This matters because ${worldPain} keeps showing up while ${worldWish} stays out of reach. The movement gives people a clearer direction, and the tiny project proves the idea can become real without waiting for permission.`,
    audience,
    tinyProject,
    checklist: [
      `Write the movement in one sentence: ${movementName}.`,
      `Keep the first audience narrow: ${audience}.`,
      `Build the tiny version this week: ${tinyProject}.`,
      'Share it with a few real people and note what feels true.',
      'Use the feedback to tighten the next version instead of expanding too soon.'
    ],
    actions: [
      `Today: turn the idea into one short paragraph and keep it visible.`,
      `This week: ship ${asSentence(tinyProject).slice(0, -1) || 'the tiny version'}.`,
      `Next: show it to ${audience} and capture the first response.`
    ]
  };
}

function briefToMarkdown(brief) {
  return [
    `# ${brief.movementName}`,
    '',
    '## Mission',
    brief.mission,
    '',
    '## Worldview / Why This Matters',
    brief.worldview,
    '',
    '## First Audience',
    brief.audience,
    '',
    '## First Tiny Project',
    brief.tinyProject,
    '',
    '## Launch Checklist',
    ...brief.checklist.map(item => `- ${item}`),
    '',
    '## Next 3 Actions',
    ...brief.actions.map(item => `- ${item}`),
    ''
  ].join('\n');
}

function renderBrief(state) {
  const brief = buildBrief(state);

  briefTargets.movementName.textContent = brief.movementName;
  briefTargets.mission.textContent = brief.mission;
  briefTargets.worldview.textContent = brief.worldview;
  briefTargets.audience.textContent = brief.audience;
  briefTargets.tinyProject.textContent = brief.tinyProject;

  briefTargets.checklist.replaceChildren(
    ...brief.checklist.map(item => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    })
  );

  briefTargets.actions.replaceChildren(
    ...brief.actions.map(item => {
      const li = document.createElement('li');
      li.textContent = item;
      return li;
    })
  );

  const hasContent = Object.values(state).some(value => clean(value));
  status.textContent = hasContent
    ? 'Draft saved locally in this browser.'
    : 'Saved locally in this browser.';
}

function sync() {
  const state = getState();
  saveDraft(state);
  renderBrief(state);
}

async function copyBrief() {
  const brief = buildBrief(getState());
  const markdown = briefToMarkdown(brief);

  try {
    await navigator.clipboard.writeText(markdown);
    status.textContent = 'Movement Brief copied to clipboard.';
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = markdown;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.inset = '0 auto auto 0';
    fallback.style.opacity = '0';
    document.body.append(fallback);
    fallback.select();
    document.execCommand('copy');
    fallback.remove();
    status.textContent = 'Movement Brief copied to clipboard.';
  }
}

function downloadBrief() {
  const brief = buildBrief(getState());
  const markdown = briefToMarkdown(brief);
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `${slugify(brief.movementName)}.md`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  status.textContent = 'Movement Brief downloaded as Markdown.';
}

const initialState = {
  movementName: '',
  worldPain: '',
  worldWish: '',
  firstAudience: '',
  tinyProject: '',
  ...loadDraft()
};

setState(initialState);
renderBrief(initialState);

Object.values(fields).forEach(input => {
  input.addEventListener('input', sync);
});

form.addEventListener('submit', event => {
  event.preventDefault();
  sync();
  briefTargets.movementName.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

clearButton.addEventListener('click', () => {
  setState({
    movementName: '',
    worldPain: '',
    worldWish: '',
    firstAudience: '',
    tinyProject: ''
  });
  saveDraft(getState());
  renderBrief(getState());
  fields.worldPain.focus();
});

copyButton.addEventListener('click', copyBrief);

downloadButton.addEventListener('click', downloadBrief);
