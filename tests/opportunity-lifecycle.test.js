import test from 'node:test';
import assert from 'node:assert/strict';

import {
  opportunityLifecycleView,
  projectOpportunityStatus,
  toCanonicalOpportunityStatus,
} from '../src/opportunity-lifecycle.js';

test('maps the three existing opportunity vocabularies into one lifecycle', () => {
  assert.equal(toCanonicalOpportunityStatus('Found', 'freelance'), 'discovered');
  assert.equal(toCanonicalOpportunityStatus('Applied', 'freelance'), 'contacted');
  assert.equal(toCanonicalOpportunityStatus('Offered', 'freelance'), 'offered');
  assert.equal(toCanonicalOpportunityStatus('awaiting_booking_approval', 'work-agent'), 'booking-pending');
  assert.equal(toCanonicalOpportunityStatus('sent', 'work-agent'), 'contacted');
  assert.equal(toCanonicalOpportunityStatus('won', 'engine'), 'booked');
  assert.equal(toCanonicalOpportunityStatus('response-ready', 'engine'), 'ready');
});

test('projects canonical state back to each existing surface without changing their storage vocabulary', () => {
  assert.equal(projectOpportunityStatus('contacted', 'freelance'), 'Applied');
  assert.equal(projectOpportunityStatus('contacted', 'work-agent'), 'sent');
  assert.equal(projectOpportunityStatus('contacted', 'engine'), 'contacted');
  assert.equal(projectOpportunityStatus('booking-pending', 'freelance'), 'Offered');
  assert.equal(projectOpportunityStatus('booking-pending', 'work-agent'), 'awaiting_booking_approval');
  assert.equal(projectOpportunityStatus('booked', 'engine'), 'won');
});

test('lifecycle view distinguishes active workflow from terminal outcomes', () => {
  assert.deepEqual(opportunityLifecycleView({ status: 'Interview' }, 'freelance'), {
    canonicalStatus: 'conversation',
    sourceStatus: 'Interview',
    isOpen: true,
    isActionable: true,
  });
  assert.equal(opportunityLifecycleView({ status: 'Rejected' }, 'freelance').isOpen, false);
  assert.equal(opportunityLifecycleView({ status: 'expired' }, 'engine').isActionable, false);
});
