import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCrmEditingManager,
  CRM_STATUS_OPTIONS,
  CRM_MARKET_SEGMENT_OPTIONS,
  CRM_PAIN_SEVERITY_OPTIONS,
  CRM_PILOT_STATUS_OPTIONS,
} from '../crm/crm-editing.js';

describe('crm editing manager', () => {
  it('tracks editing ids with stable set semantics', () => {
    const manager = createCrmEditingManager();
    assert.equal(manager.count(), 0);

    assert.equal(manager.enter('abc'), true);
    assert.equal(manager.enter('abc'), false, 'duplicate entry should not change state');
    assert.equal(manager.isEditing('abc'), true);
    assert.deepEqual(manager.list(), ['abc']);
    assert.equal(manager.count(), 1);

    assert.equal(manager.exit('abc'), true);
    assert.equal(manager.isEditing('abc'), false);
    assert.equal(manager.count(), 0);
  });

  it('marks records for rendering without mutating inputs', () => {
    const recordA = { id: 'a' };
    const recordB = { id: 'b' };
    const manager = createCrmEditingManager(['b']);

    const marked = manager.markRecords([recordA, recordB]);
    assert.deepEqual(marked, [
      { record: recordA, editing: false },
      { record: recordB, editing: true },
    ]);

    // ensure the original record objects are preserved
    assert.equal(marked[1].record, recordB);
  });

  it('clears all editing ids when requested', () => {
    const manager = createCrmEditingManager(['x', 'y']);
    assert.equal(manager.count(), 2);
    assert.equal(manager.clear(), true);
    assert.equal(manager.count(), 0);
    assert.deepEqual(manager.list(), []);
  });
});

describe('crm option sets', () => {
  it('provides the default CRM status labels', () => {
    assert.deepEqual(Array.from(CRM_STATUS_OPTIONS), ['', 'Lead', 'Prospect', 'Active', 'Negotiating', 'Won', 'Lost']);
  });

  it('provides the market segment, pain severity, and pilot status labels', () => {
    assert.deepEqual(Array.from(CRM_MARKET_SEGMENT_OPTIONS), [
      '',
      'Owner-led service business',
      'Creative studio or agency',
      'Event or AV operator',
      'Educator or community org',
      'Local business with referrals',
      'Independent builder or side-hustle',
    ]);
    assert.deepEqual(Array.from(CRM_PAIN_SEVERITY_OPTIONS), ['', 'Low', 'Medium', 'High', 'Critical']);
    assert.deepEqual(Array.from(CRM_PILOT_STATUS_OPTIONS), ['', 'Watching', 'Warm', 'Pilot candidate', 'Pilot active', 'Customer', 'Not a fit']);
  });
});
