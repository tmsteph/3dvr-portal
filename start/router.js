const ROUTES = {
  life: {
    title: 'Start with Life',
    copy:
      'You need a daily reset before you need more tools. Use Life to log how you feel, what happened today, and what matters tomorrow.',
    points: [
      '3-minute daily check-in',
      'Weekly reflection',
      'Stay free while you get organized',
    ],
    plan: 'Best lane now: Free + Life',
    primaryLabel: 'Open Life',
    primaryHref: '../life/index.html',
    secondaryLabel: 'See free plan',
    secondaryHref: 'https://3dvr.tech/subscribe/free-plan.html',
  },
  cell: {
    title: 'Open Cell and add people',
    copy:
      'You need accountability and shared momentum. Start a Cell so a small group can help you stay consistent.',
    points: [
      '3 to 12 people around shared goals',
      'Weekly support and accountability',
      'Light support fits well with the $5 lane',
    ],
    plan: 'Best lane now: Cell + Family & Friends $5',
    primaryLabel: 'Open Cell',
    primaryHref: '../cell/index.html',
    secondaryLabel: 'See $5 plan',
    secondaryHref: 'https://3dvr.tech/subscribe/family-friends.html',
  },
  founder: {
    title: 'Launch with Founder',
    copy:
      'You are ready to launch something real and want paid help. Founder is the lane for direct support while you build a page, offer, or service.',
    points: [
      'Direct help on the next launch step',
      'Pair with Projects, Notes, and Calendar',
      'Good fit when you want speed without jumping to the heaviest lane',
    ],
    plan: 'Best lane now: Founder $20',
    primaryLabel: 'See $20 Founder',
    primaryHref: 'https://3dvr.tech/subscribe/founder-plan.html',
    secondaryLabel: 'Open Projects',
    secondaryHref: '../projects/index.html',
  },
  builder: {
    title: 'Go Builder',
    copy:
      'You are focused on income and want more execution support. Builder is the stronger paid lane for shipping offers, pages, and revenue systems faster.',
    points: [
      'Direct support for launch and revenue work',
      'Best fit when the goal is income, not just clarity',
      'Use Projects to keep the work moving after checkout',
    ],
    plan: 'Best lane now: Builder $50',
    primaryLabel: 'See $50 Builder',
    primaryHref: 'https://3dvr.tech/subscribe/builder-plan.html',
    secondaryLabel: 'Open Projects',
    secondaryHref: '../projects/index.html',
  },
};

function getRouteKey(answers) {
  if (answers.support === 'direct' && answers.goal === 'launch' && answers.pain === 'income') {
    return 'builder';
  }

  if (answers.support === 'direct' && answers.goal === 'launch') {
    return 'founder';
  }

  if (answers.goal === 'community' || answers.pain === 'alone' || answers.support === 'community') {
    return 'cell';
  }

  return 'life';
}

function getRecommendation(answers) {
  return ROUTES[getRouteKey(answers)];
}

function renderRecommendation(root, recommendation) {
  const title = root.querySelector('#routerTitle');
  const copy = root.querySelector('#routerCopy');
  const points = root.querySelector('#routerPoints');
  const plan = root.querySelector('#routerPlan');
  const primary = root.querySelector('#routerPrimary');
  const secondary = root.querySelector('#routerSecondary');

  if (!title || !copy || !points || !plan || !primary || !secondary) {
    return;
  }

  title.textContent = recommendation.title;
  copy.textContent = recommendation.copy;
  plan.textContent = recommendation.plan;
  primary.textContent = recommendation.primaryLabel;
  primary.href = recommendation.primaryHref;
  secondary.textContent = recommendation.secondaryLabel;
  secondary.href = recommendation.secondaryHref;

  const doc = root.ownerDocument || root;
  points.innerHTML = '';
  recommendation.points.forEach((point) => {
    const item = doc.createElement('li');
    item.textContent = point;
    points.appendChild(item);
  });
}

function readAnswers(form) {
  const data = new FormData(form);
  return {
    pain: data.get('pain') || 'scattered',
    goal: data.get('goal') || 'clarity',
    support: data.get('support') || 'free',
  };
}

function initStartRouter(root = document) {
  const form = root.querySelector('#startRouter');
  if (!form) {
    return;
  }

  const update = () => {
    renderRecommendation(root, getRecommendation(readAnswers(form)));
  };

  form.addEventListener('change', update);
  update();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    initStartRouter(document);
  });
}

export { ROUTES, getRecommendation, getRouteKey, initStartRouter };
