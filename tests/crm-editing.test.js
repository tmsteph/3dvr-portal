import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createCrmEditingManager,
  CRM_STATUS_OPTIONS,
  CRM_MARKET_SEGMENT_OPTIONS,
  CRM_PAIN_SEVERITY_OPTIONS,
  CRM_PILOT_STATUS_OPTIONS,
  CRM_WARMTH_OPTIONS,
  CRM_FIT_OPTIONS,
  CRM_URGENCY_OPTIONS,
  CRM_RECORD_TYPE_OPTIONS,
  normalizeCrmRecordType,
  normalizeCrmWarmth,
  parseCrmList,
  sanitizeCrmRecord,
  buildCrmRelationshipBoard,
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
    assert.deepEqual(Array.from(CRM_STATUS_OPTIONS), ['', 'Warm - Awareness', 'Warm - Discovery', 'Warm - Invited', 'Warm - Follow-up', 'Lead', 'Prospect', 'Active', 'Negotiating', 'Won', 'Lost']);
  });

  it('provides the market segment, pain severity, pilot status, and record type labels', () => {
    assert.deepEqual(Array.from(CRM_MARKET_SEGMENT_OPTIONS), [
      '',
      'Professional services',
      'Local services',
      'Support team or community org',
      'Owner-led service business',
      'Creative studio or agency',
      'Event or AV operator',
      'Educator or community org',
      'Independent builder or side-hustle',
    ]);
    assert.deepEqual(Array.from(CRM_PAIN_SEVERITY_OPTIONS), ['', 'Low', 'Medium', 'High', 'Critical']);
    assert.deepEqual(Array.from(CRM_PILOT_STATUS_OPTIONS), ['', 'Watching', 'Warm', 'Pilot candidate', 'Pilot active', 'Customer', 'Not a fit']);
    assert.deepEqual(Array.from(CRM_WARMTH_OPTIONS), [
      { value: '', label: 'Warmth' },
      { value: 'cold', label: 'Cold' },
      { value: 'warm', label: 'Warm' },
      { value: 'hot', label: 'Hot' },
    ]);
    assert.deepEqual(Array.from(CRM_FIT_OPTIONS), [
      { value: '', label: 'Fit' },
      { value: 'website', label: 'Website' },
      { value: 'branding', label: 'Branding' },
      { value: 'app', label: 'App' },
      { value: 'support', label: 'Support' },
      { value: 'consulting', label: 'Consulting' },
    ]);
    assert.deepEqual(Array.from(CRM_URGENCY_OPTIONS), [
      { value: '', label: 'Urgency' },
      { value: 'low', label: 'Low' },
      { value: 'medium', label: 'Medium' },
      { value: 'high', label: 'High' },
    ]);
    assert.deepEqual(Array.from(CRM_RECORD_TYPE_OPTIONS), [
      { value: 'person', label: 'Person / lead' },
      { value: 'group', label: 'Group / account' },
      { value: 'problem', label: 'Problem / pain' },
    ]);
  });
});

describe('crm relationship helpers', () => {
  it('normalizes record types and list fields', () => {
    assert.equal(normalizeCrmRecordType('GROUP'), 'group');
    assert.equal(normalizeCrmRecordType('problem'), 'problem');
    assert.equal(normalizeCrmRecordType('anything-else'), 'person');
    assert.equal(normalizeCrmWarmth('', 'Warm - Discovery'), 'warm');
    assert.equal(normalizeCrmWarmth('', 'Negotiating'), 'hot');
    assert.deepEqual(parseCrmList('alpha, beta\nalpha'), ['alpha', 'beta']);
    assert.deepEqual(sanitizeCrmRecord({
      id: 'p-1',
      recordType: 'Person',
      groupId: '  g-1  ',
      linkedGroupIds: ['g-1', 'g-1', 'g-2'],
      linkedPersonIds: 'p-1, p-2',
      status: 'Warm - Awareness',
      fit: 'APP',
      urgency: 'HIGH',
      nextFollowup: '2026-04-10',
      nextExperiment: 'Send a proposal',
      objection: 'Timing is messy',
    }), {
      id: 'p-1',
      recordType: 'person',
      groupId: 'g-1',
      linkedGroupIds: 'g-1, g-2',
      linkedPersonIds: 'p-1, p-2',
      status: 'Warm - Awareness',
      fit: 'app',
      urgency: 'high',
      nextFollowUp: '2026-04-10',
      nextExperiment: 'Send a proposal',
      nextBestAction: 'Send a proposal',
      objection: 'Timing is messy',
      warmth: 'warm',
      lastContacted: '',
    });
  });

  it('builds group, people, and problem relationships for the CRM pipeline', () => {
    const board = buildCrmRelationshipBoard([
      { id: 'group-a', recordType: 'group', name: 'Acme Studio', updated: '2026-03-24T10:00:00.000Z' },
      { id: 'person-a', recordType: 'person', name: 'Ava', groupId: 'group-a', updated: '2026-03-24T11:00:00.000Z' },
      { id: 'person-b', recordType: 'person', name: 'Ben', updated: '2026-03-24T09:00:00.000Z' },
      { id: 'problem-a', recordType: 'problem', name: 'Missed follow-up', linkedGroupIds: 'group-a', linkedPersonIds: 'person-a', updated: '2026-03-24T12:00:00.000Z' },
      { id: 'problem-b', recordType: 'problem', name: 'Weak homepage', linkedPersonIds: 'person-b', updated: '2026-03-24T08:00:00.000Z' },
    ]);

    assert.equal(board.groups.length, 1);
    assert.equal(board.groups[0].group.id, 'group-a');
    assert.deepEqual(board.groups[0].members.map(record => record.id), ['person-a']);
    assert.deepEqual(board.groups[0].linkedProblems.map(record => record.id), ['problem-a']);
    assert.deepEqual(board.standalonePeople.map(record => record.id), ['person-b']);
    assert.deepEqual(board.linkedProblemsByPersonId['person-a'].map(record => record.id), ['problem-a']);
    assert.deepEqual(board.linkedProblemsByPersonId['person-b'].map(record => record.id), ['problem-b']);
    assert.deepEqual(board.standaloneProblems.map(record => record.id), []);
  });
});
