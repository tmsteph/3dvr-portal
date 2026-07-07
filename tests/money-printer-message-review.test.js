import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessMessageRisk,
  createMessageReviewItem,
  seedTrustReviewQueue
} from '../src/money-printer/messageReview.js';

test('message review gates cold commercial outreach for human review', () => {
  const item = createMessageReviewItem({
    leadName: 'Local Contractor',
    leadTemperature: 'cold',
    offer: '$50/mo follow-up desk',
    subject: 'Quick idea for quote follow-up',
    body: 'I can help set up a simple follow-up desk for $50/mo.',
    whyGenerated: 'Market Pulse found quote follow-up pain.',
    whyLeadRelevant: 'Local service business with quote flow.',
    offerConnection: 'Connects to the follow-up desk offer.',
    hasOptOut: true
  });

  assert.equal(item.riskLevel, 'YELLOW');
  assert.equal(item.requiresReview, true);
  assert.equal(item.canAutoSend, false);
  assert.match(item.riskExplanation, /Lead is cold/);
  assert.match(item.riskExplanation, /pricing|checkout|billing|money/i);
  assert.equal(item.compliance.optOutRequired, true);
});

test('message review marks sensitive promises as red', () => {
  const assessment = assessMessageRisk({
    leadTemperature: 'cold',
    subject: 'Guaranteed results',
    body: 'We guarantee you will make money and can advise on legal compliance.',
    hasOptOut: true
  });

  assert.equal(assessment.riskLevel, 'RED');
  assert.equal(assessment.requiresReview, true);
  assert.equal(assessment.canAutoSend, false);
  assert.match(assessment.explanation, /strong promise/i);
  assert.match(assessment.explanation, /legal/i);
});

test('message review allows only pre-approved low-risk relationship templates to be green', () => {
  const assessment = assessMessageRisk({
    leadTemperature: 'warm',
    relationship: 'existing-contact',
    messageType: 'thank-you',
    preApprovedTemplate: true,
    commercial: false,
    subject: 'Thanks for the update',
    body: 'Thanks for the update. I saved this and will follow up with the next clear step.'
  });

  assert.equal(assessment.riskLevel, 'GREEN');
  assert.equal(assessment.requiresReview, false);
  assert.equal(assessment.canAutoSend, true);
});

test('seed queue includes explained review actions and risk levels', () => {
  const queue = seedTrustReviewQueue();
  assert.equal(queue.length >= 3, true);
  assert.equal(queue.every(item => item.actions.includes('approve-send')), true);
  assert.equal(queue.every(item => item.actions.includes('ban-lead')), true);
  assert.equal(queue.some(item => item.riskLevel === 'GREEN'), true);
  assert.equal(queue.some(item => item.riskLevel === 'YELLOW'), true);
  assert.equal(queue.every(item => item.whyGenerated && item.whyLeadRelevant && item.offerConnection), true);
});
