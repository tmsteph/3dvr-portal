const TOOL_OPTIONS = [
  {
    key: 'brief-builder',
    label: 'Idea brief builder',
    description: 'Structure the problem, audience, and success metrics.'
  },
  {
    key: 'page-generator',
    label: 'Idea page generator',
    description: 'Turn briefs into an idea landing page draft.'
  },
  {
    key: 'cta-optimizer',
    label: 'CTA optimizer',
    description: 'Tune headers, body copy, and calls-to-action.'
  },
  {
    key: 'share-pack',
    label: 'Share pack creator',
    description: 'Generate social copy, email blurbs, and QR captions.'
  },
  {
    key: 'analytics-notes',
    label: 'Analytics notes',
    description: 'Capture what to measure after launch.'
  }
];

const CHANNEL_OPTIONS = [
  {
    key: 'portal',
    label: 'Portal announcement',
    description: 'Add to portal updates and dashboards.'
  },
  {
    key: 'community-chat',
    label: 'Community chat',
    description: 'Share in the 3DVR chat and Discord spaces.'
  },
  {
    key: 'email',
    label: 'Email or newsletter',
    description: 'Push to subscribers and partners.'
  },
  {
    key: 'social',
    label: 'Social media thread',
    description: 'Post on X, LinkedIn, or similar channels.'
  },
  {
    key: 'partner',
    label: 'Partner outreach',
    description: 'Coordinate cross-promo with allies.'
  }
];

const PROMO_STEPS = [
  { key: 'publish', label: 'Publish idea page draft' },
  { key: 'share-chat', label: 'Share in community chat' },
  { key: 'share-social', label: 'Post social thread' },
  { key: 'email-blast', label: 'Send email or newsletter' },
  { key: 'metrics', label: 'Record first-week results' }
];

const ideasById = {};

function createOption({ key, label, description }, groupName) {
  const wrapper = document.createElement('label');
  wrapper.className = 'option-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.name = groupName;
  checkbox.value = key;

  const textWrapper = document.createElement('span');
  const labelEl = document.createElement('strong');
  labelEl.textContent = label;
  const descriptionEl = document.createElement('span');
  descriptionEl.textContent = description;

  textWrapper.appendChild(labelEl);
  textWrapper.appendChild(document.createElement('br'));
  textWrapper.appendChild(descriptionEl);

  wrapper.appendChild(checkbox);
  wrapper.appendChild(textWrapper);

  return wrapper;
}

function renderOptions(container, options, groupName) {
  const list = document.createElement('div');
  list.className = 'option-list';

  options.forEach(option => {
    list.appendChild(createOption(option, groupName));
  });

  container.appendChild(list);
}

function buildSelectionObject(form, name, options) {
  const selected = Array.from(form.querySelectorAll(`input[name="${name}"]:checked`));
  if (!selected.length) {
    return {};
  }

  return selected.reduce((acc, input) => {
    const match = options.find(option => option.key === input.value);
    const label = match ? match.label : input.value;
    acc[label] = true;
    return acc;
  }, {});
}

