import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_OPERATOR_ESCALATION_GATEWAY_MODEL,
  DEFAULT_OPERATOR_ESCALATION_MODEL,
  DEFAULT_OPERATOR_GATEWAY_MODEL,
  DEFAULT_OPERATOR_MODEL,
  selectOperatorModel,
  shouldEscalateOperatorPrompt
} from '../src/operator/api.js';

test('operator keeps routine work on GPT-6 Luna', () => {
  assert.equal(DEFAULT_OPERATOR_MODEL, 'gpt-6-luna');
  assert.equal(DEFAULT_OPERATOR_GATEWAY_MODEL, 'openai/gpt-6-luna');
  assert.equal(shouldEscalateOperatorPrompt('What is on my list today?'), false);
  assert.equal(selectOperatorModel({ prompt: 'What is on my list today?' }), 'gpt-6-luna');
});

test('operator escalates clearly complex work to GPT-6 Sol', () => {
  const prompt = 'Analyze the portal architecture and compare the failure modes, then optimize the deployment strategy and explain the tradeoffs.';
  assert.equal(shouldEscalateOperatorPrompt(prompt), true);
  assert.equal(DEFAULT_OPERATOR_ESCALATION_MODEL, 'gpt-6-sol');
  assert.equal(selectOperatorModel({ prompt }), 'gpt-6-sol');
});

test('operator escalates short implementation requests to GPT-6 Sol', () => {
  assert.equal(shouldEscalateOperatorPrompt('Can we fix it?'), true);
  assert.equal(selectOperatorModel({ prompt: 'Can we fix it?' }), 'gpt-6-sol');
});

test('operator uses gateway-qualified GPT-6 model ids when routed through AI Gateway', () => {
  const prompt = 'Debug this broken interface screenshot and identify the root cause.';
  assert.equal(
    selectOperatorModel({ prompt, images: [{ dataUrl: 'data:image/png;base64,a' }], useGateway: true }),
    DEFAULT_OPERATOR_ESCALATION_GATEWAY_MODEL
  );
});


test('operator routes every screenshot turn to GPT-6 Sol for reliable vision', () => {
  const images = [{ dataUrl: 'data:image/png;base64,a' }];
  assert.equal(shouldEscalateOperatorPrompt('Read the code in this screenshot.', { images }), true);
  assert.equal(selectOperatorModel({ prompt: 'Read the code in this screenshot.', images }), DEFAULT_OPERATOR_ESCALATION_MODEL);
  assert.equal(selectOperatorModel({ prompt: 'What is this?', images, useGateway: true }), DEFAULT_OPERATOR_ESCALATION_GATEWAY_MODEL);
});
