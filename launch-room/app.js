const STORAGE_KEY = '3dvr.launch-room.movement-brief.v1';

const form = document.getElementById('movementBriefForm');
const clearButton = document.querySelector('[data-action="clear"]');
const copyButton = document.querySelector('[data-action="copy"]');
const downloadButton = document.querySelector('[data-action="download"]');
const buildLaunchPageButton = document.querySelector('[data-action="build-launch-page"]');
const copyLaunchPageButton = document.querySelector('[data-action="copy-launch-page"]');
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
const launchPageSection = document.querySelector('[data-launch-page-section]');
const launchPageTargets = {
  headline: document.querySelector('[data-launch-page="headline"]'),
  subheadline: document.querySelector('[data-launch-page="subheadline"]'),
  mission: document.querySelector('[data-launch-page="mission"]'),
  audience: document.querySelector('[data-launch-page="audience"]'),
  invitation: document.querySelector('[data-launch-page="invitation"]'),
  contact: document.querySelector('[data-launch-page="contact"]'),
  footer: document.querySelector('[data-launch-page="footer"]')
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

function asClause(text) {
  return clean(text).replace(/[.?!]+$/, '');
}

function slugify(text) {
  const slug = clean(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'movement-brief';
}

function buildBrief(state) {
  const movementName = titleCase(state.movementName) || 'A Movement Worth Starting';
  const worldPain = fallback(
    state.worldPain,
    'people feel disconnected from what they care about and unsure where to begin'
  );
  const worldWish = fallback(
    state.worldWish,
    'a simple way to turn care into a small, real project'
  );
  const audience = fallback(
    state.firstAudience,
    'someone with an idea they keep putting off'
  );
  const tinyProject = fallback(
    state.tinyProject,
    'a one-page brief and a first invitation to respond'
  );

  return {
    movementName,
    mission: `${movementName} helps ${audience} respond to this problem: ${asSentence(worldPain)} It starts by making ${worldWish} feel practical, visible, and close enough to try.`,
    worldview: `This matters because good ideas often stay private when people feel overwhelmed, unsupported, or unsure how to begin. If ${asClause(worldPain)}, then ${asClause(worldWish)} deserves a real first step. This movement begins small so people can see it, react to it, and help shape what comes next.`,
    audience,
    tinyProject,
    checklist: [
      `Name the movement clearly: ${movementName}.`,
      `Say the problem in plain language: ${asSentence(worldPain)}`,
      `Describe the better future people can picture: ${asSentence(worldWish)}`,
      `Choose a first audience you can actually reach: ${audience}.`,
      `Ship the smallest visible version: ${asSentence(tinyProject)}`,
      'Ask three people what feels useful, confusing, or missing.'
    ],
    actions: [
      `Today: turn this brief into a short project intro people can understand in one minute.`,
      `This week: share ${asSentence(tinyProject).slice(0, -1)} with ${audience}.`,
      'Next: collect the first responses and decide what to keep, change, or remove.'
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

function buildLaunchPage(brief) {
  const audience = asClause(brief.audience);
  const tinyProject = asClause(brief.tinyProject);

  return {
    headline: `${brief.movementName} starts here.`,
    subheadline: `A simple first step for ${audience}: ${tinyProject}.`,
    mission: brief.mission,
    audience: `This is for ${audience}, especially anyone ready for a practical first move instead of another vague plan.`,
    invitation: `Start with ${tinyProject}. Read it, try it, and share what would make it more useful.`,
    contact: `Want to help shape ${brief.movementName}? Send a note, share your story, or ask for the first version.`,
    footer: 'Built with 3DVR Launch Room'
  };
}

function launchPageToMarkdown(launchPage) {
  return [
    `# ${launchPage.headline}`,
    '',
    launchPage.subheadline,
    '',
    '## Mission',
    launchPage.mission,
    '',
    '## Who This Is For',
    launchPage.audience,
    '',
    '## First Invitation',
    launchPage.invitation,
    '',
    '## Contact',
    launchPage.contact,
    '',
    launchPage.footer,
    ''
  ].join('\n');
}

function renderLaunchPage(brief) {
  const launchPage = buildLaunchPage(brief);

  launchPageTargets.headline.textContent = launchPage.headline;
  launchPageTargets.subheadline.textContent = launchPage.subheadline;
  launchPageTargets.mission.textContent = launchPage.mission;
  launchPageTargets.audience.textContent = launchPage.audience;
  launchPageTargets.invitation.textContent = launchPage.invitation;
  launchPageTargets.contact.textContent = launchPage.contact;
  launchPageTargets.footer.textContent = launchPage.footer;
  launchPageSection.hidden = false;

  return launchPage;
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

async function writeTextToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const fallback = document.createElement('textarea');
    fallback.value = text;
    fallback.setAttribute('readonly', '');
    fallback.style.position = 'fixed';
    fallback.style.inset = '0 auto auto 0';
    fallback.style.opacity = '0';
    document.body.append(fallback);
    fallback.select();
    document.execCommand('copy');
    fallback.remove();
  }
}

function sync() {
  const state = getState();
  saveDraft(state);
  renderBrief(state);
}

async function copyBrief() {
  const brief = buildBrief(getState());
  const markdown = briefToMarkdown(brief);

  await writeTextToClipboard(markdown);
  status.textContent = 'Movement Brief copied to clipboard.';
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

function generateLaunchPage() {
  const brief = buildBrief(getState());

  renderLaunchPage(brief);
  status.textContent = 'Launch Page Draft generated locally.';
  launchPageSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function copyLaunchPage() {
  const brief = buildBrief(getState());
  const launchPage = renderLaunchPage(brief);

  await writeTextToClipboard(launchPageToMarkdown(launchPage));
  status.textContent = 'Launch Page Draft copied to clipboard.';
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
  launchPageSection.hidden = true;
  fields.worldPain.focus();
});

copyButton.addEventListener('click', copyBrief);

downloadButton.addEventListener('click', downloadBrief);

buildLaunchPageButton.addEventListener('click', generateLaunchPage);

copyLaunchPageButton.addEventListener('click', copyLaunchPage);
