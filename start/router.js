function buildBillingStartHref(plan = '') {
  const normalizedPlan = String(plan || '').trim();
  return normalizedPlan
    ? `../pay/?plan=${encodeURIComponent(normalizedPlan)}`
    : '../pay/';
}

const ROUTES = {
  life: {
    title: 'Start free with Daily Direction',
    copy:
      'You are not behind. You need one quiet place to sort your life and pick today’s next step.',
    points: [
      'No card',
      'Sort what matters',
      'One small move today',
    ],
    plan: 'Best lane now: Free',
    primaryLabel: 'Start free',
    primaryHref: '../life/index.html',
    secondaryLabel: 'Open sign-in',
    secondaryHref: '../sign-in.html',
  },
  cell: {
    title: 'Continue with Family & Friends',
    copy:
      'You want people around you and light paid support. Pay securely with Stripe now; create or use a portal account later only when it helps.',
    points: [
      'No portal account required before payment',
      'Light support and a cleaner upgrade path',
      'Good fit when community matters more than heavy execution',
    ],
    plan: 'Best lane now: Family & Friends $5',
    primaryLabel: 'Continue with $5 plan',
    primaryHref: buildBillingStartHref('starter'),
    secondaryLabel: 'Start Daily Direction first',
    secondaryHref: '../life/index.html',
  },
  founder: {
    title: 'Continue with Founder',
    copy:
      'You are ready to launch something real and want direct help. Pay securely with Stripe now; use the portal later for projects and billing management.',
    points: [
      'No portal account required before payment',
      'Good fit when you want speed without the heaviest lane',
      'Stripe handles the payment step directly',
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
      'You are focused on shipping and want deeper collaboration. Pay securely with Stripe now and use Projects after checkout to keep the work moving.',
    points: [
      'No portal account required before payment',
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
  if (answers.support === 'direct' && answers.project === 'workflow') {
    return 'builder';
  }

  if (answers.support === 'direct' && answers.stage === 'stuck') {
    return 'builder';
  }

  if (answers.support === 'direct' && answers.project === 'website') {
    return 'founder';
  }

  if (answers.support === 'direct' && answers.stage === 'partly-built') {
    return 'founder';
  }

  if (answers.support === 'community') {
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
    project: data.get('project') || 'personal',
    stage: data.get('stage') || 'idea',
    support: data.get('support') || 'free',
  };
}

function initPaidLanes(root = document) {
  const heading = root.querySelector('#paid-lanes-title');
  const section = root.querySelector('#paid-lanes');
  if (!section) {
    return;
  }

  if (heading) {
    heading.textContent = 'Choose a paid lane and pay securely';
    const intro = heading.nextElementSibling;
    if (intro) {
      intro.textContent = 'No portal account is required before payment. Choose a lane, continue to Stripe, and use the portal later when it becomes useful.';
    }
  }

  const plans = ['starter', 'pro', 'builder', 'embedded'];
  section.querySelectorAll('.lane-card').forEach((card, index) => {
    const link = card.querySelector('a.button.primary');
    if (link && plans[index]) {
      link.href = buildBillingStartHref(plans[index]);
    }
  });
}

function initStartRouter(root = document) {
  initPaidLanes(root);
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

export { ROUTES, buildBillingStartHref, getRecommendation, getRouteKey, initPaidLanes, initStartRouter };
