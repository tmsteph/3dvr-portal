export const STORAGE_KEY = '3dvr.spatialPortal.v1';

export const PORTAL_APPS = [
  {
    id: 'crm',
    name: 'CRM',
    type: 'Revenue',
    path: '/crm/',
    accent: '#36d399',
    description: 'Pipeline, contacts, deal notes, and follow-up dates.',
    fields: [
      { name: 'title', label: 'Account', type: 'text', required: true },
      { name: 'stage', label: 'Stage', type: 'select', options: ['Lead', 'Qualified', 'Proposal', 'Won'] },
      { name: 'owner', label: 'Owner', type: 'text' },
      { name: 'due', label: 'Next touch', type: 'date' },
      { name: 'body', label: 'Notes', type: 'textarea' }
    ],
    records: [
      {
        id: 'crm-nova',
        title: 'Nova Arcade',
        stage: 'Qualified',
        owner: 'Taylor',
        due: '2026-06-18',
        body: 'Interested in a shared VR arcade operations dashboard with live headset status.'
      },
      {
        id: 'crm-aurora',
        title: 'Aurora Labs',
        stage: 'Proposal',
        owner: 'Morgan',
        due: '2026-06-20',
        body: 'Needs mixed-reality onboarding and a portable sales room for investor demos.'
      }
    ]
  },
  {
    id: 'notes',
    name: 'Notes',
    type: 'Knowledge',
    path: '/notes/',
    accent: '#fbbf24',
    description: 'Shared pages, session notes, briefs, and research fragments.',
    fields: [
      { name: 'title', label: 'Page title', type: 'text', required: true },
      { name: 'space', label: 'Space', type: 'text' },
      { name: 'owner', label: 'Owner', type: 'text' },
      { name: 'body', label: 'Content', type: 'textarea' }
    ],
    records: [
      {
        id: 'notes-interface',
        title: 'Spatial desktop thesis',
        space: 'Interface',
        owner: 'Team',
        body: '2D tools remain available as floating planes while spatial apps get depth, presence, and context.'
      },
      {
        id: 'notes-devices',
        title: 'Device reach',
        space: 'Platform',
        owner: 'Team',
        body: 'Phone, laptop, desktop, headset, and future displays share the same portal state.'
      }
    ]
  },
  {
    id: 'calendar',
    name: 'Calendar',
    type: 'Schedule',
    path: '/calendar/',
    accent: '#38bdf8',
    description: 'Events, planning sessions, launches, and follow-up windows.',
    fields: [
      { name: 'title', label: 'Event', type: 'text', required: true },
      { name: 'stage', label: 'Track', type: 'select', options: ['Planning', 'Build', 'Review', 'Launch'] },
      { name: 'due', label: 'Date', type: 'date' },
      { name: 'owner', label: 'Lead', type: 'text' },
      { name: 'body', label: 'Agenda', type: 'textarea' }
    ],
    records: [
      {
        id: 'calendar-review',
        title: 'Spatial portal review',
        stage: 'Review',
        due: '2026-06-21',
        owner: 'Interface team',
        body: 'Walk through phone, desktop, and headset layouts.'
      },
      {
        id: 'calendar-launch',
        title: 'Prototype launch window',
        stage: 'Launch',
        due: '2026-06-28',
        owner: 'Ops',
        body: 'Publish portal app and collect first community feedback.'
      }
    ]
  },
  {
    id: 'tasks',
    name: 'Tasks',
    type: 'Operations',
    path: '/tasks/',
    accent: '#fb7185',
    description: 'Work queues, blockers, priorities, and release steps.',
    fields: [
      { name: 'title', label: 'Task', type: 'text', required: true },
      { name: 'stage', label: 'Status', type: 'select', options: ['Backlog', 'Doing', 'Blocked', 'Done'] },
      { name: 'owner', label: 'Owner', type: 'text' },
      { name: 'due', label: 'Due', type: 'date' },
      { name: 'body', label: 'Details', type: 'textarea' }
    ],
    records: [
      {
        id: 'tasks-input',
        title: 'Map controller gestures',
        stage: 'Doing',
        owner: 'XR',
        due: '2026-06-19',
        body: 'Prototype gaze, pointer, keyboard, and touch controls against one shared action model.'
      },
      {
        id: 'tasks-sync',
        title: 'Harden Gun sync',
        stage: 'Backlog',
        owner: 'Platform',
        due: '2026-06-24',
        body: 'Move from demo records to app-native record adapters.'
      }
    ]
  },
  {
    id: 'finance',
    name: 'Finance',
    type: 'Ledger',
    path: '/finance/',
    accent: '#a3e635',
    description: 'Budgets, expenses, runway notes, and sponsorship targets.',
    fields: [
      { name: 'title', label: 'Line item', type: 'text', required: true },
      { name: 'stage', label: 'Category', type: 'select', options: ['Revenue', 'Expense', 'Forecast', 'Grant'] },
      { name: 'owner', label: 'Owner', type: 'text' },
      { name: 'due', label: 'Review date', type: 'date' },
      { name: 'body', label: 'Memo', type: 'textarea' }
    ],
    records: [
      {
        id: 'finance-headsets',
        title: 'Headset test pool',
        stage: 'Expense',
        owner: 'Ops',
        due: '2026-07-03',
        body: 'Reserve funds for baseline Quest, Vision Pro, Android phone, and desktop QA devices.'
      },
      {
        id: 'finance-sponsors',
        title: 'Spatial workspace sponsors',
        stage: 'Revenue',
        owner: 'Sales',
        due: '2026-07-10',
        body: 'Package the portal demo as a partner walkthrough for local venues and creators.'
      }
    ]
  }
];

