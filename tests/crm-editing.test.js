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
  CRM_CONVERSATION_PLAN_OPTIONS,
  buildConversationCaptureRecord,
  buildGunConversationCapturePayload,
  normalizeCrmRecordType,
  normalizeCrmWarmth,
  normalizeConversationCaptureList,
  parseCrmList,
  sanitizeConversationCaptureRecord,
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

describe('crm conversation capture helpers', () => {
  it('normalizes structured mobile discovery captures', () => {
    assert.deepEqual(Array.from(CRM_CONVERSATION_PLAN_OPTIONS), [
      'Free',
      '$5/mo',
      '$20/mo',
      '$50/mo',
      'Custom',
      'Not interested yet',
    ]);
    assert.deepEqual(normalizeConversationCaptureList({
      1: 'Needs design',
      0: 'No website',
      _: 'gun metadata',
    }), ['No website', 'Needs design']);

    const record = buildConversationCaptureRecord({
      personId: 'person-1',
      name: 'Max',
      relationship: 'coworker',
      contactMethod: 'in person only',
      projectType: 'art/music',
      projectDescription: 'Aspiring audio engineer learning Dante and networking.',
      painPoints: ['No website', 'No website', 'Needs design'],
      exactWords: 'I want to learn more general computer knowledge.',
      interestedPlan: '$20/mo',
      signupTrigger: 'A clear AV learning path.',
      interestLevel: 'Interested',
      nextAction: 'Send example site',
      followUpDate: '2026-06-08',
    }, { id: 'guest-1', label: 'Thomas' }, {
      idFactory: () => 'capture-1',
      now: new Date('2026-06-04T20:00:00.000Z'),
    });

    assert.deepEqual(record, {
      id: 'capture-1',
      personId: 'person-1',
      name: 'Max',
      relationship: 'Coworker',
      contactMethod: 'In person only',
      contactDetail: '',
      projectType: 'Art/music',
      projectDescription: 'Aspiring audio engineer learning Dante and networking.',
      painPoints: ['No website', 'Needs design'],
      exactWords: 'I want to learn more general computer knowledge.',
      interestedPlan: '$20/mo',
      signupTrigger: 'A clear AV learning path.',
      interestLevel: 'Interested',
      nextAction: 'Send example site',
      followUpDate: '2026-06-08',
      createdAt: '2026-06-04T20:00:00.000Z',
      updatedAt: '2026-06-04T20:00:00.000Z',
      source: 'mobile-conversation',
      capturedBy: 'guest-1',
      capturedByLabel: 'Thomas',
    });
  });

  it('sanitizes captures without losing optional incomplete fields', () => {
    assert.deepEqual(sanitizeConversationCaptureRecord({
      id: 'capture-2',
      name: 'Sean',
      painPoints: 'No website, Needs booking/forms',
      interestedPlan: 'custom',
      nextAction: 'send pricing',
      source: '',
    }), {
      id: 'capture-2',
      personId: '',
      name: 'Sean',
      relationship: '',
      contactMethod: '',
      contactDetail: '',
      projectType: '',
      projectDescription: '',
      painPoints: ['No website', 'Needs booking/forms'],
      exactWords: '',
      interestedPlan: 'Custom',
      signupTrigger: '',
      interestLevel: '',
      nextAction: 'Send pricing',
      followUpDate: '',
      createdAt: '',
      updatedAt: '',
      source: 'mobile-conversation',
    });
  });

  it('serializes captures into a Gun-safe payload without losing readable pain points', () => {
    const payload = buildGunConversationCapturePayload({
      id: 'capture-3',
      name: 'Rae',
      painPoints: ['No website', 'No website', 'Needs booking/forms'],
      interestedPlan: '$50/mo',
    });

    assert.equal(Array.isArray(payload.painPoints), false);
    assert.equal(payload.painPoints, 'No website\nNeeds booking/forms');
    assert.deepEqual(sanitizeConversationCaptureRecord(payload).painPoints, [
      'No website',
      'Needs booking/forms',
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

describe('CRM Flow canonical revenue action boundary', () => {
  it('preserves manual review dates and blocks shortcut sales writes for canonical records', async () => {
    const elements = new Map();
    const handlers = {};
    const writes = [];
    let receive;
    const el = id => {
      if (!elements.has(id)) elements.set(id, {
        hidden: id === 'leadDrawer', value: '', innerHTML: '', textContent: '',
        addEventListener(type, fn) { handlers[id + ':' + type] = fn; },
      });
      return elements.get(id);
    };
    const chain = {
      get() { return this; }, map() { return this; },
      on(fn) { receive = fn; },
      put(data, ack) { writes.push(data); if (ack) ack({}); },
    };
    const old = {document: globalThis.document, window: globalThis.window, Gun: globalThis.Gun};
    try {
      globalThis.document = {getElementById: el, querySelectorAll: () => [],
        addEventListener(type, fn) { handlers[type] = fn; }};
      globalThis.window = {clearTimeout() {}, setTimeout() {}};
      globalThis.Gun = () => chain;
      await import('../crm/flow.js');
      const canonical = {recordType: 'person', source: '3dvr-revenue-ledger', nextFollowUp: '2000-01-01'};
      const failed = {...canonical, id: 'failed', name: 'Review only', canonicalState: 'failed', status: 'Lead'};
      const suppressed = {...canonical, id: 'suppressed', name: 'Suppressed', canonicalState: 'suppressed', status: 'Closed', warmth: 'hot'};
      const paid = {...canonical, id: 'paid', name: 'Paid', canonicalState: 'replied', status: 'Paid Customer', warmth: 'hot'};
      const ordinary = {id:'ordinary', name:'Ordinary', recordType:'person', status:'Lead', nextFollowUp:'2000-01-01'};
      for (const r of [failed, suppressed, paid, ordinary]) receive(r, r.id);
      window.crmFlow.render();
      assert.equal(el('metricToday').textContent, '1', 'only ordinary sales reminder is due');
      assert.match(el('todayList').innerHTML, /Review only/);
      assert.match(el('todayList').innerHTML, /Review due/);
      assert.doesNotMatch(el('todayList').innerHTML, /Suppressed|Paid/);
      assert.equal(window.crmFlow.getStage(suppressed), 'parked');
      assert.equal(window.crmFlow.getStage(paid), 'parked');
      const click = (action, id) => handlers.click({target:{closest:()=>({dataset:{flowAction:action, recordId:id}})}});
      for (const r of [failed, suppressed, paid]) for (const action of ['snooze','log-touch','mark-won']) click(action,r.id);
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(writes.length, 0, 'canonical shortcuts cannot change CRM or touch log');
      click('open',failed.id);
      window.crmFlow.render();
      assert.equal(el('drawerFollowUp').value,'2000-01-01');
      assert.equal(el('drawerActions').hidden,true);
      el('drawerFollowUp').value='2030-01-01';
      el('drawerStatus').value='Won';
      el('drawerWarmth').value='hot';
      await handlers['drawerForm:submit']({preventDefault(){}});
      assert.equal(writes.length,1);
      assert.equal(writes[0].status,'Lead');
      assert.equal(writes[0].canonicalState,'failed');
      assert.equal(writes[0].nextFollowUp,'2030-01-01');
      click('snooze',ordinary.id);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(writes.length,2);
      assert.equal(writes[1].status,'Warm - Follow-up');
    } finally {
      for (const [key,value] of Object.entries(old)) {
        if (value === undefined) delete globalThis[key]; else globalThis[key]=value;
      }
    }
  });
});

describe('CRM main workspace canonical sales boundary', () => {
  it('filters non-sales records and prevents shortcut writes, including after a prompt', async () => {
    const {readFileSync}=await import('node:fs');
    const {runInNewContext}=await import('node:vm');
    const {isCanonicalRevenue,isClosedRevenue,canUseCrmSalesShortcuts}=await import('../crm/crm-editing.js').catch(()=>({}));
    const source=readFileSync(new URL('../crm/app.js',import.meta.url),'utf8');
    const fn=(name,next)=>source.slice(source.indexOf(name),source.indexOf(next,source.indexOf(name)));
    const rows=[];
    const canonical={recordType:'person',source:'3dvr-revenue-ledger',nextFollowUp:'2000-01-01',warmth:'hot'};
    const records=[
      {...canonical,id:'failed',canonicalState:'failed',status:'Lead'},
      {...canonical,id:'suppressed',canonicalState:'suppressed',status:'Closed'},
      {...canonical,id:'paid',canonicalState:'replied',status:'Paid Customer'},
      {id:'closed',recordType:'person',status:'Closed',nextFollowUp:'2000-01-01'},
      {id:'ordinary',recordType:'person',status:'Lead',nextFollowUp:'2000-01-01'}
    ];
    const index=Object.fromEntries(records.map(r=>[r.id,r]));
    let prompts=0,writes=0,touches=0;
    const ctx={SALES_STALE_DAYS:7,isCanonicalRevenue,isClosedRevenue,canUseCrmSalesShortcuts,sanitizeCrmRecord,
      state:{board:{people:records,index}},crmIndex:index,elements:{},window:{alert(){}},
      normalizeFollowUpInput:v=>v,comparePeopleByFollowUpThenName:()=>0,comparePeopleByRecencyThenName:()=>0,
      resolveLeadWarmth:r=>r.warmth,hasOutreachDraft:()=>false,renderSalesMoveRows:(_,r)=>rows.push(r.map(x=>x.id).join(',')),
      openTouchPrompt:async r=>{prompts++;if(r.id==='ordinary' && prompts===2){index.ordinary={...r,canonicalState:'suppressed'};return {touchType:'outreach-sent'};}return null;},
      pruneRecordForType:r=>r,putCrmRecord:async()=>{writes++},appendTouchLogEntry:()=>{touches++},
      normalizeTouchType:v=>v,getTouchTypeLabel:v=>v,deriveStatusFromTouch:()=> 'Lead',toActivityCount:()=>0,scoreManager:null,console
    };
    const api=runInNewContext([
      fn('function needsReplyResponse','\nfunction '),
      fn('function renderSalesMoves','function putCrmRecord'),
      fn('async function logTouch','function buildDetailSummary'),
      '({renderSalesMoves,logTouch,quickFollowUp})'
    ].join('\n'),ctx);
    api.renderSalesMoves();
    assert.equal(rows[0],'ordinary','only ordinary record should enter sales follow-up queue');
    for(const r of records.slice(0,4)){await api.logTouch(r.id);api.quickFollowUp(r.id);}
    assert.equal(prompts,0);assert.equal(writes,0);assert.equal(touches,0);
    await api.logTouch('ordinary');assert.equal(prompts,1);
    await api.logTouch('ordinary');assert.equal(prompts,2);assert.equal(writes,0,'new suppression after prompt must veto write');
    index.ordinary=records[4];api.quickFollowUp('ordinary');await new Promise(r=>setImmediate(r));
    assert.equal(writes,1);assert.equal(touches,1);
  });
});

