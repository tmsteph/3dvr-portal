export const PATHWAY_MODES = Object.freeze({
  career: {
    id: 'career',
    route: 'career-launch',
    eyebrow: 'Career Launch',
    title: 'Find a direction and build proof',
    promise: 'Find a direction, build proof of your abilities, help real people, and turn that experience into paid work.',
    briefTitle: 'Career Launch Brief',
    storageKey: '3dvr.career-launch.progress.v1',
    disclaimer: 'This brief is a practical starting point, not a guarantee of employment or income.',
    steps: [
      {
        id: 'situation',
        label: 'Current situation',
        question: 'What is your current work situation?',
        help: 'Include paid work, unpaid work, caregiving, volunteering, hobbies, or personal projects.',
        placeholder: 'I am looking for work. I have helped family with scheduling and basic computer tasks.',
        required: true
      },
      {
        id: 'strengths',
        label: 'Strengths and interests',
        question: 'What do people ask you for help with, and what problems do you enjoy solving?',
        help: 'Ordinary, practical strengths count. You do not need formal credentials to name them.',
        placeholder: 'People ask me to organize information and explain technology clearly.',
        required: true
      },
      {
        id: 'direction',
        label: 'Possible direction',
        question: 'What fields or kinds of work are you curious about?',
        help: 'Choose one or two directions to explore, not a permanent answer.',
        placeholder: 'Office support, customer success, or digital marketing.',
        required: true
      },
      {
        id: 'constraints',
        label: 'Income and constraints',
        question: 'How quickly do you need income, and what constraints should the plan respect?',
        help: 'Consider schedule, transportation, tools, education, health, and family responsibilities.',
        placeholder: 'I need income within a month, can work weekdays, and use public transportation.',
        required: true
      },
      {
        id: 'contact',
        label: 'Someone to help',
        question: 'Who is one real person or organization you could help this week?',
        help: 'A friend, local group, nonprofit, small business, school, or community organization is enough.',
        placeholder: 'The neighborhood food pantry that posts updates manually.',
        required: true
      },
      {
        id: 'project',
        label: 'Tiny project',
        question: 'What useful result could you create for them in a few hours or a few days?',
        help: 'Keep it small, observable, and safe to attempt with their permission.',
        placeholder: 'Organize their volunteer schedule and create a reusable sign-up sheet.',
        required: true
      },
      {
        id: 'evidence',
        label: 'Evidence',
        question: 'How could you document the result without exposing private information?',
        help: 'Consider a before-and-after description, screenshot with permission, testimonial, or measured result.',
        placeholder: 'Save a blank version of the template and ask for a short testimonial.',
        required: true
      },
      {
        id: 'nextStep',
        label: 'Paid-work next step',
        question: 'Could this support a job application, portfolio, freelance offer, or startup experiment?',
        help: 'Choose the most useful next door to open. You can change direction later.',
        placeholder: 'Use it in applications for operations assistant roles and offer the setup to another nonprofit.',
        required: true
      }
    ],
    tools: [
      { label: 'Add this to my job search', href: '../job-tracker/index.html', detail: 'Track roles, applications, and follow-up.' },
      { label: 'Update my profile', href: '../profile.html', detail: 'Record the strengths and evidence you can show.' },
      { label: 'Build my first proof project', href: '../launch-room/?mode=begin-career', detail: 'Turn the project into a concrete launch brief.' },
      { label: 'Contact someone who needs this', href: '../crm/index.html', detail: 'Save the person and your next conversation.' },
      { label: 'Plan the next seven days', href: '../tasks/', detail: 'Turn the next three actions into tasks.' }
    ]
  },
  opportunity: {
    id: 'opportunity',
    route: 'opportunity-builder',
    eyebrow: 'Opportunity Builder',
    title: 'Create opportunity where you already contribute',
    promise: 'Use startup skills to become more valuable, visible, and capable in the work you already do.',
    briefTitle: 'Opportunity Brief',
    storageKey: '3dvr.opportunity-builder.progress.v1',
    disclaimer: 'Respect workplace rules, privacy, data access, safety requirements, and decision-making authority.',
    steps: [
      {
        id: 'context',
        label: 'Current context',
        question: 'Where do you currently work, learn, volunteer, or contribute?',
        help: 'Name the setting and your role without sharing private or sensitive information.',
        placeholder: 'I help with scheduling at a community arts program.',
        required: true
      },
      {
        id: 'problem',
        label: 'Problem noticed',
        question: 'What recurring frustration, delay, or inefficiency do you notice?',
        help: 'Focus on an observable workflow, not blame or confidential information.',
        placeholder: 'Workshop registrations arrive in several inboxes and are easy to miss.',
        required: true
      },
      {
        id: 'people',
        label: 'People affected',
        question: 'Who is affected, and what does the problem make harder for them?',
        help: 'Consider coworkers, customers, students, volunteers, or community members.',
        placeholder: 'Coordinators lose time and attendees wait too long for confirmation.',
        required: true
      },
      {
        id: 'strengths',
        label: 'Strengths to apply',
        question: 'What strengths could you apply to this problem?',
        help: 'Include communication, organization, research, technical, creative, or relationship skills.',
        placeholder: 'I am organized, write clearly, and can make simple shared forms.',
        required: true
      },
      {
        id: 'experiment',
        label: 'Small experiment',
        question: 'What small improvement could you test without a large budget or formal authority?',
        help: 'Do not make unauthorized changes. A draft, mockup, or suggested process can be the experiment.',
        placeholder: 'Draft one intake form and a confirmation checklist for the coordinator to review.',
        required: true
      },
      {
        id: 'stakeholder',
        label: 'Conversation first',
        question: 'Who should you speak with before testing it, and what permission do you need?',
        help: 'Ask before accessing data, changing a workflow, contacting people, or representing an organization.',
        placeholder: 'Ask the program coordinator to review the draft and approve a small test.',
        required: true
      },
      {
        id: 'evidence',
        label: 'Evidence and opportunity',
        question: 'What result would demonstrate value, and what opportunity could it create?',
        help: 'Think about time saved, fewer errors, clearer communication, a portfolio example, or a better role.',
        placeholder: 'Measure response time for one workshop and document the approved process for my portfolio.',
        required: true
      }
    ],
    tools: [
      { label: 'Plan the improvement', href: '../launch-room/?mode=improve-current-work', detail: 'Turn the experiment into a focused project.' },
      { label: 'Track the people involved', href: '../crm/index.html', detail: 'Keep stakeholder conversations and follow-up visible.' },
      { label: 'Develop the opportunity', href: '../growth-operator/', detail: 'Organize approved follow-up and the next useful result.' },
      { label: 'Save it as a project', href: '../projects/index.html', detail: 'Keep the evidence and next version together.' },
      { label: 'Plan the next seven days', href: '../tasks/', detail: 'Schedule the conversation, experiment, and review.' }
    ]
  }
});

export function getPathwayConfig(mode = '') {
  return PATHWAY_MODES[mode] || null;
}

export function createEmptyPathwayState(config) {
  return {
    mode: config.id,
    step: 0,
    answers: Object.fromEntries(config.steps.map(step => [step.id, ''])),
    brief: null
  };
}
