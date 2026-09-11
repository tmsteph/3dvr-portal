import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpportunityCaptureHref,
  parseOpportunityCaptureContext,
} from '../src/money-printer/opportunityLinks.js';

describe('CRM ↔ Opportunity Engine links', () => {
  it('builds and parses a stable CRM-linked opportunity capture URL', () => {
    const href = buildOpportunityCaptureHref({
      id: 'person-123',
      groupId: 'org-9',
      name: 'Tom & Co',
    });

    assert.match(href, /^\.\.\/money-printer\/\?/);
    const query = href.split('?')[1];
    assert.deepEqual(parseOpportunityCaptureContext(query), {
      personId: 'person-123',
      organizationId: 'org-9',
      crmName: 'Tom & Co',
    });
  });

  it('keeps unlinked opportunity capture backwards compatible', () => {
    assert.equal(buildOpportunityCaptureHref({}, '../money-printer/'), '../money-printer/');
    assert.deepEqual(parseOpportunityCaptureContext(''), {
      personId: '',
      organizationId: '',
      crmName: '',
    });
  });
});