export function createInitialPortalState(apps = PORTAL_APPS) {
  const now = new Date().toISOString();
  return {
    selectedAppId: apps[0]?.id || '',
    selectedRecordId: apps[0]?.records?.[0]?.id || '',
    viewMode: 'spatial',
    updatedAt: now,
    apps: apps.map((app, index) => ({
      id: app.id,
      name: app.name,
      type: app.type,
      path: app.path,
      accent: app.accent,
      description: app.description,
      fields: app.fields.map(field => ({ ...field })),
      orbit: {
        x: (index - Math.floor(apps.length / 2)) * 2.2,
        y: index % 2 === 0 ? 0.5 : -0.35,
        z: -4 - (index % 3) * 0.9
      },
      records: app.records.map(record => normalizeRecord(record, app.id, now))
    }))
  };
}

export function normalizePortalState(input, fallbackApps = PORTAL_APPS) {
  const base = createInitialPortalState(fallbackApps);
  if (!input || typeof input !== 'object') {
    return base;
  }

  const appsById = new Map(base.apps.map(app => [app.id, app]));
  const incomingApps = Array.isArray(input.apps) ? input.apps : [];
  incomingApps.forEach(app => {
    if (!app || typeof app !== 'object' || !appsById.has(app.id)) {
      return;
    }
    const baseApp = appsById.get(app.id);
    const records = Array.isArray(app.records) ? app.records : [];
    const normalizedRecords = records
      .map(record => normalizeRecord(record, baseApp.id, record?.updatedAt || input.updatedAt))
      .filter(record => record.title);
    if (normalizedRecords.length > 0) {
      baseApp.records = mergeRecords(baseApp.records, normalizedRecords);
    }
  });

  const selectedAppId = appsById.has(input.selectedAppId) ? input.selectedAppId : base.selectedAppId;
  const selectedApp = appsById.get(selectedAppId);
  const selectedRecordId = selectedApp.records.some(record => record.id === input.selectedRecordId)
    ? input.selectedRecordId
    : selectedApp.records[0]?.id || '';

  return {
    ...base,
    selectedAppId,
    selectedRecordId,
    viewMode: input.viewMode === 'flat' ? 'flat' : 'spatial',
    updatedAt: typeof input.updatedAt === 'string' ? input.updatedAt : base.updatedAt,
    apps: base.apps
  };
}

