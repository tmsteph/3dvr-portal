function buildBillingStartHref(plan = '') {
  const target = plan
    ? `../billing/?plan=${encodeURIComponent(plan)}`
    : '../billing/';
  return `../sign-in.html?redirect=${encodeURIComponent(target)}`;
}

const ROUTES = {
  life: {
    title: 'Start free in the portal',
    copy:
      'You need a clean first step more than more tools. Start free with your email, then continue into one portal account.',
    points: [
      'Email first, no credit card',
      'One portal account for future upgrades',
      'Daily direction is the first workspace',
    ],
    plan: 'Best lane now: Free',
    primaryLabel: 'Start free',
    primaryHref: '../free-trial.html',
    secondaryLabel: 'Open sign-in',
    secondaryHref: '../sign-in.html',
  },
  cell: {
    title: 'Continue with Family & Friends',
    copy:
      'You want people around you and light paid support. Sign in once, then continue to the $5 lane tied to your portal account.',
    points: [
      'Portal account first, then Stripe',
      'Light support and a cleaner upgrade path',
      'Good fit when community matters more than heavy execution',
    ],
    plan: 'Best lane now: Family & Friends $5',
    primaryLabel: 'Continue with $5 plan',
    primaryHref: buildBillingStartHref('starter'),
    secondaryLabel: 'Start free first',
    secondaryHref: '../free-trial.html',
  },
  founder: {
    title: 'Continue with Founder',
    copy:
      'You are ready to launch something real and want direct help. Sign in once, then continue into the $20 Founder lane.',
    points: [
      'Portal account first, then Stripe',
      'Good fit when you want speed without the heaviest lane',
      'Keeps upgrades, invoices, and support on one identity',
    ],
    plan: 'Best lane now: Founder $20',
    primaryLabel: 'Continue with $20 plan',
    primaryHref: buildBillingStartHref('pro'),
    secondaryLabel: 'Open Projects',
    secondaryHref: '../projects/index.html',
  },
  builder: {
    title: 'Continue with Builder',
    copy:
      'You are focused on shipping and want deeper collaboration. Sign in once, then continue into the $50 Builder lane.',
    points: [
      'Portal account first, then Stripe',
      'Best fit when the goal is execution, not just clarity',
      'Use Projects to keep the work moving after checkout',
    ],
    plan: 'Best lane now: Builder $50',
    primaryLabel: 'Continue with $50 plan',
    primaryHref: buildBillingStartHref('builder'),
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

export { ROUTES, buildBillingStartHref, getRecommendation, getRouteKey, initStartRouter };
