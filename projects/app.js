const PROJECT_LAUNCHPAD_ROOT = 'projectLaunchpad';
const LOCAL_KEY = '3dvr-project-launchpad';

const seedProjects = [
  {
    id: 'seed_regenerative_farm',
    slug: 'regenerative-farm',
    name: 'Regenerative Farm',
    stage: 'seed',
    category: 'farm / retreat / education',
    mission:
      'A family-led plan for land, soil, food, retreats, music-led wellness, nature education, and community renewal.',
    needs: ['land access', 'farm mentors', 'volunteers', 'funding path'],
    offers: ['music circles', 'nature education', 'farm days', 'community meals'],
    contact: 'mailto:3dvr.tech@gmail.com?subject=Regenerative%20Farm',
    support: '../projects/#regenerative-farm',
    createdAt: 1719000000000,
  },
  {
    id: 'seed_sd_day_traders',
    slug: 'sd-day-traders',
    name: 'SD Day Traders',
    stage: 'live',
    category: 'trading education',
    mission: 'A small trading group that helps people tighten their trading process and request consultation time.',
    needs: ['warm leads', 'booking requests', 'member trust', 'clear offer copy'],
    offers: ['trading process review', 'consultation requests', 'group education'],
    contact: 'mailto:gamboaesai@gmail.com?subject=SD%20Day%20Traders%20consultation',
    support: 'https://sd-day-traders.3dvr.tech/',
    createdAt: 1719100000000,
  },
  {
    id: 'seed_open_future',
    slug: 'open-future-computing',
    name: 'Open Future Computing',
    stage: 'building',
    category: 'open source / tools',
    mission:
      'A practical path toward local-first, open, human-controlled computing for regular people and small teams.',
    needs: ['coders', 'docs', 'device testers', 'small business pilots'],
    offers: ['portal tools', 'agent workflows', 'local-first patterns', 'implementation help'],
    contact: 'mailto:3dvr.tech@gmail.com?subject=Open%20Future%20Computing',
    support: '../open-source/',
    createdAt: 1719200000000,
  },
];

const seedUpdates = [
  {
    id: 'update_regenerative_farm_start',
    projectId: 'seed_regenerative_farm',
    title: 'Land access research is ready',
    body: 'The next move is a land-seeker profile, FarmLink/RCD outreach, and visits to local farm models.',
    createdAt: 1719300000000,
  },
  {
    id: 'update_sd_day_traders_booking',
    projectId: 'seed_sd_day_traders',
    title: 'Booking request simplified',
    body: 'The consultation flow now starts with a professional email request instead of a heavy calendar embed.',
    createdAt: 1719400000000,
  },
];

const state = {
  nodes: new Map(),
  updates: new Map(),
  followers: new Map(),
  filter: 'all',
};

const els = {
  form: document.getElementById('projectForm'),
  name: document.getElementById('projectName'),
  stage: document.getElementById('projectStage'),
  slug: document.getElementById('projectSlug'),
  category: document.getElementById('projectCategory'),
  mission: document.getElementById('projectMission'),
  needs: document.getElementById('projectNeeds'),
  offers: document.getElementById('projectOffers'),
  contact: document.getElementById('projectContact'),
  support: document.getElementById('projectSupport'),
  status: document.getElementById('syncStatus'),
  list: document.getElementById('projectList'),
  filters: Array.from(document.querySelectorAll('[data-filter]')),
  updateForm: document.getElementById('updateForm'),
  updateProject: document.getElementById('updateProject'),
  updateHeading: document.getElementById('updateHeading'),
  updateBody: document.getElementById('updateBody'),
  nodeCount: document.getElementById('nodeCount'),
  updateCount: document.getElementById('updateCount'),
  needCount: document.getElementById('needCount'),
  offerCount: document.getElementById('offerCount'),
};

