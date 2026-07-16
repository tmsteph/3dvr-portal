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

export function snapshotToText(snapshot) {
  return [
    '3dvr Next Move — Clarity Snapshot',
    '',
    snapshot.title,
    '',
    `Where I am: ${snapshot.situation}`,
    `What I want: ${snapshot.desired}`,
    `What the plan must respect: ${snapshot.constraint}`,
    '',
    `Working lens: ${snapshot.lens}`,
    `Next 24-hour move: ${snapshot.nextAction}`,
    '',
    snapshot.disclaimer
  ].join('\n');
}
