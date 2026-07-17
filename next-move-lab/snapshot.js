const MODES = Object.freeze({
  career: Object.freeze({
    title: 'Try one new path',
    hears: 'You want a safe way to try a new path.',
    lens: 'Try one small step before you make a big choice.',
    nextAction: 'Ask one person in this kind of job for a 20-minute talk.',
    route: '../career-launch/',
    routeLabel: 'Make a job plan',
    routeDetail: 'Turn this idea into one small work sample.'
  }),
  startup: Object.freeze({
    title: 'Test the idea with one person',
    hears: 'You want to know if one person needs this idea.',
    lens: 'First, see if one person wants it.',
    nextAction: 'Write one short offer and show it to one customer.',
    route: '../launch-room/?mode=test-service',
    routeLabel: 'Plan a small test',
    routeDetail: 'Pick one person, one offer, and one first step.'
  }),
  build: Object.freeze({
    title: 'Build one useful thing',
    hears: 'You want to make the idea small enough to try.',
    lens: 'The first version only needs to help one person do one thing.',
    nextAction: 'Write one line about the smallest version that can help.',
    route: '../free-page/',
    routeLabel: 'Make a free page idea',
    routeDetail: 'Turn the idea into one simple web page.'
  })
});

export function normalizeSnapshotText(value = '', maxLength = 600) {
  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLength);
}

export function getNextMoveMode(mode = '') {
  return MODES[normalizeSnapshotText(mode, 40)] || null;
}

export function createClaritySnapshot(input = {}) {
  const modeId = normalizeSnapshotText(input.mode, 40);
  const mode = getNextMoveMode(modeId);
  const situation = normalizeSnapshotText(input.situation);
  const desired = normalizeSnapshotText(input.desired);
  const constraint = normalizeSnapshotText(input.constraint);

  if (!mode) {
    throw new Error('Choose what you are trying to figure out.');
  }
  if (!situation || !desired || !constraint) {
    throw new Error('Answer all three questions to create a useful snapshot.');
  }

  return {
    mode: modeId,
    title: mode.title,
    hears: mode.hears,
    situation,
    desired,
    constraint,
    lens: mode.lens,
    nextAction: mode.nextAction,
    route: mode.route,
    routeLabel: mode.routeLabel,
    routeDetail: mode.routeDetail,
    disclaimer: 'This is an idea, not expert advice.'
  };
}

const FALLBACK_PATHS = Object.freeze({
  career: Object.freeze([
    Object.freeze({
      title: 'Talk to someone doing the work',
      fit: 'Good when you need facts before you choose.',
      tradeoff: 'One talk will not make the choice for you.',
      experiment: 'Ask one person for a 20-minute talk.'
    }),
    Object.freeze({
      title: 'Make a tiny proof project',
      fit: 'Good when you learn by doing.',
      tradeoff: 'It takes time before you know if it fits.',
      experiment: 'Make one small sample in two hours.'
    }),
    Object.freeze({
      title: 'Test an adjacent role',
      fit: 'Good when a big change feels too risky.',
      tradeoff: 'It may feel slow, but it keeps you safe.',
      experiment: 'Find one job that uses skills you have now.'
    })
  ]),
  startup: Object.freeze([
    Object.freeze({
      title: 'Interview one possible customer',
      fit: 'Good when you are not sure the problem is real.',
      tradeoff: 'You may learn your best idea is not needed.',
      experiment: 'Ask one person how they solve it now.'
    }),
    Object.freeze({
      title: 'Offer the result manually',
      fit: 'Good when you can help before you build an app.',
      tradeoff: 'It is more work, but you learn fast.',
      experiment: 'Show one clear offer to one buyer.'
    }),
    Object.freeze({
      title: 'Run a landing-page test',
      fit: 'Good when your offer is clear.',
      tradeoff: 'A click tells you less than a talk or a sale.',
      experiment: 'Post one promise and one button.'
    })
  ]),
  build: Object.freeze([
    Object.freeze({
      title: 'Build the smallest useful demo',
      fit: 'Good when one result can test the idea.',
      tradeoff: 'Most of the big idea must wait.',
      experiment: 'Make one screen that does the main job.'
    }),
    Object.freeze({
      title: 'Deliver it manually first',
      fit: 'Good when you need to learn how the work goes.',
      tradeoff: 'It feels less like a product, but you learn fast.',
      experiment: 'Help one person without building the full tool.'
    }),
    Object.freeze({
      title: 'Mock up the decision',
      fit: 'Good when you need to know if people like the idea.',
      tradeoff: 'A picture cannot prove the tool will work.',
      experiment: 'Show one simple page to one person.'
    })
  ])
});

export function createFallbackGuidance(snapshot) {
  const paths = FALLBACK_PATHS[snapshot?.mode] || FALLBACK_PATHS.build;

  return {
    title: snapshot.title,
    whatItHears: snapshot.hears,
    paths: paths.map(path => ({ ...path })),
    recommendation: {
      title: paths[0].title,
      why: snapshot.lens
    },
    assumptionToTest: 'One real person wants this enough to try it.',
    nextAction: snapshot.nextAction,
    followUpQuestion: 'What would make this worth one more week?',
    fallback: true
  };
}

export function snapshotToText(snapshot, guidance = null) {
  const lines = [
    '3dvr Next Move — Clarity Snapshot',
    '',
    guidance?.title || snapshot.title,
    '',
    `Where I am: ${snapshot.situation}`,
    `What I want: ${snapshot.desired}`,
    `What the plan must respect: ${snapshot.constraint}`,
    ''
  ];

  if (guidance) {
    lines.push(`What Compass hears: ${guidance.whatItHears}`, '', 'Paths worth testing:');
    guidance.paths.forEach((path, index) => {
      lines.push(
        `${index + 1}. ${path.title}`,
        `   Fit: ${path.fit}`,
        `   Tradeoff: ${path.tradeoff}`,
        `   Experiment: ${path.experiment}`
      );
    });
    lines.push(
      '',
      `Recommendation: ${guidance.recommendation.title}`,
      guidance.recommendation.why,
      `Biggest assumption: ${guidance.assumptionToTest}`,
      `Next 24-hour move: ${guidance.nextAction}`,
      `Follow-up question: ${guidance.followUpQuestion}`
    );
  } else {
    lines.push(`Working lens: ${snapshot.lens}`, `Next 24-hour move: ${snapshot.nextAction}`);
  }

  lines.push('', snapshot.disclaimer);
  return lines.join('\n');
}
