const BASE_FIELDS = ['worldPain', 'worldWish', 'firstAudience', 'tinyProject', 'movementName'];

export const LAUNCH_ROOM_MODES = Object.freeze({
  movement: {
    id: 'movement',
    label: 'Start a project or movement',
    briefLabel: 'Movement Brief',
    nameLabel: 'Movement Name',
    title: 'From frustration to Movement Brief',
    description: 'Turn a vague frustration into a Movement Brief you can use to start a real project.',
    fields: {
      worldPain: ['What are you tired of seeing in the world?', 'Example: People feel stuck in work that drains them.'],
      worldWish: ['What do you wish existed instead?', 'Example: A calm place to name what matters and launch a small project.'],
      firstAudience: ['Who would you help first?', 'Example: One friend with a useful idea but no launch plan.'],
      tinyProject: ['What tiny version could exist this week?', 'Example: A one-page brief or prototype people can react to.'],
      movementName: ['What should we call this movement?', 'Example: Human Scale Work or The First Tiny Project']
    },
    tools: [
      ['Open Projects', '../projects/index.html'],
      ['Open Growth Operator', '../growth-operator/'],
      ['Track people in CRM', '../crm/index.html']
    ]
  },
  'improve-current-work': {
    id: 'improve-current-work',
    label: 'Improve my current work',
    briefLabel: 'Work Improvement Brief',
    nameLabel: 'Project or Improvement',
    title: 'From a work problem to a responsible experiment',
    description: 'Notice a real problem, speak with the right people, and test a small improvement with permission.',
    fields: {
      worldPain: ['What feels frustrating, inefficient, neglected, or unnecessarily difficult?', 'Describe an observable work problem without blame or private information.'],
      worldWish: ['What would a useful improvement look like?', 'Describe the better result in practical terms.'],
      firstAudience: ['Who is affected, and who should you speak with first?', 'Name the stakeholder who can review or approve a test.'],
      tinyProject: ['What small, reversible improvement could you propose?', 'A draft, mockup, checklist, or approved trial is enough.'],
      movementName: ['What should we call this project, experiment, or improvement?', 'Example: Faster Intake Test']
    },
    tools: [
      ['Build an Opportunity Brief', '../opportunity-builder/'],
      ['Plan the next seven days', '../tasks/'],
      ['Track stakeholders in CRM', '../crm/index.html']
    ]
  },
  'begin-career': {
    id: 'begin-career',
    label: 'Begin a career',
    briefLabel: 'Proof Project Brief',
    nameLabel: 'Proof Project',
    title: 'From career direction to a proof project',
    description: 'Practice a useful skill, help a real person, and create evidence you can communicate.',
    fields: {
      worldPain: ['What career problem or gap are you trying to move through?', 'Example: I have little formal experience in the field I want to enter.'],
      worldWish: ['What useful ability do you want to demonstrate?', 'Choose one skill a real project can make visible.'],
      firstAudience: ['Who could you help or learn from this week?', 'Name one person, business, nonprofit, or community group.'],
      tinyProject: ['What small useful result could you create with their permission?', 'Keep it safe, specific, and possible within a few days.'],
      movementName: ['What should we call this proof project?', 'Example: Community Schedule Cleanup']
    },
    tools: [
      ['Open Career Launch', '../career-launch/'],
      ['Add this to Job Tracker', '../job-tracker/index.html'],
      ['Update my Profile', '../profile.html']
    ]
  },
  'help-someone': {
    id: 'help-someone',
    label: 'Help someone I know',
    briefLabel: 'Help Project Brief',
    nameLabel: 'Project Name',
    title: 'Turn care into one useful result',
    description: 'Start with a real person, ask what would help, and make the smallest useful thing together.',
    fields: {
      worldPain: ['What is difficult for the person you want to help?', 'Describe what you have noticed, then confirm it with them.'],
      worldWish: ['What result might make their week easier?', 'Keep the result concrete and modest.'],
      firstAudience: ['Who do you want to help first?', 'Name the person or organization you can actually contact.'],
      tinyProject: ['What could you offer to draft or test for them?', 'Ask before making changes or using their information.'],
      movementName: ['What should we call this small help project?', 'Example: Simple Booking Cleanup']
    },
    tools: [
      ['Contact someone in CRM', '../crm/index.html'],
      ['Plan the next seven days', '../tasks/'],
      ['Save it as a Project', '../projects/index.html']
    ]
  },
  'test-service': {
    id: 'test-service',
    label: 'Test a service',
    briefLabel: 'Service Test Brief',
    nameLabel: 'Service Test',
    title: 'From useful skill to a small service test',
    description: 'Choose one reachable person, test a clear result, and learn before building a larger business.',
    fields: {
      worldPain: ['What practical problem could you help solve?', 'Use the words a potential customer would use.'],
      worldWish: ['What result could you responsibly offer?', 'Avoid promises you cannot verify or control.'],
      firstAudience: ['Who is the first reachable person who may need this?', 'Choose a narrow group or one real contact.'],
      tinyProject: ['What is the smallest paid or free pilot you could test?', 'Define a small scope, result, and feedback question.'],
      movementName: ['What should we call this service test?', 'Example: 48-Hour Follow-Up Cleanup']
    },
    tools: [
      ['Turn this into an offer', '../offer-garden/'],
      ['Open Growth Operator', '../growth-operator/'],
      ['Track conversations in CRM', '../crm/index.html']
    ]
  },
  'start-project': {
    id: 'start-project',
    label: 'Start a project or movement',
    briefLabel: 'Project Brief',
    nameLabel: 'Project Name',
    title: 'From an idea to a small real project',
    description: 'Help someone, test the smallest useful version, and learn from a real response.',
    fields: {
      worldPain: ['What problem, need, or possibility keeps getting your attention?', 'Describe what feels neglected or unnecessarily difficult.'],
      worldWish: ['What useful change would you like to make possible?', 'Describe a result people can understand.'],
      firstAudience: ['Who would you help first?', 'Choose someone you can reach and learn from.'],
      tinyProject: ['What tiny version could exist this week?', 'A page, event, guide, prototype, or service test is enough.'],
      movementName: ['What should we call this project, experiment, or improvement?', 'Choose a clear working name.']
    },
    tools: [
      ['Save it as a Project', '../projects/index.html'],
      ['Open Growth Operator', '../growth-operator/'],
      ['Turn this into an offer', '../offer-garden/']
    ]
  }
});