function formatTimestamp(value) {
  if (!value) {
    return 'Just now';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return date.toLocaleString();
}

function renderIdeas(container, ideaRoot) {
  container.innerHTML = '';

  const ideas = Object.values(ideasById).sort((a, b) => {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  if (!ideas.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No idea pages yet. Add one above to start automation.';
    container.appendChild(empty);
    return;
  }

  ideas.forEach(idea => {
    const card = document.createElement('article');
    card.className = 'idea-card';

    const header = document.createElement('div');
    header.className = 'idea-card__header';

    const title = document.createElement('h3');
    title.textContent = idea.title;

    const meta = document.createElement('div');
    meta.className = 'idea-card__meta';
    meta.textContent = `Created ${formatTimestamp(idea.createdAt)}`;

    header.appendChild(title);
    header.appendChild(meta);

    if (idea.pageUrl) {
      const link = document.createElement('a');
      link.href = idea.pageUrl;
      link.textContent = 'Open idea page';
      link.target = '_blank';
      link.rel = 'noopener';
      header.appendChild(link);
    }

    card.appendChild(header);

    const summary = document.createElement('p');
    summary.textContent = idea.problem;
    card.appendChild(summary);

    if (idea.audience) {
      const audience = document.createElement('p');
      audience.className = 'idea-card__meta';
      audience.textContent = `Audience: ${idea.audience}`;
      card.appendChild(audience);
    }

    const badges = document.createElement('div');
    badges.className = 'idea-card__badges';
    Object.keys(idea.tools || {}).forEach(label => {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = label;
      badges.appendChild(badge);
    });
    Object.keys(idea.channels || {}).forEach(label => {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = label;
      badges.appendChild(badge);
    });

    if (badges.children.length) {
      card.appendChild(badges);
    }

    const checklistSection = document.createElement('div');
    checklistSection.className = 'idea-card__section';

    const checklistTitle = document.createElement('h4');
    checklistTitle.textContent = 'Promotion checklist';
    checklistSection.appendChild(checklistTitle);

    const checklist = document.createElement('div');
    checklist.className = 'promo-checklist';

    PROMO_STEPS.forEach(step => {
      const item = document.createElement('div');
      item.className = 'promo-item';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `${idea.id}-${step.key}`;
      input.checked = idea.promoProgress?.[step.key] === true;

      input.addEventListener('change', () => {
        ideaRoot
          .get(idea.id)
          .get('promoProgress')
          .get(step.key)
          .put(input.checked);
      });

      const label = document.createElement('label');
      label.setAttribute('for', input.id);
      label.textContent = step.label;

      item.appendChild(input);
      item.appendChild(label);
      checklist.appendChild(item);
    });

    checklistSection.appendChild(checklist);
    card.appendChild(checklistSection);

    container.appendChild(card);
  });
}

function initIdeaBoard() {
  const form = document.querySelector('[data-idea-form]');
  const status = document.querySelector('[data-form-status]');
  const ideaList = document.querySelector('[data-idea-list]');
  const toolOptions = document.querySelector('[data-tool-options]');
  const channelOptions = document.querySelector('[data-channel-options]');

  renderOptions(toolOptions, TOOL_OPTIONS, 'workbenchTools');
  renderOptions(channelOptions, CHANNEL_OPTIONS, 'promoChannels');

  const gun = Gun({
    peers: window.__GUN_PEERS__ || [],
    localStorage: false,
    radisk: false
  });

  // Node shape: workbench/idea-pages/{ideaId} -> { title, problem, audience, success, pageUrl, tools, channels, createdAt }
  const ideaRoot = gun.get('workbench').get('idea-pages');

  ideaRoot.map().on((data, key) => {
    if (!data || key?.startsWith('_')) {
      return;
    }

    ideasById[key] = {
      id: key,
      title: data.title,
      problem: data.problem,
      audience: data.audience,
      success: data.success,
      pageUrl: data.pageUrl,
      tools: data.tools || {},
      channels: data.channels || {},
      promoProgress: data.promoProgress || {},
      createdAt: data.createdAt
    };

    renderIdeas(ideaList, ideaRoot);
  });

  form.addEventListener('submit', event => {
    event.preventDefault();

    const title = form.elements.ideaTitle.value.trim();
    const problem = form.elements.ideaProblem.value.trim();
    const audience = form.elements.ideaAudience.value.trim();
    const success = form.elements.ideaSuccess.value.trim();
    const pageUrl = form.elements.ideaUrl.value.trim();

    if (!title || !problem) {
      status.textContent = 'Add a title and problem statement to save the idea.';
      return;
    }

    const tools = buildSelectionObject(form, 'workbenchTools', TOOL_OPTIONS);
    const channels = buildSelectionObject(form, 'promoChannels', CHANNEL_OPTIONS);
    const createdAt = new Date().toISOString();
    const ideaId = `idea-${Date.now()}`;

    ideaRoot.get(ideaId).put({
      title,
      problem,
      audience,
      success,
      pageUrl,
      tools,
      channels,
      createdAt
    });

    form.reset();
    status.textContent = 'Idea saved and synced to Gun.';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initIdeaBoard();
});
