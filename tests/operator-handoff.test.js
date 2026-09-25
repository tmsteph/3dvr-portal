import assert from 'node:assert/strict';
import test from 'node:test';

import {
  handoffPageContext,
  operatorHandoffUrl,
  readOperatorHandoff
} from '../operator/handoff.js';

test('operator handoff round-trips conversation and page context', () => {
  const url = operatorHandoffUrl({
    conversation: 'conversation-123',
    path: '/plan/?day=today',
    title: '3DVR Plan',
    heading: 'Today'
  });

  assert.match(url, /^\/operator\/\?/);

  const query = url.slice(url.indexOf('?'));
  const params = new URLSearchParams(query);
  assert.equal(params.get('conversation'), 'conversation-123');

  assert.deepEqual(readOperatorHandoff(query), {
    path: '/plan/?day=today',
    title: '3DVR Plan',
    heading: 'Today'
  });
});

test('operator handoff omits empty values and keeps operator fallback context', () => {
  assert.equal(operatorHandoffUrl(), '/operator/');

  assert.deepEqual(handoffPageContext({}, {
    path: '/operator/',
    title: '3DVR Operator',
    heading: 'What do you want to do?',
    area: 'operator'
  }), {
    path: '/operator/',
    title: '3DVR Operator',
    heading: 'What do you want to do?',
    area: 'operator'
  });
});

test('handoff page context prefers the source page when present', () => {
  assert.deepEqual(handoffPageContext({
    path: '/crm/',
    title: 'CRM',
    heading: 'Relationships'
  }, {
    path: '/operator/',
    title: '3DVR Operator',
    heading: 'What do you want to do?',
    area: 'operator'
  }), {
    path: '/crm/',
    title: 'CRM',
    heading: 'Relationships',
    area: 'portal-handoff'
  });
});
