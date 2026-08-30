export const AV_FREELANCE_HERO_EXPERIMENT = Object.freeze({
  id: 'av-freelance-hero',
  page: 'av-freelance',
  riskClass: 'copy',
  conversionEvent: 'work-agent-open',
  minViewsPerVariant: 25,
  minConversions: 3,
  minRelativeLift: 0.1,
  zThreshold: 1.96,
  variants: Object.freeze([
    Object.freeze({
      key: 'ownership',
      label: 'Ownership-first',
      weight: 1,
      headline: 'You already know how to run the show. Build work that belongs to you.',
      copy: 'For event technicians who are good at the work but want more control over their time, clients, rates, and direction. Keep your income stable while you build a freelance runway one relationship at a time.',
      cta: 'Use the free Work Agent',
    }),
    Object.freeze({
      key: 'outcome',
      label: 'Outcome-first',
      weight: 1,
      headline: 'Turn your AV experience into better freelance calls — without quitting first.',
      copy: 'Use your real schedule, experience, and rate boundaries to build a freelance pipeline while keeping the work you already have. Start with the next good client, not a dramatic career leap.',
      cta: 'Build my freelance profile — free',
    }),
  ]),
});
