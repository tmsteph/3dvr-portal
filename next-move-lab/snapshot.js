const MODES = Object.freeze({
  career: Object.freeze({
    title: 'Find a direction worth testing',
    lens: 'Treat this as a direction to test, not a permanent identity decision.',
    nextAction: 'Name one person who understands this world and ask for a 20-minute reality-check conversation.',
    route: '../career-launch/',
    routeLabel: 'Build a Career Launch Brief',
    routeDetail: 'Turn this direction into a small proof project and practical career evidence.'
  }),
  startup: Object.freeze({
    title: 'Turn the idea into a small test',
    lens: 'Do not build the whole business yet. Look for evidence that one real person wants the outcome.',
    nextAction: 'Write a one-sentence offer and show it to one possible customer before building more.',
    route: '../launch-room/?mode=test-service',
    routeLabel: 'Plan a tiny service test',
    routeDetail: 'Define the first audience, smallest useful offer, and a safe validation step.'
  }),
  build: Object.freeze({
    title: 'Reduce the build to one useful result',
    lens: 'The first version only needs to help one kind of person take one meaningful action.',
    nextAction: 'Describe the smallest useful version in one sentence and choose the single action it should make easier.',
    route: '../free-page/',
    routeLabel: 'Create a free page concept',
    routeDetail: 'Turn the idea into a focused one-page website or redesign preview.'
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
    situation,
    desired,
    constraint,
    lens: mode.lens,
    nextAction: mode.nextAction,
    route: mode.route,
    routeLabel: mode.routeLabel,
    routeDetail: mode.routeDetail,
    disclaimer: 'This is a reflection tool, not medical, legal, financial, or crisis advice.'
  };
}

const FALLBACK_PATHS = Object.freeze({
  career: Object.freeze([
    Object.freeze({
      title: 'Talk to someone doing the work',
      fit: 'Best when you need reality before choosing a direction.',
      tradeoff: 'A conversation gives evidence, but it will not make the decision for you.',
      experiment: 'Ask one person for a 20-minute reality check.'
    }),
    Object.freeze({
      title: 'Make a tiny proof project',
      fit: 'Best when you learn by doing and need evidence of your ability.',
      tradeoff: 'It costs time before you know whether the direction fits.',
      experiment: 'Build one two-hour sample of the work.'
    }),
    Object.freeze({
      title: 'Test an adjacent role',
      fit: 'Best when income and family constraints make a large leap unsafe.',
      tradeoff: 'The change may feel slower, but it protects what matters now.',
      experiment: 'Find one role that uses your current strengths in a better setting.'
    })
  ]),
  startup: Object.freeze([
    Object.freeze({
      title: 'Interview one possible customer',
      fit: 'Best when the problem is still less certain than the solution.',
      tradeoff: 'You may learn that your favorite idea is not the urgent one.',
      experiment: 'Ask one person how they solve this problem today.'
    }),
    Object.freeze({
      title: 'Offer the result manually',
      fit: 'Best when you can deliver value before building software.',
      tradeoff: 'Manual delivery does not scale, but it reveals what matters.',
      experiment: 'Write and show one clear service offer to one buyer.'
    }),
    Object.freeze({
      title: 'Run a landing-page test',
      fit: 'Best when the offer is clear enough to test interest.',
      tradeoff: 'Clicks are weaker evidence than conversations or payment.',
      experiment: 'Publish one promise and one call to action.'
    })
  ]),
  build: Object.freeze([
    Object.freeze({
      title: 'Build the smallest useful demo',
      fit: 'Best when one visible result can test the core idea.',
      tradeoff: 'Most of the full vision must wait.',
      experiment: 'Create one screen or flow that completes the main job.'
    }),
    Object.freeze({
      title: 'Deliver it manually first',
      fit: 'Best when you need to understand the workflow before automating it.',
      tradeoff: 'It feels less like a product, but teaches you faster.',
      experiment: 'Help one person get the result without building the system.'
    }),
    Object.freeze({
      title: 'Mock up the decision',
      fit: 'Best when feedback on the concept is more valuable than working code.',
      tradeoff: 'A mockup cannot prove technical feasibility.',
      experiment: 'Show a clickable or one-page concept to one intended user.'
    })
  ])
});

export function createFallbackGuidance(snapshot) {
  const paths = FALLBACK_PATHS[snapshot?.mode] || FALLBACK_PATHS.build;

  return {
    title: snapshot.title,
    whatItHears: `You want ${snapshot.desired.toLowerCase()} while respecting ${snapshot.constraint.toLowerCase()}`,
    paths: paths.map(path => ({ ...path })),
    recommendation: {
      title: paths[0].title,
      why: snapshot.lens
    },
    assumptionToTest: 'The first question is whether one real person finds this direction useful enough to engage with.',
    nextAction: snapshot.nextAction,
    followUpQuestion: 'What evidence would make this direction feel worth continuing for another week?',
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
