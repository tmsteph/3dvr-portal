import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createEmptyPathwayState, getPathwayConfig, PATHWAY_MODES } from '../career-pathways/pathway-config.js';
import {
  generatePathwayBrief,
  isPathwayComplete,
  listMissingPathwaySteps
} from '../career-pathways/brief-generator.js';
import {
  clearPathwayProgress,
  readPathwayProgress,
  writePathwayProgress
} from '../career-pathways/pathway-storage.js';
import { buildModeBrief, getLaunchRoomMode, LAUNCH_ROOM_MODES } from '../launch-room/modes.js';

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key)
  };
}

const careerAnswers = {
  situation: 'I am changing careers after caregiving.',
  strengths: 'People ask me to organize schedules and explain technology.',
  direction: 'operations support',
  constraints: 'I need income within a month and use public transportation.',
  contact: 'a neighborhood food pantry',
  project: 'a reusable volunteer scheduling template',
  evidence: 'an approved blank template and a short testimonial',
  nextStep: 'applications for operations assistant roles'
};

const opportunityAnswers = {
  context: 'a community arts program',
  problem: 'registrations arrive in several inboxes',
  people: 'coordinators and workshop attendees',
  strengths: 'clear writing and process organization',
  experiment: 'a draft intake form and confirmation checklist',
  stakeholder: 'the program coordinator',
  evidence: 'approved response-time results from one workshop'
};

test('pathway mode selection exposes career and current-work configurations', () => {
  assert.equal(getPathwayConfig('career'), PATHWAY_MODES.career);
  assert.equal(getPathwayConfig('opportunity'), PATHWAY_MODES.opportunity);
  assert.equal(getPathwayConfig('unknown'), null);
  assert.equal(PATHWAY_MODES.career.steps.length, 8);
  assert.equal(PATHWAY_MODES.opportunity.steps.length, 7);
});

test('pathway progress persists, restores, and clears without changing its mode', () => {
  const storage = createMemoryStorage();
  const config = PATHWAY_MODES.career;
  const state = createEmptyPathwayState(config);
  state.step = 3;
  state.answers.situation = careerAnswers.situation;

  assert.equal(writePathwayProgress(config, state, storage), true);
  assert.deepEqual(readPathwayProgress(config, storage), state);
  assert.equal(clearPathwayProgress(config, storage), true);
  assert.equal(readPathwayProgress(config, storage), null);
});

test('empty and incomplete pathway states report the missing steps', () => {
  const config = PATHWAY_MODES.career;
  const empty = createEmptyPathwayState(config);

  assert.equal(isPathwayComplete(config, empty.answers), false);
  assert.equal(listMissingPathwaySteps(config, empty.answers).length, config.steps.length);
  assert.equal(isPathwayComplete(config, careerAnswers), true);
});

test('Career Launch generates every required practical brief section', () => {
  const brief = generatePathwayBrief('career', careerAnswers);
  const labels = brief.sections.map(section => section.label);

  assert.equal(brief.title, 'Career Launch Brief');
  assert.deepEqual(labels, [
    'Current situation',
    'Recommended direction',
    'Transferable strengths',
    'One skill to develop',
    'One tiny real-world project',
    'One person or organization to contact',
    'Suggested outreach message',
    'Evidence to collect',
    'Portfolio or resume language',
    'Immediate income option',
    'Longer-term career option',
    'Next three actions'
  ]);
  assert.match(JSON.stringify(brief), /neighborhood food pantry/);
  assert.match(JSON.stringify(brief), /operations assistant roles/);
  assert.doesNotMatch(JSON.stringify(brief), /guaranteed employment/i);
});

test('Opportunity Builder generates safe workplace-specific language', () => {
  const brief = generatePathwayBrief('opportunity', opportunityAnswers);
  const output = JSON.stringify(brief);

  assert.equal(brief.title, 'Opportunity Brief');
  assert.match(output, /confirm the right permissions/i);
  assert.match(output, /Do not access private data/i);
  assert.match(output, /without assuming a promotion is guaranteed/i);
  assert.match(output, /approved response-time results/);
});

test('new pathway pages expose brief actions and contextual portal navigation', async () => {
  const careerHtml = await readFile(new URL('../career-launch/index.html', import.meta.url), 'utf8');
  const opportunityHtml = await readFile(new URL('../opportunity-builder/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../career-pathways/app.js', import.meta.url), 'utf8');
  const homeHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const startHtml = await readFile(new URL('../start/index.html', import.meta.url), 'utf8');

  assert.match(careerHtml, /data-pathway-mode="career"/);
  assert.match(careerHtml, /Career Launch Brief/);
  assert.match(careerHtml, /Job Tracker/);
  assert.match(opportunityHtml, /data-pathway-mode="opportunity"/);
  assert.match(opportunityHtml, /Opportunity Brief/);
  assert.match(opportunityHtml, /Growth Operator/);
  assert.match(app, /readPathwayProgress/);
  assert.match(app, /writePathwayProgress/);
  assert.match(app, /data-action="reset"/);
  assert.match(app, /window\.print/);
  assert.match(app, /navigator\.clipboard/);
  [homeHtml, startHtml].forEach(html => {
    assert.match(html, /I feel stuck/);
    assert.match(html, /I need a career/);
    assert.match(html, /I want to grow in my current career/);
    assert.match(html, /I want to start something/);
  });
});

test('Launch Room supports all five requested modes and practical workplace language', () => {
  const expectedModes = [
    'improve-current-work',
    'begin-career',
    'help-someone',
    'test-service',
    'start-project'
  ];

  expectedModes.forEach(mode => assert.ok(LAUNCH_ROOM_MODES[mode]));
  assert.equal(getLaunchRoomMode('begin-career').briefLabel, 'Proof Project Brief');

  const workBrief = buildModeBrief('improve-current-work', {
    worldPain: 'requests get lost',
    worldWish: 'a clear intake path',
    firstAudience: 'the team lead',
    tinyProject: 'a draft checklist',
    movementName: 'Intake Test'
  });
  assert.match(workBrief.worldview, /workplace rules/);
  assert.match(workBrief.worldview, /before testing/);
  assert.doesNotMatch(workBrief.worldview, /movement gives people/i);
});
