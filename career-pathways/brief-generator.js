function clean(value = '') {
  return String(value).trim().replace(/\s+/g, ' ');
}

function sentence(value = '') {
  const normalized = clean(value).replace(/[.!?]+$/, '');
  return normalized ? `${normalized}.` : '';
}

function answer(answers, key, fallback) {
  return clean(answers?.[key]) || fallback;
}

export function isPathwayComplete(config, answers = {}) {
  return config.steps
    .filter(step => step.required)
    .every(step => clean(answers[step.id]));
}

export function listMissingPathwaySteps(config, answers = {}) {
  return config.steps
    .filter(step => step.required && !clean(answers[step.id]))
    .map(step => step.label);
}

function generateCareerBrief(answers) {
  const situation = answer(answers, 'situation', 'You are exploring a new work direction.');
  const strengths = answer(answers, 'strengths', 'practical communication, learning, and follow-through');
  const direction = answer(answers, 'direction', 'a role where those strengths solve visible problems');
  const constraints = answer(answers, 'constraints', 'your current schedule, tools, and income needs');
  const contact = answer(answers, 'contact', 'one person or organization you can reach safely');
  const project = answer(answers, 'project', 'a small useful result you can complete with permission');
  const evidence = answer(answers, 'evidence', 'a short, privacy-safe record of the result');
  const nextStep = answer(answers, 'nextStep', 'a relevant application, portfolio entry, or paid offer');

  return {
    kind: 'career',
    title: 'Career Launch Brief',
    sections: [
      { label: 'Current situation', value: sentence(situation) },
      {
        label: 'Recommended direction',
        value: `Explore ${direction}. Treat this as a direction to test through useful work, not a permanent decision.`
      },
      { label: 'Transferable strengths', value: sentence(strengths) },
      {
        label: 'One skill to develop',
        value: `Practice the skill most needed to complete this result: ${project}. Work within ${constraints}.`
      },
      { label: 'One tiny real-world project', value: sentence(project) },
      { label: 'One person or organization to contact', value: sentence(contact) },
      {
        label: 'Suggested outreach message',
        value: `Hi, I am building experience in ${direction}. I noticed a small way I may be able to help: ${project}. `
          + 'Would it be useful if I drafted a small version for you to review? I will not make changes or use private '
          + 'information without your permission.'
      },
      { label: 'Evidence to collect', value: sentence(evidence) },
      {
        label: 'Portfolio or resume language',
        value: `Created ${project} for ${contact}, applying ${strengths}. Document the approved result and any measured improvement.`
      },
      {
        label: 'Immediate income option',
        value: `Prioritize work compatible with ${constraints}. Use this proof when applying for adjacent entry-level, temporary, `
          + 'contract, or freelance work; do not wait for the project before pursuing urgent income.'
      },
      {
        label: 'Longer-term career option',
        value: `Build several small proof projects toward ${direction}, then use the evidence to pursue ${nextStep}.`
      },
      {
        label: 'Next three actions',
        items: [
          `Contact ${contact} and ask whether ${project} would be useful.`,
          `Complete the smallest approved version and collect ${evidence}.`,
          `Use the result to take this next step: ${nextStep}.`
        ]
      }
    ]
  };
}

function generateOpportunityBrief(answers) {
  const context = answer(answers, 'context', 'your current work or community setting');
  const problem = answer(answers, 'problem', 'a recurring problem worth understanding');
  const people = answer(answers, 'people', 'the people affected by the problem');
  const strengths = answer(answers, 'strengths', 'your practical strengths');
  const experiment = answer(answers, 'experiment', 'a small, reversible improvement');
  const stakeholder = answer(answers, 'stakeholder', 'the person responsible for the workflow');
  const evidence = answer(answers, 'evidence', 'an approved, privacy-safe result');

  return {
    kind: 'opportunity',
    title: 'Opportunity Brief',
    sections: [
      { label: 'Problem noticed', value: sentence(problem) },
      { label: 'People affected', value: sentence(people) },
      { label: 'User strengths', value: sentence(strengths) },
      { label: 'Small experiment', value: sentence(experiment) },
      { label: 'Stakeholder conversation', value: sentence(stakeholder) },
      {
        label: 'Suggested message',
        value: `I have noticed ${problem} in ${context}. I drafted a small idea that may help: ${experiment}. `
          + `Before testing anything, could I review it with you and confirm the right permissions?`
      },
      {
        label: 'Risks or permissions to consider',
        value: 'Confirm ownership, approval, privacy, security, accessibility, budget, safety, and who may be affected. '
          + 'Do not access private data, contact people, or change a live process without authorization.'
      },
      { label: 'Evidence to collect', value: sentence(evidence) },
      { label: 'Skill demonstrated', value: `Problem discovery, stakeholder communication, and ${strengths}.` },
      {
        label: 'Career opportunity created',
        value: `Use the approved result to demonstrate initiative and capability in ${context}. Discuss responsibility, `
          + 'development, or a better-fit role without assuming a promotion is guaranteed.'
      },
      {
        label: 'Possible side offer or startup direction',
        value: `Only after the need is validated and conflicts are cleared, explore whether ${experiment} could help similar `
          + 'people outside this organization.'
      },
      {
        label: 'Next three actions',
        items: [
          `Write down the observed problem without blame or private information: ${problem}.`,
          `Speak with ${stakeholder} before testing or changing anything.`,
          `Run the smallest approved experiment and collect this evidence: ${evidence}.`
        ]
      }
    ]
  };
}

export function generatePathwayBrief(mode, answers = {}) {
  if (mode === 'career') return generateCareerBrief(answers);
  if (mode === 'opportunity') return generateOpportunityBrief(answers);
  throw new Error(`Unsupported pathway mode: ${mode}`);
}

export function briefToText(brief) {
  return [
    brief.title,
    '',
    ...brief.sections.flatMap(section => [
      section.label,
      ...(section.items || [section.value]),
      ''
    ])
  ].join('\n').trim();
}
