'use strict';

(function initEmailOperator(window, document) {
  if (!window || !document) {
    return;
  }

  const SEED_VERSION = '2026-03-22-email-operator-v1';
  const STAGE_ORDER = {
    triage: 0,
    drafting: 1,
    approval: 2,
    automation: 3,
    sent: 4,
    archive: 5,
  };
  const STAGE_LABELS = {
    triage: 'Needs triage',
    drafting: 'Drafting',
    approval: 'Approval queue',
    automation: 'Automation lane',
    sent: 'Sent',
    archive: 'Archived',
  };
  const ACTION_LABELS = {
    'queue-draft': 'Moved into the draft queue.',
    'ready-approval': 'Marked ready for approval.',
    'route-automation': 'Routed into the automation lane.',
    'open-mail': 'Opened the draft in your email app.',
    'mark-sent': 'Marked as sent and logged the outreach touch.',
    'archive-thread': 'Archived for reference.',
    'reopen-thread': 'Re-opened for fresh triage.',
  };
  const CATEGORY_LABELS = {
    sales: 'Sales',
    support: 'Support',
    scheduling: 'Scheduling',
    followup: 'Follow-up',
    finance: 'Finance',
  };

  const refs = {
    connectionBadge: document.getElementById('connection-badge'),
    operatorBadge: document.getElementById('operator-badge'),
    metricActive: document.getElementById('metric-active'),
    metricTriage: document.getElementById('metric-triage'),
    metricApproval: document.getElementById('metric-approval'),
    metricAutomation: document.getElementById('metric-automation'),
    visibleCount: document.getElementById('visible-count'),
    threadList: document.getElementById('thread-list'),
    threadSubject: document.getElementById('thread-subject'),
    threadSummary: document.getElementById('thread-summary'),
    threadFrom: document.getElementById('thread-from'),
    threadCompany: document.getElementById('thread-company'),
    threadCategory: document.getElementById('thread-category'),
    threadReceived: document.getElementById('thread-received'),
    threadCrmStage: document.getElementById('thread-crm-stage'),
    threadNextStep: document.getElementById('thread-next-step'),
    recommendedAction: document.getElementById('recommended-action'),
    threadContactContext: document.getElementById('thread-contact-context'),
    threadRelationshipContext: document.getElementById('thread-relationship-context'),
    stageChip: document.getElementById('stage-chip'),
    urgencyChip: document.getElementById('urgency-chip'),
    draftEditor: document.getElementById('draft-editor'),
    notesEditor: document.getElementById('notes-editor'),
    operatorPrompt: document.getElementById('operator-prompt'),
    activityFeed: document.getElementById('activity-feed'),
    filters: Array.from(document.querySelectorAll('[data-filter]')),
    actionButtons: Array.from(document.querySelectorAll('[data-operator-action]')),
    generateDraft: document.getElementById('generate-draft'),
    saveDraft: document.getElementById('save-draft'),
    copyDraft: document.getElementById('copy-draft'),
    saveNotes: document.getElementById('save-notes'),
    copyPrompt: document.getElementById('copy-prompt'),
  };
  const params = new URLSearchParams(window.location.search);

  function normalizeText(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeFilter(value) {
    const normalized = normalizeText(value).toLowerCase();
    if (normalized === 'all') {
      return 'all';
    }
    return Object.prototype.hasOwnProperty.call(STAGE_ORDER, normalized) ? normalized : 'all';
  }

  function sanitizeNodeKey(value) {
    const normalized = normalizeText(value).toLowerCase();
    const compact = normalized.replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    return compact || 'operator';
  }

  function safeLocalStorageGet(key) {
    try {
      return window.localStorage.getItem(key) || '';
    } catch (_error) {
      return '';
    }
  }

  function normalizeEmail(value) {
    return normalizeText(value).toLowerCase();
  }

  function parseTagList(value) {
    return normalizeText(value)
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  function compactTextParts(parts) {
    return parts
      .map(part => normalizeText(part))
      .filter(Boolean)
      .join(' ');
  }

  function createLocalGunSubscriptionStub() {
    return {
      off() {},
    };
  }

  function createLocalGunNodeStub() {
    const node = {
      __isGunStub: true,
      get() {
        return createLocalGunNodeStub();
      },
      put(_value, callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback({ err: 'gun-unavailable' }), 0);
        }
        return node;
      },
      once(callback) {
        if (typeof callback === 'function') {
          setTimeout(() => callback(undefined), 0);
        }
        return node;
      },
      on() {
        return createLocalGunSubscriptionStub();
      },
      map() {
        return {
          on() {
            return createLocalGunSubscriptionStub();
          },
        };
      },
      off() {},
    };
    return node;
  }

  function createLocalGunUserStub() {
    const node = createLocalGunNodeStub();
    return {
      ...node,
      is: null,
      _: {},
      recall() {},
    };
  }

  function createGunStub() {
    return {
      __isGunStub: true,
      get() {
        return createLocalGunNodeStub();
      },
      user() {
        return createLocalGunUserStub();
      },
    };
  }

  function ensureGunContext(factory, label) {
    const ensureGun = window.ScoreSystem && typeof window.ScoreSystem.ensureGun === 'function'
      ? window.ScoreSystem.ensureGun.bind(window.ScoreSystem)
      : null;

    if (ensureGun) {
      return ensureGun(factory, { label });
    }

    if (typeof factory === 'function') {
      try {
        const instance = factory();
        if (instance) {
          return {
            gun: instance,
            user: typeof instance.user === 'function' ? instance.user() : createLocalGunUserStub(),
            isStub: !!instance.__isGunStub,
          };
        }
      } catch (error) {
        console.warn(`Failed to initialize ${label || 'gun'} context`, error);
      }
    }

    const stub = createGunStub();
    return {
      gun: stub,
      user: stub.user(),
      isStub: true,
    };
  }

  function createEmailOperatorGun() {
    if (typeof Gun !== 'function') {
      return null;
    }

    const peers = window.__GUN_PEERS__ || [
      'wss://relay.3dvr.tech/gun',
      'wss://gun-relay-3dvr.fly.dev/gun',
    ];

    try {
      return Gun({ peers, axe: true });
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      if (/storage|quota|blocked|third-party/i.test(message)) {
        try {
          return Gun({ peers, axe: true, radisk: false, localStorage: false });
        } catch (fallbackError) {
          console.warn('Email Operator Gun fallback init failed', fallbackError);
        }
      } else {
        console.warn('Email Operator Gun init failed unexpectedly', error);
      }
    }

    return null;
  }

  function resolveOperatorIdentity() {
    if (window.AuthIdentity && typeof window.AuthIdentity.syncStorageFromSharedIdentity === 'function') {
      try {
        window.AuthIdentity.syncStorageFromSharedIdentity(window.localStorage);
      } catch (error) {
        console.warn('Failed to sync shared identity into local storage', error);
      }
    }

    const signedIn = safeLocalStorageGet('signedIn') === 'true';
    const alias = normalizeText(safeLocalStorageGet('alias'));
    const username = normalizeText(safeLocalStorageGet('username'));
    if (signedIn && alias) {
      return {
        key: sanitizeNodeKey(`user-${alias.toLowerCase()}`),
        label: username || alias.split('@')[0],
        mode: 'user',
      };
    }

    const ensureGuestIdentity = window.ScoreSystem
      && typeof window.ScoreSystem.ensureGuestIdentity === 'function'
      ? window.ScoreSystem.ensureGuestIdentity.bind(window.ScoreSystem)
      : null;
    const guestId = normalizeText(ensureGuestIdentity ? ensureGuestIdentity() : safeLocalStorageGet('guestId'));
    const guestDisplayName = normalizeText(safeLocalStorageGet('guestDisplayName')) || 'Guest operator';
    return {
      key: sanitizeNodeKey(`guest-${guestId || 'shared'}`),
      label: guestDisplayName,
      mode: 'guest',
    };
  }

  function readImportedDraftParams() {
    const imported = {
      threadId: normalizeText(params.get('threadId')),
      recordId: normalizeText(params.get('recordId')),
      lead: normalizeText(params.get('lead')) || normalizeText(params.get('name')),
      contact: normalizeText(params.get('contact')),
      email: normalizeEmail(params.get('email')),
      company: normalizeText(params.get('company')),
      status: normalizeText(params.get('status')),
      segment: normalizeText(params.get('segment')),
      pain: normalizeText(params.get('pain')),
      offer: normalizeText(params.get('offer')) || normalizeText(params.get('amount')),
      next: normalizeText(params.get('next')) || normalizeText(params.get('followup')),
      signal: normalizeText(params.get('signal')),
      experiment: normalizeText(params.get('experiment')),
      notes: normalizeText(params.get('notes')) || normalizeText(params.get('note')),
      source: normalizeText(params.get('source')),
      tags: parseTagList(params.get('tags')),
      subject: normalizeText(params.get('subject')),
      message: normalizeText(params.get('message')),
      draftRequested: params.get('draft') === '1',
    };

    const hasDraft = imported.draftRequested || [
      imported.threadId,
      imported.recordId,
      imported.lead,
      imported.contact,
      imported.email,
      imported.company,
      imported.segment,
      imported.pain,
      imported.offer,
      imported.notes,
      imported.source,
      imported.message,
    ].some(Boolean);

    return { imported, hasDraft };
  }

  function buildImportedThreadId(imported) {
    if (imported.threadId) {
      return sanitizeNodeKey(imported.threadId);
    }
    if (imported.recordId) {
      return sanitizeNodeKey(`crm-${imported.recordId}`);
    }
    const fallback = compactTextParts([
      imported.company,
      imported.contact,
      imported.lead,
      imported.segment,
      imported.source || 'outreach',
    ]);
    return sanitizeNodeKey(`import-${fallback || Date.now()}`);
  }

  function buildImportedSubject(imported) {
    if (imported.subject) {
      return imported.subject;
    }
    const subjectTarget = imported.company || imported.contact || imported.lead || imported.segment || 'outreach';
    if (imported.offer) {
      return `3dvr ${imported.offer} follow-up for ${subjectTarget}`;
    }
    return `3dvr follow-up for ${subjectTarget}`;
  }

  function buildImportedNotes(imported) {
    return [
      imported.notes,
      imported.signal ? `Signal: ${imported.signal}` : '',
      imported.experiment ? `Experiment: ${imported.experiment}` : '',
      imported.tags.length ? `Tags: ${imported.tags.join(', ')}` : '',
    ].filter(Boolean).join('\n');
  }

  function buildImportedDraftBody(imported, operatorLabel) {
    if (imported.message) {
      return imported.message;
    }

    const greetingName = imported.contact
      || imported.lead
      || imported.company
      || 'there';
    const supportLine = imported.pain
      ? `From what I can tell, the main pressure is ${imported.pain.toLowerCase()}.`
      : 'From what I can tell, the main pressure is keeping leads and follow-up from slipping.';
    const offerLine = imported.offer
      ? `The cleanest fit on our side looks like ${imported.offer} because it keeps the next action visible without adding a heavy stack.`
      : 'The cleanest fit on our side is a simple weekly operating loop that keeps the next action visible.';
    const nextLine = imported.next
      ? imported.next
      : 'If it helps, I can show you the simplest version and map the next step with you.';

    return [
      `${greetingName},`,
      '',
      'I do not think you need more software for the sake of it.',
      supportLine,
      offerLine,
      nextLine,
      '',
      `Best,`,
      operatorLabel,
    ].join('\n');
  }

  function buildImportedThread(imported, operatorLabel) {
    const targetName = imported.contact || imported.lead || imported.company || 'New outreach target';
    const company = imported.company || imported.lead || imported.segment || 'Unassigned company';
    const relationshipBits = [
      imported.segment ? `Segment: ${imported.segment}.` : '',
      imported.offer ? `Offer: ${imported.offer}.` : '',
      imported.source ? `Source: ${imported.source}.` : '',
    ].filter(Boolean).join(' ');
    const contactBits = [
      imported.pain ? `Pain heard: ${imported.pain}.` : '',
      imported.signal ? `Market signal: ${imported.signal}.` : '',
      imported.notes ? `Notes: ${imported.notes}` : '',
    ].filter(Boolean).join(' ');

    return {
      id: buildImportedThreadId(imported),
      subject: buildImportedSubject(imported),
      senderName: targetName,
      senderEmail: imported.email || 'add-email-before-send@example.com',
      company,
      category: 'sales',
      urgency: imported.offer ? 'high' : 'medium',
      stage: imported.draftRequested ? 'drafting' : 'triage',
      summary: imported.pain
        ? `Outbound draft for ${targetName} focused on ${imported.pain.toLowerCase()}.`
        : `Outbound draft for ${targetName}.`,
      recommendedAction: 'Tighten the note, open the email draft, then log the touch after you send it.',
      contactContext: contactBits || 'No pain notes yet. Add what you heard before you send the draft.',
      relationshipContext: relationshipBits || 'No segment or offer context yet.',
      crmStage: imported.status || 'Lead',
      nextStep: imported.next || 'Review the draft and send the first outreach note.',
      autoSendEligible: false,
      lastActionLabel: 'Imported from CRM or sales research.',
      receivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      draft: buildImportedDraftBody(imported, operatorLabel),
      notes: buildImportedNotes(imported),
      recordId: imported.recordId,
      marketSegment: imported.segment,
      primaryPain: imported.pain,
      offerAmount: imported.offer,
      source: imported.source || 'email-operator-import',
      tags: imported.tags.join(', '),
      direction: 'outbound',
      touchLoggedAt: '',
    };
  }

  function buildDefaultThreads(operatorLabel) {
    return [
      {
        id: 'solaris-pilot',
        subject: 'AR showroom pilot proposal for Solaris Labs',
        senderName: 'Marisol Vega',
        senderEmail: 'marisol@solarislabs.ai',
        company: 'Solaris Labs',
        category: 'sales',
        urgency: 'high',
        stage: 'approval',
        summary: 'They want a scoped pilot offer, pricing, and a kickoff window for an AR showroom install.',
        recommendedAction: 'Reply today with a pilot scope, a call slot, and a clear next milestone.',
        contactContext: 'Contact: warm lead from the XR hardware meetup. She asked for pricing within 24 hours.',
        relationshipContext: 'Relationship: first high-intent sales motion. Keep the tone sharp, specific, and fast.',
        crmStage: 'Proposal',
        nextStep: 'Send scoped pilot proposal and offer a 20-minute kickoff call.',
        autoSendEligible: false,
        lastActionLabel: 'Draft prepared for approval.',
        receivedAt: '2026-03-22T16:15:00.000Z',
        updatedAt: '2026-03-22T17:05:00.000Z',
        draft: `Marisol,\n\nThanks for the clear brief. We can scope the Solaris Labs AR showroom pilot as a focused six-week engagement covering concepting, scene assembly, and launch support.\n\nI can send a tighter proposal with pricing and milestone dates today. If helpful, I can also hold a 20-minute kickoff call tomorrow afternoon to align on the showroom footprint and success criteria.\n\nBest,\n${operatorLabel}`,
        notes: 'High-value lead. Mention the six-week delivery window and keep the proposal narrow.',
      },
      {
        id: 'harbor-support',
        subject: 'Portal login issue for Harbor Residency cohort',
        senderName: 'Chris Molina',
        senderEmail: 'chris@harborresidency.org',
        company: 'Harbor Residency',
        category: 'support',
        urgency: 'medium',
        stage: 'triage',
        summary: 'A cohort organizer reports that two members cannot restore access after resetting passwords.',
        recommendedAction: 'Confirm account aliases first, then route to support with a recovery checklist.',
        contactContext: 'Contact: recurring community partner. Support requests usually need same-day acknowledgment.',
        relationshipContext: 'Relationship: service trust matters more than sales tone here.',
        crmStage: 'Active account',
        nextStep: 'Confirm aliases, reproduce the issue, and reply with a recovery path.',
        autoSendEligible: false,
        lastActionLabel: 'Waiting for routing decision.',
        receivedAt: '2026-03-22T14:42:00.000Z',
        updatedAt: '2026-03-22T14:42:00.000Z',
        draft: '',
        notes: 'Possible billing/account mismatch. Loop in billing only if the aliases are correct.',
      },
      {
        id: 'boardwalk-followup',
        subject: 'Following up on Boardwalk activation recap',
        senderName: 'Jasmine Ortiz',
        senderEmail: 'jasmine@boardwalk.events',
        company: 'Boardwalk Events',
        category: 'followup',
        urgency: 'low',
        stage: 'drafting',
        summary: 'They want a concise recap deck and a note on how to extend the activation into summer.',
        recommendedAction: 'Draft a warm follow-up with recap timing and one concrete upsell path.',
        contactContext: 'Contact: existing partner. They respond well to concise notes with a single next step.',
        relationshipContext: 'Relationship: established. This is a retention and expansion motion.',
        crmStage: 'Expansion',
        nextStep: 'Send recap timing and pitch a summer extension package.',
        autoSendEligible: false,
        lastActionLabel: 'Moved into the draft queue.',
        receivedAt: '2026-03-22T12:10:00.000Z',
        updatedAt: '2026-03-22T15:05:00.000Z',
        draft: '',
        notes: 'Keep it to one screen. They do not want a long recap email.',
      },
      {
        id: 'mint-scheduling',
        subject: 'Reschedule Thursday planning call',
        senderName: 'Nina Patel',
        senderEmail: 'nina@mintoperations.co',
        company: 'Mint Operations',
        category: 'scheduling',
        urgency: 'low',
        stage: 'automation',
        summary: 'They only need a new time slot and already offered two alternative windows.',
        recommendedAction: 'This is a clean automation candidate once the calendar rules are wired.',
        contactContext: 'Contact: frequent collaborator with predictable scheduling patterns.',
        relationshipContext: 'Relationship: low-risk coordination thread.',
        crmStage: 'Operations',
        nextStep: 'Pick one of the proposed windows and confirm calendar holds.',
        autoSendEligible: true,
        lastActionLabel: 'Routed into the automation lane.',
        receivedAt: '2026-03-22T11:28:00.000Z',
        updatedAt: '2026-03-22T16:20:00.000Z',
        draft: `Nina,\n\nThursday works on our side if we move the planning call to one of the windows you suggested. I can hold either 11:00 AM or 2:30 PM Pacific. Reply with the better option and I will lock it in.\n\nBest,\n${operatorLabel}`,
        notes: 'Good first candidate for calendar-linked auto-replies after approval rules exist.',
      },
      {
        id: 'lattice-invoice',
        subject: 'Request for March invoice and payment link',
        senderName: 'Devon Reed',
        senderEmail: 'devon@latticegrowth.com',
        company: 'Lattice Growth',
        category: 'finance',
        urgency: 'high',
        stage: 'triage',
        summary: 'The finance contact needs the March invoice today and wants confirmation on card payment options.',
        recommendedAction: 'Route to finance context, confirm the amount, and send the billing link today.',
        contactContext: 'Contact: billing stakeholder. Accuracy matters more than a polished sales tone.',
        relationshipContext: 'Relationship: existing client awaiting payment instructions.',
        crmStage: 'Billing',
        nextStep: 'Confirm invoice amount and send the payment link with due date.',
        autoSendEligible: false,
        lastActionLabel: 'Waiting for finance routing.',
        receivedAt: '2026-03-22T17:40:00.000Z',
        updatedAt: '2026-03-22T17:40:00.000Z',
        draft: '',
        notes: 'Tie this into billing once finance events can be pulled into the same queue.',
      },
    ];
  }

  function normalizeStage(stage) {
    const normalized = normalizeText(stage).toLowerCase();
    return Object.prototype.hasOwnProperty.call(STAGE_ORDER, normalized) ? normalized : 'triage';
  }

  function normalizeUrgency(urgency) {
    const normalized = normalizeText(urgency).toLowerCase();
    if (normalized === 'high' || normalized === 'medium' || normalized === 'low') {
      return normalized;
    }
    return 'medium';
  }

  function normalizeThread(thread, fallbackId) {
    return {
      id: normalizeText(thread && thread.id) || fallbackId,
      subject: normalizeText(thread && thread.subject) || 'Untitled thread',
      senderName: normalizeText(thread && thread.senderName) || 'Unknown sender',
      senderEmail: normalizeText(thread && thread.senderEmail) || 'unknown@example.com',
      company: normalizeText(thread && thread.company) || 'Unknown company',
      category: normalizeText(thread && thread.category) || 'support',
      urgency: normalizeUrgency(thread && thread.urgency),
      stage: normalizeStage(thread && thread.stage),
      summary: normalizeText(thread && thread.summary) || 'No summary yet.',
      recommendedAction: normalizeText(thread && thread.recommendedAction) || 'Review and route this thread.',
      contactContext: normalizeText(thread && thread.contactContext) || 'No contact context yet.',
      relationshipContext: normalizeText(thread && thread.relationshipContext) || 'No relationship context yet.',
      crmStage: normalizeText(thread && thread.crmStage) || 'Unassigned',
      nextStep: normalizeText(thread && thread.nextStep) || 'Choose the next action.',
      autoSendEligible: Boolean(thread && thread.autoSendEligible),
      lastActionLabel: normalizeText(thread && thread.lastActionLabel) || 'No operator actions yet.',
      receivedAt: normalizeText(thread && thread.receivedAt) || new Date().toISOString(),
      updatedAt: normalizeText(thread && thread.updatedAt) || new Date().toISOString(),
      draft: thread && typeof thread.draft === 'string' ? thread.draft : '',
      notes: thread && typeof thread.notes === 'string' ? thread.notes : '',
      sentAt: normalizeText(thread && thread.sentAt),
      recordId: normalizeText(thread && thread.recordId),
      marketSegment: normalizeText(thread && thread.marketSegment),
      primaryPain: normalizeText(thread && thread.primaryPain),
      offerAmount: normalizeText(thread && thread.offerAmount),
      source: normalizeText(thread && thread.source),
      tags: normalizeText(thread && thread.tags),
      direction: normalizeText(thread && thread.direction) || 'inbound',
      touchLoggedAt: normalizeText(thread && thread.touchLoggedAt),
    };
  }

  function buildThreadIndex(threads) {
    return threads.reduce((accumulator, thread) => {
      accumulator[thread.id] = normalizeThread(thread, thread.id);
      return accumulator;
    }, {});
  }

  function sortThreads(threads) {
    return threads.slice().sort((left, right) => {
      const stageDelta = STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage];
      if (stageDelta !== 0) {
        return stageDelta;
      }
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
    });
  }

  function formatDateTime(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return 'Unknown time';
    }
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(timestamp);
  }

  function formatRelative(value) {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return 'Unknown update';
    }
    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.round(diffMs / 60000);
    if (diffMinutes < 1) {
      return 'just now';
    }
    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  }

  function categoryLabel(category) {
    return CATEGORY_LABELS[normalizeText(category).toLowerCase()] || 'General';
  }

  function stageLabel(stage) {
    return STAGE_LABELS[normalizeStage(stage)] || 'Needs triage';
  }

  function generateDraftTemplate(thread, operatorLabel) {
    if (thread.direction === 'outbound') {
      const imported = {
        contact: thread.senderName,
        lead: thread.senderName,
        email: thread.senderEmail,
        company: thread.company,
        segment: thread.marketSegment,
        pain: thread.primaryPain,
        offer: thread.offerAmount,
        next: thread.nextStep,
        signal: '',
        experiment: '',
        notes: thread.notes,
        source: thread.source,
        tags: parseTagList(thread.tags),
        subject: thread.subject,
        message: '',
        recordId: thread.recordId,
        threadId: thread.id,
        draftRequested: true,
      };
      return buildImportedDraftBody(imported, operatorLabel);
    }

    const greetingName = thread.senderName.split(' ')[0] || thread.senderName;
    const greeting = `${greetingName},`;
    const businessLine = {
      sales: 'I can pull together a tight proposal and next steps so we can keep momentum up.',
      support: 'I am reviewing the account details now so I can get you the clearest recovery path.',
      scheduling: 'I can help lock in the cleanest next slot and confirm it quickly.',
      followup: 'I can send over the recap and a next-step recommendation without dragging this out.',
      finance: 'I am confirming the billing details now so I can send the right invoice information today.',
    }[thread.category] || 'I am reviewing this now and will send the clearest next step.';

    return `${greeting}\n\nThanks for the note. ${businessLine}\n\n${thread.recommendedAction}\n\nBest,\n${operatorLabel}`;
  }

  function buildWorkbenchPrompt(thread) {
    return [
      'Draft a concise email reply in a direct, pragmatic voice.',
      `Direction: ${thread.direction === 'outbound' ? 'Outbound outreach' : 'Inbound reply'}`,
      `Thread subject: ${thread.subject}`,
      `Sender: ${thread.senderName} <${thread.senderEmail}>`,
      `Company: ${thread.company}`,
      `Category: ${categoryLabel(thread.category)}`,
      `Urgency: ${thread.urgency}`,
      thread.marketSegment ? `Market segment: ${thread.marketSegment}` : '',
      thread.primaryPain ? `Primary pain: ${thread.primaryPain}` : '',
      thread.offerAmount ? `Offer amount: ${thread.offerAmount}` : '',
      `Summary: ${thread.summary}`,
      `Recommended action: ${thread.recommendedAction}`,
      `CRM stage: ${thread.crmStage}`,
      `Context: ${thread.contactContext}`,
      `Relationship: ${thread.relationshipContext}`,
      'Constraints: keep the response human, specific, and no more than 180 words.',
    ].filter(Boolean).join('\n');
  }

  const operator = resolveOperatorIdentity();
  const initialThreads = buildThreadIndex(buildDefaultThreads(operator.label));
  const importedDraftState = readImportedDraftParams();
  const state = {
    operator,
    gunStatus: 'connecting',
    isStub: true,
    activeFilter: 'all',
    selectedThreadId: Object.keys(initialThreads)[0] || '',
    threads: initialThreads,
  };

  const gunContext = ensureGunContext(createEmailOperatorGun, 'email-operator');
  const gun = gunContext.gun;
  const portalRoot = gun && typeof gun.get === 'function' ? gun.get('3dvr-portal') : createLocalGunNodeStub();
  const crmRecords = gun && typeof gun.get === 'function' ? gun.get('3dvr-crm') : createLocalGunNodeStub();
  const emailOperatorRoot = portalRoot && typeof portalRoot.get === 'function'
    ? portalRoot.get('emailOperator')
    : createLocalGunNodeStub();
  const touchLogRoot = portalRoot && typeof portalRoot.get === 'function'
    ? portalRoot.get('crm-touch-log')
    : createLocalGunNodeStub();

  // Graph shape: 3dvr-portal/emailOperator/operators/<operatorKey>/{meta,threads/<threadId>}
  const operatorRoot = emailOperatorRoot && typeof emailOperatorRoot.get === 'function'
    ? emailOperatorRoot.get('operators').get(state.operator.key)
    : createLocalGunNodeStub();
  const metaNode = operatorRoot && typeof operatorRoot.get === 'function'
    ? operatorRoot.get('meta')
    : createLocalGunNodeStub();
  const threadsNode = operatorRoot && typeof operatorRoot.get === 'function'
    ? operatorRoot.get('threads')
    : createLocalGunNodeStub();

  state.isStub = !!gunContext.isStub;
  state.gunStatus = state.isStub ? 'offline' : 'live';

  function currentThreads() {
    return sortThreads(Object.values(state.threads || {}));
  }

  function visibleThreads() {
    const threads = currentThreads();
    if (state.activeFilter === 'all') {
      return threads;
    }
    return threads.filter(thread => thread.stage === state.activeFilter);
  }

  function selectedThread() {
    const visible = visibleThreads();
    if (visible.length === 0) {
      return null;
    }
    const existing = state.threads[state.selectedThreadId];
    if (existing && (state.activeFilter === 'all' || existing.stage === state.activeFilter)) {
      return existing;
    }
    const fallback = visible[0];
    if (fallback) {
      state.selectedThreadId = fallback.id;
    }
    return fallback || null;
  }

  function buildMailtoHref(thread) {
    const recipient = normalizeEmail(thread && thread.senderEmail);
    if (!recipient || recipient === 'unknown@example.com' || recipient === 'add-email-before-send@example.com') {
      return '';
    }
    const subject = normalizeText(thread && thread.subject) || '3dvr follow-up';
    const body = typeof thread?.draft === 'string' && thread.draft.trim()
      ? thread.draft.trim()
      : generateDraftTemplate(thread, state.operator.label);
    return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function appendNoteBlock(existingNotes, newLine) {
    const notes = normalizeText(existingNotes);
    const line = normalizeText(newLine);
    if (!line) {
      return notes;
    }
    return notes ? `${line}\n${notes}` : line;
  }

  function logOutreachTouch(thread) {
    if (!thread || !thread.recordId || !crmRecords || typeof crmRecords.get !== 'function') {
      return;
    }

    const now = new Date().toISOString();
    const logId = sanitizeNodeKey(`email-operator-${thread.id}-${now}`);
    const touchLabel = 'Outreach sent';
    const noteLine = `[${touchLabel} ${new Date(now).toLocaleString()}] Sent from Email Operator.`;

    crmRecords.get(thread.recordId).once(existingRecord => {
      const existing = existingRecord && typeof existingRecord === 'object' ? existingRecord : {};
      const activityCount = Number.parseInt(existing.activityCount, 10);
      const nextCount = Number.isNaN(activityCount) ? 1 : activityCount + 1;
      const nextStatus = normalizeText(existing.status) || normalizeText(thread.crmStage) || 'Warm - Awareness';
      const notes = appendNoteBlock(existing.notes, noteLine);

      crmRecords.get(thread.recordId).put({
        ...existing,
        id: thread.recordId,
        status: nextStatus,
        activityCount: nextCount,
        lastContacted: now,
        lastTouchType: 'outreach-sent',
        notes,
        updated: now,
      });
    });

    touchLogRoot.get(logId).put({
      id: logId,
      recordId: thread.recordId,
      contactName: thread.senderName,
      email: thread.senderEmail,
      company: thread.company,
      segment: thread.marketSegment,
      source: thread.source || 'email-operator',
      note: `Sent from Email Operator for ${thread.subject}.`,
      touchType: 'outreach-sent',
      touchTypeLabel: touchLabel,
      participantId: state.operator.key,
      loggedBy: state.operator.label,
      followUp: normalizeText(thread.nextStep),
      timestamp: now,
    });
  }

  function renderFilters(visibleCount) {
    refs.visibleCount.textContent = `${visibleCount} thread${visibleCount === 1 ? '' : 's'}`;
    refs.filters.forEach(button => {
      const filter = button.dataset.filter;
      const isActive = filter === state.activeFilter;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
  }

  function renderThreadList() {
    const threads = visibleThreads();
    renderFilters(threads.length);
    refs.threadList.replaceChildren();

    if (threads.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.innerHTML = '<strong>No threads in this lane.</strong><br>Pick another filter or re-open a thread.';
      refs.threadList.appendChild(empty);
      return;
    }

    threads.forEach(thread => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'thread-card';
      if (thread.id === state.selectedThreadId) {
        button.classList.add('is-selected');
      }
      button.dataset.threadId = thread.id;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', thread.id === state.selectedThreadId ? 'true' : 'false');

      const top = document.createElement('div');
      top.className = 'thread-card__top';
      const subject = document.createElement('div');
      subject.className = 'thread-card__subject';
      subject.textContent = thread.subject;
      const updated = document.createElement('div');
      updated.className = 'thread-card__meta';
      updated.textContent = formatRelative(thread.updatedAt);
      top.append(subject, updated);

      const summary = document.createElement('p');
      summary.className = 'thread-card__summary';
      summary.textContent = thread.summary;

      const chips = document.createElement('div');
      chips.className = 'thread-card__chips';
      const stage = document.createElement('span');
      stage.className = `status-chip status-chip--${thread.stage}`;
      stage.textContent = stageLabel(thread.stage);
      const urgency = document.createElement('span');
      urgency.className = 'status-chip status-chip--soft';
      urgency.textContent = `${thread.urgency} urgency`;
      chips.append(stage, urgency);

      const meta = document.createElement('div');
      meta.className = 'thread-card__meta';
      meta.textContent = `${thread.senderName} · ${thread.company} · ${categoryLabel(thread.category)}`;

      button.append(top, summary, chips, meta);
      refs.threadList.appendChild(button);
    });
  }

  function renderMetrics() {
    const threads = currentThreads();
    const active = threads.filter(thread => thread.stage !== 'sent' && thread.stage !== 'archive').length;
    const triage = threads.filter(thread => thread.stage === 'triage').length;
    const approval = threads.filter(thread => thread.stage === 'approval').length;
    const automation = threads.filter(thread => thread.stage === 'automation').length;
    refs.metricActive.textContent = String(active);
    refs.metricTriage.textContent = String(triage);
    refs.metricApproval.textContent = String(approval);
    refs.metricAutomation.textContent = String(automation);
  }

  function renderConnection() {
    refs.connectionBadge.className = 'status-badge';
    refs.operatorBadge.className = 'status-badge status-badge--neutral';
    refs.operatorBadge.textContent = `Operator: ${state.operator.label}`;

    if (state.gunStatus === 'live') {
      refs.connectionBadge.classList.add('status-badge--live');
      refs.connectionBadge.textContent = 'Gun live';
    } else {
      refs.connectionBadge.classList.add('status-badge--offline');
      refs.connectionBadge.textContent = 'Offline fallback';
    }
  }

  function actionVisibility(stage) {
    return {
      queueDraft: stage !== 'drafting' && stage !== 'approval' && stage !== 'sent',
      readyApproval: stage !== 'approval' && stage !== 'sent' && stage !== 'archive',
      routeAutomation: stage !== 'automation' && stage !== 'sent' && stage !== 'archive',
      openMail: stage !== 'archive',
      markSent: stage !== 'sent' && stage !== 'archive',
      archiveThread: stage !== 'archive',
      reopenThread: stage === 'sent' || stage === 'archive',
    };
  }

  function renderSelectedThread() {
    const thread = selectedThread();
    if (!thread) {
      refs.threadSubject.textContent = 'No thread selected';
      refs.threadSummary.textContent = 'Choose a queue item to inspect its draft, context, and actions.';
      refs.threadFrom.textContent = '-';
      refs.threadCompany.textContent = '-';
      refs.threadCategory.textContent = '-';
      refs.threadReceived.textContent = '-';
      refs.threadCrmStage.textContent = '-';
      refs.threadNextStep.textContent = '-';
      refs.recommendedAction.textContent = '-';
      refs.threadContactContext.textContent = '-';
      refs.threadRelationshipContext.textContent = '-';
      refs.stageChip.className = 'status-chip';
      refs.stageChip.textContent = 'Empty';
      refs.urgencyChip.className = 'status-chip status-chip--soft';
      refs.urgencyChip.textContent = 'No urgency';
      refs.draftEditor.value = '';
      refs.notesEditor.value = '';
      refs.operatorPrompt.value = '';
      refs.actionButtons.forEach(button => {
        button.hidden = true;
      });
      return;
    }

    refs.threadSubject.textContent = thread.subject;
    refs.threadSummary.textContent = thread.summary;
    refs.threadFrom.textContent = `${thread.senderName} <${thread.senderEmail}>`;
    refs.threadCompany.textContent = thread.company;
    refs.threadCategory.textContent = categoryLabel(thread.category);
    refs.threadReceived.textContent = formatDateTime(thread.receivedAt);
    refs.threadCrmStage.textContent = thread.crmStage;
    refs.threadNextStep.textContent = thread.nextStep;
    refs.recommendedAction.textContent = thread.recommendedAction;
    refs.threadContactContext.textContent = thread.contactContext;
    refs.threadRelationshipContext.textContent = thread.relationshipContext;
    refs.stageChip.className = `status-chip status-chip--${thread.stage}`;
    refs.stageChip.textContent = stageLabel(thread.stage);
    refs.urgencyChip.className = 'status-chip status-chip--soft';
    refs.urgencyChip.textContent = `${thread.urgency} urgency`;
    refs.draftEditor.value = thread.draft;
    refs.notesEditor.value = thread.notes;
    refs.operatorPrompt.value = buildWorkbenchPrompt(thread);

    const visibility = actionVisibility(thread.stage);
    refs.actionButtons.forEach(button => {
      const action = button.dataset.operatorAction;
      const key = action.replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      if (action === 'open-mail') {
        button.hidden = !visibility[key] || !buildMailtoHref(thread);
        return;
      }
      button.hidden = !visibility[key];
    });
  }

  function renderActivity() {
    const threads = currentThreads().slice(0, 5);
    refs.activityFeed.replaceChildren();
    threads.forEach(thread => {
      const item = document.createElement('div');
      item.className = 'activity-item';
      const title = document.createElement('strong');
      title.textContent = thread.subject;
      const detail = document.createElement('p');
      detail.textContent = `${thread.lastActionLabel} Last touched ${formatRelative(thread.updatedAt)}.`;
      detail.style.margin = '0.45rem 0 0';
      item.append(title, detail);
      refs.activityFeed.appendChild(item);
    });
  }

  function render() {
    renderConnection();
    renderMetrics();
    renderThreadList();
    renderSelectedThread();
    renderActivity();
  }

  function writeMeta(nextMeta) {
    state.activeFilter = normalizeFilter(nextMeta.activeFilter || state.activeFilter);
    state.selectedThreadId = normalizeText(nextMeta.selectedThreadId) || state.selectedThreadId;
    metaNode.put({
      activeFilter: state.activeFilter,
      selectedThreadId: state.selectedThreadId,
      operatorLabel: state.operator.label,
      seedVersion: SEED_VERSION,
      updatedAt: new Date().toISOString(),
    });
    render();
  }

  function updateThread(threadId, patch) {
    const existing = state.threads[threadId];
    if (!existing) {
      return;
    }
    const merged = normalizeThread({
      ...existing,
      ...patch,
      id: threadId,
      updatedAt: new Date().toISOString(),
    }, threadId);
    state.threads[threadId] = merged;
    threadsNode.get(threadId).put(merged);
    render();
  }

  function applyThreadAction(action) {
    const thread = selectedThread();
    if (!thread) {
      return;
    }

    if (action === 'open-mail') {
      const href = buildMailtoHref(thread);
      if (!href) {
        window.alert('Add a real email address before opening the draft.');
        return;
      }
      updateThread(thread.id, {
        draft: refs.draftEditor.value.trim() || thread.draft,
        lastActionLabel: ACTION_LABELS[action] || 'Opened the draft.',
      });
      window.location.href = href;
      return;
    }

    const patch = {
      lastActionLabel: ACTION_LABELS[action] || 'Updated thread state.',
    };

    if (action === 'queue-draft') {
      patch.stage = 'drafting';
      patch.draft = refs.draftEditor.value.trim() || generateDraftTemplate(thread, state.operator.label);
      patch.nextStep = 'Refine the draft and move it into approval.';
    } else if (action === 'ready-approval') {
      patch.stage = 'approval';
      patch.draft = refs.draftEditor.value.trim() || generateDraftTemplate(thread, state.operator.label);
      patch.nextStep = 'Human review before send.';
    } else if (action === 'route-automation') {
      patch.stage = 'automation';
      patch.autoSendEligible = true;
      patch.nextStep = 'Convert this into a reusable low-risk automation rule.';
    } else if (action === 'mark-sent') {
      patch.stage = 'sent';
      patch.sentAt = new Date().toISOString();
      patch.touchLoggedAt = patch.sentAt;
      patch.nextStep = 'Watch for reply or schedule the follow-up.';
    } else if (action === 'archive-thread') {
      patch.stage = 'archive';
      patch.nextStep = 'Reference only.';
    } else if (action === 'reopen-thread') {
      patch.stage = 'triage';
      patch.autoSendEligible = false;
      patch.nextStep = 'Re-route this thread from the top.';
    }

    updateThread(thread.id, patch);
    if (action === 'mark-sent') {
      logOutreachTouch({
        ...thread,
        ...patch,
        draft: refs.draftEditor.value.trim() || thread.draft,
        notes: refs.notesEditor.value.trim() || thread.notes,
      });
    }
  }

  function importQueryThreadIfNeeded() {
    if (!importedDraftState.hasDraft) {
      return;
    }

    const importedThread = buildImportedThread(importedDraftState.imported, state.operator.label);
    threadsNode.get(importedThread.id).once(existing => {
      const previous = existing && typeof existing === 'object' && normalizeText(existing.subject)
        ? normalizeThread(existing, importedThread.id)
        : null;
      const merged = normalizeThread({
        ...importedThread,
        ...(previous || {}),
        id: importedThread.id,
        senderEmail: importedThread.senderEmail === 'add-email-before-send@example.com' && previous?.senderEmail
          ? previous.senderEmail
          : importedThread.senderEmail,
        draft: previous?.draft || importedThread.draft,
        notes: previous?.notes || importedThread.notes,
        stage: previous?.stage || importedThread.stage,
        recordId: importedThread.recordId || previous?.recordId,
        marketSegment: importedThread.marketSegment || previous?.marketSegment,
        primaryPain: importedThread.primaryPain || previous?.primaryPain,
        offerAmount: importedThread.offerAmount || previous?.offerAmount,
        source: importedThread.source || previous?.source,
        tags: importedThread.tags || previous?.tags,
        direction: previous?.direction || importedThread.direction,
      }, importedThread.id);

      state.threads[merged.id] = merged;
      state.selectedThreadId = merged.id;
      threadsNode.get(merged.id).put(merged);
      metaNode.put({
        activeFilter: 'all',
        selectedThreadId: merged.id,
        operatorLabel: state.operator.label,
        seedVersion: SEED_VERSION,
        updatedAt: new Date().toISOString(),
      });
      render();
      if (window.history && typeof window.history.replaceState === 'function') {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    });
  }

  function seedOperatorThreads() {
    metaNode.once(meta => {
      state.activeFilter = normalizeFilter(meta && meta.activeFilter);
      state.selectedThreadId = normalizeText(meta && meta.selectedThreadId) || state.selectedThreadId;
      metaNode.put({
        activeFilter: state.activeFilter,
        selectedThreadId: state.selectedThreadId,
        operatorLabel: state.operator.label,
        seedVersion: SEED_VERSION,
        updatedAt: new Date().toISOString(),
      });
      render();
    });

    Object.values(initialThreads).forEach(thread => {
      threadsNode.get(thread.id).once(existing => {
        if (!existing || !normalizeText(existing.subject)) {
          threadsNode.get(thread.id).put(thread);
        }
      });
    });
  }

  function subscribeToGun() {
    metaNode.on(meta => {
      if (!meta || typeof meta !== 'object') {
        return;
      }
      state.activeFilter = normalizeFilter(meta.activeFilter || state.activeFilter);
      state.selectedThreadId = normalizeText(meta.selectedThreadId) || state.selectedThreadId;
      render();
    });

    threadsNode.map().on((thread, threadId) => {
      if (!thread || typeof thread !== 'object') {
        return;
      }
      const resolvedId = normalizeText(threadId) || normalizeText(thread.id);
      if (!resolvedId || !normalizeText(thread.subject)) {
        return;
      }
      state.threads[resolvedId] = normalizeThread(thread, resolvedId);
      render();
    });
  }

  refs.filters.forEach(button => {
    button.addEventListener('click', () => {
      const nextFilter = normalizeFilter(button.dataset.filter || 'all');
      const nextVisible = nextFilter === 'all'
        ? currentThreads()
        : currentThreads().filter(thread => thread.stage === nextFilter);
      writeMeta({
        activeFilter: nextFilter,
        selectedThreadId: nextVisible[0] ? nextVisible[0].id : state.selectedThreadId,
      });
    });
  });

  refs.threadList.addEventListener('click', event => {
    const button = event.target.closest('[data-thread-id]');
    if (!button) {
      return;
    }
    writeMeta({ selectedThreadId: button.dataset.threadId, activeFilter: state.activeFilter });
  });

  refs.actionButtons.forEach(button => {
    button.addEventListener('click', () => {
      applyThreadAction(button.dataset.operatorAction);
    });
  });

  refs.generateDraft.addEventListener('click', () => {
    const thread = selectedThread();
    if (!thread) {
      return;
    }
    const draft = generateDraftTemplate(thread, state.operator.label);
    refs.draftEditor.value = draft;
    updateThread(thread.id, {
      draft,
      stage: thread.stage === 'triage' ? 'drafting' : thread.stage,
      lastActionLabel: 'Generated a fresh draft.',
    });
  });

  refs.saveDraft.addEventListener('click', () => {
    const thread = selectedThread();
    if (!thread) {
      return;
    }
    updateThread(thread.id, {
      draft: refs.draftEditor.value,
      lastActionLabel: 'Saved draft edits.',
    });
  });

  refs.copyDraft.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(refs.draftEditor.value);
      const thread = selectedThread();
      if (thread) {
        updateThread(thread.id, {
          lastActionLabel: 'Copied the draft to the clipboard.',
        });
      }
    } catch (error) {
      console.warn('Failed to copy draft to clipboard', error);
    }
  });

  refs.saveNotes.addEventListener('click', () => {
    const thread = selectedThread();
    if (!thread) {
      return;
    }
    updateThread(thread.id, {
      notes: refs.notesEditor.value,
      lastActionLabel: 'Saved operator notes.',
    });
  });

  refs.copyPrompt.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(refs.operatorPrompt.value);
      const thread = selectedThread();
      if (thread) {
        updateThread(thread.id, {
          lastActionLabel: 'Copied the workbench prompt.',
        });
      }
    } catch (error) {
      console.warn('Failed to copy workbench prompt', error);
    }
  });

  seedOperatorThreads();
  subscribeToGun();
  importQueryThreadIfNeeded();
  render();
})(window, document);