export function getAppById(state, appId) {
  return state.apps.find(app => app.id === appId) || state.apps[0] || null;
}

export function getRecordById(app, recordId) {
  return app?.records.find(record => record.id === recordId) || app?.records[0] || null;
}

export function getAppSummary(app) {
  const records = app?.records || [];
  const pending = records.filter(record => {
    const stage = `${record.stage || ''}`.toLowerCase();
    return stage && !['won', 'done', 'launch'].includes(stage);
  }).length;
  return {
    total: records.length,
    pending,
    nextDue: records
      .map(record => record.due)
      .filter(Boolean)
      .sort()[0] || ''
  };
}

export function filterPortalRecords(app, query) {
  const terms = `${query || ''}`.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) {
    return app?.records || [];
  }
  return (app?.records || []).filter(record => {
    const haystack = [
      record.title,
      record.stage,
      record.owner,
      record.due,
      record.body,
      record.space
    ].join(' ').toLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

export function upsertPortalRecord(state, appId, values, options = {}) {
  const app = getAppById(state, appId);
  if (!app) {
    return state;
  }
  const shouldSelect = options.select !== false;
  const now = new Date().toISOString();
  const record = normalizeRecord(values, app.id, now);
  if (!record.title) {
    throw new Error('A title is required.');
  }
  const existingIndex = app.records.findIndex(item => item.id === record.id);
  if (existingIndex >= 0) {
    app.records.splice(existingIndex, 1, {
      ...app.records[existingIndex],
      ...record,
      updatedAt: now
    });
  } else {
    app.records.unshift(record);
  }
  if (shouldSelect) {
    state.selectedAppId = app.id;
    state.selectedRecordId = record.id;
  }
  state.updatedAt = now;
  return state;
}

export function deletePortalRecord(state, appId, recordId) {
  const app = getAppById(state, appId);
  if (!app) {
    return state;
  }
  app.records = app.records.filter(record => record.id !== recordId);
  state.selectedAppId = app.id;
  state.selectedRecordId = app.records[0]?.id || '';
  state.updatedAt = new Date().toISOString();
  return state;
}

export function flattenRecordForGun(record) {
  const result = {};
  Object.entries(record || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      result[key] = '';
      return;
    }
    if (typeof value === 'object') {
      result[key] = JSON.stringify(value);
      return;
    }
    result[key] = value;
  });
  return result;
}

export function normalizeRecord(input, appId = '', updatedAt = new Date().toISOString()) {
  const title = `${input?.title || ''}`.trim();
  const id = slugify(input?.id || `${appId}-${title || Date.now()}`);
  return {
    id,
    appId,
    title,
    stage: `${input?.stage || input?.space || ''}`.trim(),
    space: `${input?.space || input?.stage || ''}`.trim(),
    owner: `${input?.owner || ''}`.trim(),
    due: `${input?.due || ''}`.trim(),
    body: `${input?.body || ''}`.trim(),
    updatedAt: `${input?.updatedAt || updatedAt}`
  };
}

function mergeRecords(baseRecords, incomingRecords) {
  const recordsById = new Map(baseRecords.map(record => [record.id, record]));
  incomingRecords.forEach(record => {
    const current = recordsById.get(record.id);
    if (!current || `${record.updatedAt}` >= `${current.updatedAt}`) {
      recordsById.set(record.id, record);
    }
  });
  return Array.from(recordsById.values()).sort((a, b) => `${b.updatedAt}`.localeCompare(`${a.updatedAt}`));
}

function slugify(value) {
  return `${value || 'record'}`
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '') || `record-${Date.now()}`;
}
