import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperatorRequest } from '../src/operator/api.js';
import { OPERATOR_OWNER_CONTEXT } from '../src/operator/context.js';

test('operator request carries the founder and 3DVR context', () => {
  const request = buildOperatorRequest({ prompt: 'What should I work on today?' });

  assert.match(request.instructions, /Thomas Stephens \(tmsteph\)/);
  assert.match(request.instructions, /founder of 3DVR \/ 3dvr\.tech/);
  assert.match(request.instructions, /spend less time inside general-purpose chat apps/);
  assert.match(request.instructions, /Operator as the conversational front door to 3DVR/);
  assert.match(request.instructions, /open source over lock-in/);
});

test('founder context stays focused on professional product context', () => {
  const text = OPERATOR_OWNER_CONTEXT.join(' ');

  assert.doesNotMatch(text, /medical|diagnosis|partner|child|address|password|secret/i);
  assert.match(text, /Do not expose, guess, or invent private or sensitive personal details/);
});

test('operator carries the 3DVR executive constitution', () => {
  const request = buildOperatorRequest({ prompt: 'What should 3DVR do next?' });
  assert.match(request.instructions, /3DVR Executive Constitution/i);
  assert.match(request.instructions, /glanceable interfaces/i);
  assert.match(request.instructions, /reject distracting work/i);
});

const GUEST_ACCESS = Object.freeze({
  authenticated: false,
  approved: false,
  role: 'contributor',
  permissions: ['suggest'],
  reason: 'Sign in with a 3DVR account to use developer actions.'
});

test('guest operator request carries only the public company context', () => {
  const request = buildOperatorRequest({
    prompt: 'Who are you assisting?',
    developerAccess: GUEST_ACCESS,
    portalContext: {
      version: 1,
      apps: { crm: { available: true, count: 1, records: [{ name: 'Secret Client' }] } },
      capabilities: { available: true, capabilities: [{ id: 'remote-linux' }] }
    },
    memoryContext: { text: 'Private memory marker.' }
  });

  assert.doesNotMatch(request.instructions, /primarily assisting Thomas Stephens/);
  assert.doesNotMatch(request.instructions, /Executive Constitution/i);
  assert.doesNotMatch(request.instructions, /spend less time inside general-purpose chat apps/);
  assert.doesNotMatch(request.instructions, /Secret Client/);
  assert.doesNotMatch(request.instructions, /remote-linux/);
  assert.doesNotMatch(request.instructions, /Private memory marker/);
  assert.doesNotMatch(request.instructions, /one safe action per turn/i);
  assert.match(request.instructions, /guest visitor/i);
  assert.match(request.instructions, /cannot access private records here/i);
  assert.match(request.instructions, /Never claim you queued/);
  assert.match(request.instructions, /3dvrtech@gmail\.com/);
  assert.match(request.instructions, /\+1 864-360-2659/);
  assert.match(request.instructions, /only when the other person explicitly asks/i);
});

test('member operator request uses the member context and only their own snapshot', () => {
  const request = buildOperatorRequest({
    prompt: 'What should I work on?',
    developerAccess: {
      authenticated: true,
      approved: false,
      role: 'contributor',
      permissions: ['suggest'],
      identity: { alias: 'friend@3dvr', pub: 'member-pub' }
    },
    portalContext: {
      version: 1,
      apps: { lifeSpace: { available: true, items: [{ text: 'Member own note' }] } }
    }
  });

  assert.doesNotMatch(request.instructions, /primarily assisting Thomas Stephens/);
  assert.doesNotMatch(request.instructions, /Executive Constitution/i);
  assert.doesNotMatch(request.instructions, /spend less time inside general-purpose chat apps/);
  assert.match(request.instructions, /friend@3dvr/);
  assert.match(request.instructions, /Member own note/);
  assert.match(request.instructions, /one safe action per turn/i);
});

test('owner operator request keeps the founder context and constitution', () => {
  const request = buildOperatorRequest({
    prompt: 'What should I work on?',
    developerAccess: {
      authenticated: true,
      approved: true,
      role: 'owner',
      permissions: ['suggest', 'edit', 'github_write'],
      identity: { alias: 'tmsteph@3dvr', pub: 'owner-pub' }
    }
  });

  assert.match(request.instructions, /primarily assisting Thomas Stephens/);
  assert.match(request.instructions, /Executive Constitution/i);
});