function clean(value) {
  return String(value || '').trim();
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

function splitList(value) {
  return clean(value)
    .split(/[\n,;]+/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function stageLabel(stage) {
  const labels = {
    seed: 'Seed',
    building: 'Building',
    live: 'Live',
    seeking: 'Seeking support',
  };
  return labels[stage] || 'Seed';
}

function getGunRoot() {
  if (typeof window.Gun !== 'function') {
    els.status.textContent = 'Gun is unavailable. Saving project nodes in this browser.';
    return null;
  }

  const gun = window.gun || window.Gun(window.__GUN_PEERS__ || ['https://gun-relay-3dvr.fly.dev/gun']);
  window.gun = gun;
  els.status.textContent = 'Connected to the 3DVR project graph.';

  // Node shape:
  // gun.get('3dvr-portal').get('projectLaunchpad').get('nodes').get(slug)
  // gun.get('3dvr-portal').get('projectLaunchpad').get('updates').get(updateId)
  // gun.get('3dvr-portal').get('projectLaunchpad').get('followers').get(slug)
  return gun.get('3dvr-portal').get(PROJECT_LAUNCHPAD_ROOT);
}

const root = getGunRoot();

function normalizeNode(node) {
  const name = clean(node?.name);
  const slug = slugify(node?.slug || name);
  if (!name || !slug) return null;
  return {
    id: clean(node.id) || `project_${slug}`,
    slug,
    name,
    stage: clean(node.stage) || 'seed',
    category: clean(node.category) || 'project',
    mission: clean(node.mission),
    needs: Array.isArray(node.needs) ? node.needs.map(clean).filter(Boolean) : splitList(node.needs),
    offers: Array.isArray(node.offers) ? node.offers.map(clean).filter(Boolean) : splitList(node.offers),
    contact: clean(node.contact) || 'mailto:3dvr.tech@gmail.com',
    support: clean(node.support),
    createdAt: Number(node.createdAt || Date.now()),
    updatedAt: Number(node.updatedAt || Date.now()),
  };
}

function saveLocalBackup() {
  try {
    const payload = {
      nodes: Array.from(state.nodes.values()).filter(node => !node.seedOnly),
      updates: Array.from(state.updates.values()).filter(update => !update.seedOnly),
      followers: Array.from(state.followers.entries()),
    };
    localStorage.setItem(LOCAL_KEY, JSON.stringify(payload));
  } catch (_error) {
    // Gun is the shared source of truth when available.
  }
}

function loadLocalBackup() {
  try {
    const payload = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
    if (Array.isArray(payload.nodes)) {
      payload.nodes.forEach(node => {
        const normalized = normalizeNode(node);
        if (normalized) state.nodes.set(normalized.slug, normalized);
      });
    }
    if (Array.isArray(payload.updates)) {
      payload.updates.forEach(update => {
        if (update && update.id && update.projectId && update.title) state.updates.set(update.id, update);
      });
    }
    if (Array.isArray(payload.followers)) {
      payload.followers.forEach(([slug, count]) => state.followers.set(slug, Number(count || 0)));
    }
  } catch (_error) {
    // Ignore malformed local drafts.
  }
}

function loadSeeds() {
  seedProjects.forEach(project => {
    const node = normalizeNode(project);
    if (node && !state.nodes.has(node.slug)) state.nodes.set(node.slug, { ...node, seedOnly: true });
  });
  seedUpdates.forEach(update => {
    if (!state.updates.has(update.id)) state.updates.set(update.id, { ...update, seedOnly: true });
  });
}

function latestUpdateFor(project) {
  return Array.from(state.updates.values())
    .filter(update => update.projectId === project.id || update.projectSlug === project.slug)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];
}

function renderStats() {
  const nodes = Array.from(state.nodes.values()).filter(node => node.name);
  const updates = Array.from(state.updates.values()).filter(update => update.title);
  els.nodeCount.textContent = String(nodes.length);
  els.updateCount.textContent = String(updates.length);
  els.needCount.textContent = String(nodes.reduce((total, node) => total + node.needs.length, 0));
  els.offerCount.textContent = String(nodes.reduce((total, node) => total + node.offers.length, 0));
}

function renderProjectOptions() {
  const current = els.updateProject.value;
  const projects = Array.from(state.nodes.values()).sort((a, b) => a.name.localeCompare(b.name));
  els.updateProject.innerHTML = '';
  projects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.slug;
    option.textContent = project.name;
    els.updateProject.append(option);
  });
  if (current) els.updateProject.value = current;
}

function createList(items, fallback) {
  const list = document.createElement('ul');
  const values = items.length ? items : [fallback];
  values.forEach(value => {
    const item = document.createElement('li');
    item.textContent = value;
    list.append(item);
  });
  return list;
}