export function getLaunchRoomMode(mode = '') {
  return LAUNCH_ROOM_MODES[mode] || LAUNCH_ROOM_MODES.movement;
}

export function buildModeBrief(modeId, state = {}) {
  const mode = getLaunchRoomMode(modeId);
  const values = Object.fromEntries(BASE_FIELDS.map(key => [key, String(state[key] || '').trim()]));
  const name = values.movementName || mode.nameLabel;
  const problem = values.worldPain || 'a real problem worth understanding';
  const outcome = values.worldWish || 'a useful improvement people can see';
  const audience = values.firstAudience || 'one reachable person affected by the problem';
  const project = values.tinyProject || 'a small version that can be reviewed this week';
  const workplaceMode = mode.id === 'improve-current-work';

  return {
    movementName: name,
    mission: `${name} helps ${audience} move from ${problem} toward ${outcome} through ${project}.`,
    worldview: workplaceMode
      ? `Start by confirming the problem with the people affected. Respect workplace rules, privacy, data access, safety, and decision-making authority before testing ${project}.`
      : `The idea becomes useful when it creates a real result for a real person. Start with ${project}, learn from the response, and expand only when the evidence supports it.`,
    audience,
    tinyProject: project,
    checklist: [
      `Describe the problem in plain language: ${problem}.`,
      `Confirm the desired result with ${audience}: ${outcome}.`,
      workplaceMode ? 'Ask the responsible stakeholder for permission before testing anything.' : 'Ask the person whether this result would actually help.',
      `Complete the smallest useful version: ${project}.`,
      'Document the result without exposing private information.'
    ],
    actions: [
      `Today: contact ${audience} and confirm the problem.`,
      `This week: create ${project}.`,
      `Next: collect one piece of evidence and decide the next responsible step.`
    ]
  };
}
