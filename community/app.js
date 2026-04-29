const COMMUNITY_ROOT = 'communitySystem';

const state = {
  circles: new Map(),
  checkins: new Map(),
  threads: new Map(),
  profile: {},
};

const selectors = {
  profileForm: document.getElementById('profileForm'),
  profileName: document.getElementById('profileName'),
  profileGoal: document.getElementById('profileGoal'),
  profileRole: document.getElementById('profileRole'),
  circleForm: document.getElementById('circleForm'),
  circleName: document.getElementById('circleName'),
  circleFocus: document.getElementById('circleFocus'),
  circleList: document.getElementById('circleList'),
  checkinForm: document.getElementById('checkinForm'),
  checkinBuild: document.getElementById('checkinBuild'),
  checkinStuck: document.getElementById('checkinStuck'),
  checkinNeed: document.getElementById('checkinNeed'),
  threadForm: document.getElementById('threadForm'),
  threadTopic: document.getElementById('threadTopic'),
  threadMessage: document.getElementById('threadMessage'),
  communityFeed: document.getElementById('communityFeed'),
  syncStatus: document.getElementById('syncStatus'),
};

function clean(value) {
  return String(value || '').trim();
}

function safeText(value) {
  return clean(value) || 'Not set yet';
}

function getGunRoot() {
  if (typeof window.Gun !== 'function') {
    selectors.syncStatus.textContent = 'Gun is not available in this browser session.';
    return null;
  }

  const gun = window.gun || window.Gun(window.__GUN_PEERS__ || ['https://gun-relay-3dvr.fly.dev/gun']);
  window.gun = gun;
  selectors.syncStatus.textContent = 'Connected to Gun community graph.';

  // Node shape:
  // gun.get('3dvr-portal').get('communitySystem').get('profiles').get('local-builder')
  // gun.get('3dvr-portal').get('communitySystem').get('circles').set(circle)
  // gun.get('3dvr-portal').get('communitySystem').get('checkins').set(checkin)
  // gun.get('3dvr-portal').get('communitySystem').get('threads').set(thread)
  return gun.get('3dvr-portal').get(COMMUNITY_ROOT);
}

const root = getGunRoot();

function renderCircles() {
  const circles = Array.from(state.circles.values())
    .filter(circle => circle && circle.name)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 6);

  selectors.circleList.innerHTML = '';
  if (!circles.length) {
    selectors.circleList.innerHTML = '<div class="mini-item">No circles yet. Create the first one.</div>';
    return;
  }

  for (const circle of circles) {
    const item = document.createElement('div');
    item.className = 'mini-item';
    item.innerHTML = `
      <strong></strong>
      <span></span>
    `;
    item.querySelector('strong').textContent = circle.name;
    item.querySelector('span').textContent = circle.focus || 'Open builder support circle';
    selectors.circleList.append(item);
  }
}

function feedItems() {
  const checkins = Array.from(state.checkins.values())
    .filter(checkin => checkin && checkin.build)
    .map(checkin => ({
      type: 'Weekly check-in',
      title: checkin.build,
      body: `Stuck: ${safeText(checkin.stuck)} Need: ${safeText(checkin.need)}`,
      createdAt: checkin.createdAt,
    }));

  const threads = Array.from(state.threads.values())
    .filter(thread => thread && thread.topic)
    .map(thread => ({
      type: 'Thread',
      title: thread.topic,
      body: thread.message,
      createdAt: thread.createdAt,
    }));

  return [...checkins, ...threads]
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, 18);
}

function renderFeed() {
  const items = feedItems();
  selectors.communityFeed.innerHTML = '';

  if (!items.length) {
    selectors.communityFeed.innerHTML = '<div class="feed-item">No community posts yet. Add a check-in or thread.</div>';
    return;
  }

  for (const item of items) {
    const entry = document.createElement('article');
    entry.className = 'feed-item';
    entry.innerHTML = `
      <span class="feed-item__meta"></span>
      <strong></strong>
      <p></p>
    `;
    entry.querySelector('.feed-item__meta').textContent = item.type;
    entry.querySelector('strong').textContent = item.title;
    entry.querySelector('p').textContent = item.body;
    selectors.communityFeed.append(entry);
  }
}

function saveProfile(event) {
  event.preventDefault();
  const profile = {
    name: clean(selectors.profileName.value),
    goal: clean(selectors.profileGoal.value),
    role: clean(selectors.profileRole.value) || 'Builder',
    updatedAt: Date.now(),
  };
  state.profile = profile;
  root?.get('profiles').get('local-builder').put(profile);
  selectors.syncStatus.textContent = 'Profile saved to community graph.';
}

function createCircle(event) {
  event.preventDefault();
  const circle = {
    name: clean(selectors.circleName.value),
    focus: clean(selectors.circleFocus.value),
    createdAt: Date.now(),
    sizeTarget: '3-6',
  };
  if (!circle.name) return;
  root?.get('circles').set(circle);
  selectors.circleForm.reset();
  selectors.syncStatus.textContent = 'Circle created.';
}

function submitCheckin(event) {
  event.preventDefault();
  const checkin = {
    build: clean(selectors.checkinBuild.value),
    stuck: clean(selectors.checkinStuck.value),
    need: clean(selectors.checkinNeed.value),
    author: state.profile.name || 'Builder',
    createdAt: Date.now(),
  };
  if (!checkin.build) return;
  root?.get('checkins').set(checkin);
  selectors.checkinForm.reset();
  selectors.syncStatus.textContent = 'Weekly check-in posted.';
}

function postThread(event) {
  event.preventDefault();
  const thread = {
    topic: clean(selectors.threadTopic.value),
    message: clean(selectors.threadMessage.value),
    author: state.profile.name || 'Builder',
    createdAt: Date.now(),
  };
  if (!thread.topic || !thread.message) return;
  root?.get('threads').set(thread);
  selectors.threadForm.reset();
  selectors.syncStatus.textContent = 'Builder thread posted.';
}

function bindGun() {
  if (!root) {
    renderCircles();
    renderFeed();
    return;
  }

  root.get('profiles').get('local-builder').on(profile => {
    if (!profile) return;
    state.profile = profile;
    selectors.profileName.value = profile.name || '';
    selectors.profileGoal.value = profile.goal || '';
    selectors.profileRole.value = profile.role || 'Builder';
  });

  root.get('circles').map().on((circle, id) => {
    if (!circle || !circle.name) return;
    state.circles.set(id, circle);
    renderCircles();
  });

  root.get('checkins').map().on((checkin, id) => {
    if (!checkin || !checkin.build) return;
    state.checkins.set(id, checkin);
    renderFeed();
  });

  root.get('threads').map().on((thread, id) => {
    if (!thread || !thread.topic) return;
    state.threads.set(id, thread);
    renderFeed();
  });
}

selectors.profileForm.addEventListener('submit', saveProfile);
selectors.circleForm.addEventListener('submit', createCircle);
selectors.checkinForm.addEventListener('submit', submitCheckin);
selectors.threadForm.addEventListener('submit', postThread);

renderCircles();
renderFeed();
bindGun();