function renderProjects() {
  const projects = Array.from(state.nodes.values())
    .filter(project => project.name)
    .filter(project => state.filter === 'all' || project.stage === state.filter)
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));

  els.list.innerHTML = '';
  if (!projects.length) {
    els.list.innerHTML = '<div class="empty-state">No project nodes in this lane yet.</div>';
    renderStats();
    renderProjectOptions();
    return;
  }

  projects.forEach(project => {
    const card = document.createElement('article');
    const update = latestUpdateFor(project);
    const followers = state.followers.get(project.slug) || 0;
    card.className = 'project-node';
    card.id = project.slug;
    card.innerHTML = `
      <div class="node-top">
        <div>
          <span class="node-chip"></span>
          <h3 class="node-title"></h3>
        </div>
        <span class="node-stage"></span>
      </div>
      <p class="node-mission"></p>
      <span class="node-slug"></span>
      <div class="node-lists">
        <div class="node-needs"><h4>Needs</h4></div>
        <div class="node-offers"><h4>Offers</h4></div>
      </div>
      <div class="node-update" hidden>
        <h4>Latest update</h4>
        <strong></strong>
        <p></p>
      </div>
      <div class="node-actions"></div>
    `;
    card.querySelector('.node-chip').textContent = project.category;
    card.querySelector('.node-title').textContent = project.name;
    card.querySelector('.node-stage').textContent = stageLabel(project.stage);
    card.querySelector('.node-mission').textContent = project.mission || 'Mission not written yet.';
    card.querySelector('.node-slug').textContent = `3dvr.tech/${project.slug} · ${project.slug}.3dvr.tech later`;
    card.querySelector('.node-needs').append(createList(project.needs, 'Needs not listed yet'));
    card.querySelector('.node-offers').append(createList(project.offers, 'Offers not listed yet'));

    if (update) {
      const updateBox = card.querySelector('.node-update');
      updateBox.hidden = false;
      updateBox.querySelector('strong').textContent = update.title;
      updateBox.querySelector('p').textContent = update.body;
    }

    const actions = card.querySelector('.node-actions');
    const contact = document.createElement('a');
    contact.href = project.contact;
    contact.textContent = 'Contact';
    actions.append(contact);

    if (project.support) {
      const support = document.createElement('a');
      support.href = project.support;
      support.textContent = 'Support';
      actions.append(support);
    }

    const follow = document.createElement('button');
    follow.type = 'button';
    follow.dataset.follow = project.slug;
    follow.textContent = `Follow (${followers})`;
    actions.append(follow);

    els.list.append(card);
  });

  renderStats();
  renderProjectOptions();
}

function saveNode(event) {
  event.preventDefault();
  const name = clean(els.name.value);
  const node = normalizeNode({
    id: createId('project'),
    name,
    stage: els.stage.value,
    slug: els.slug.value || slugify(name),
    category: els.category.value,
    mission: els.mission.value,
    needs: splitList(els.needs.value),
    offers: splitList(els.offers.value),
    contact: els.contact.value,
    support: els.support.value,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  if (!node) return;
  state.nodes.set(node.slug, node);
  saveLocalBackup();
  renderProjects();
  root?.get('nodes').get(node.slug).put(node);
  els.form.reset();
  els.status.textContent = root ? 'Project node saved to the shared graph.' : 'Project node saved locally.';
}

function saveUpdate(event) {
  event.preventDefault();
  const projectSlug = clean(els.updateProject.value);
  const project = state.nodes.get(projectSlug);
  const update = {
    id: createId('update'),
    projectId: project?.id || projectSlug,
    projectSlug,
    title: clean(els.updateHeading.value),
    body: clean(els.updateBody.value),
    createdAt: Date.now(),
  };
  if (!update.projectSlug || !update.title || !update.body) return;
  state.updates.set(update.id, update);
  if (project) {
    project.updatedAt = Date.now();
    state.nodes.set(project.slug, project);
  }
  saveLocalBackup();
  renderProjects();
  root?.get('updates').get(update.id).put(update);
  if (project) root?.get('nodes').get(project.slug).put(project);
  els.updateForm.reset();
  els.status.textContent = root ? 'Project update posted to the shared graph.' : 'Project update saved locally.';
}

function followProject(slug) {
  const count = (state.followers.get(slug) || 0) + 1;
  state.followers.set(slug, count);
  saveLocalBackup();
  renderProjects();
  root?.get('followers').get(slug).put({ slug, count, updatedAt: Date.now() });
  els.status.textContent = 'Follow saved.';
}

function bindFilters() {
  els.filters.forEach(button => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter || 'all';
      els.filters.forEach(item => item.classList.toggle('active', item === button));
      renderProjects();
    });
  });
}

function bindGun() {
  if (!root) return;
  root.get('nodes').map().on((node, slug) => {
    const normalized = normalizeNode({ ...node, slug: node?.slug || slug });
    if (!normalized) return;
    state.nodes.set(normalized.slug, normalized);
    saveLocalBackup();
    renderProjects();
  });
  root.get('updates').map().on((update, id) => {
    if (!update || !update.title) return;
    state.updates.set(update.id || id, { ...update, id: update.id || id });
    saveLocalBackup();
    renderProjects();
  });
  root.get('followers').map().on((follow, slug) => {
    if (!follow) return;
    state.followers.set(follow.slug || slug, Number(follow.count || 0));
    saveLocalBackup();
    renderProjects();
  });
}

els.form.addEventListener('submit', saveNode);
els.updateForm.addEventListener('submit', saveUpdate);
els.list.addEventListener('click', event => {
  const button = event.target.closest('[data-follow]');
  if (!button) return;
  followProject(button.dataset.follow);
});

loadSeeds();
loadLocalBackup();
bindFilters();
renderProjects();
bindGun();
