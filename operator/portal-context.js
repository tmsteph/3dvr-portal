import { openDatabase, loadState } from '../life-space/storage.js';
import { createOperatorDeveloperProof } from './forge.js';

const LEADS_KEY = '3dvr.leadFinder.prospects.v1';
const CRM_KEY = 'portal-crm-local-records-v1';
const CALENDAR_KEY = 'calendar.local.events';
const MAX_ITEMS = 40;
const MAX_TEXT = 500;

const clean = (value, max = MAX_TEXT) => String(value ?? '').trim().slice(0, max);

function parseJson(value) {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

function asList(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}

function compactRecord(record = {}, fields = []) {
  return Object.fromEntries(fields
    .map(field => [field, typeof record?.[field] === 'string' ? clean(record[field]) : record?.[field]])
    .filter(([, value]) => value !== undefined && value !== null && value !== '')));
}

export function summarizeLifeSpaceState(state) {
  const spaces = Array.isArray(state?.spaces) ? state.spaces : [];
  const items = spaces.flatMap(space => (Array.isArray(space?.items) ? space.items : []).map(item => ({
    ...compactRecord(item, ['id', 'type', 'title', 'text', 'url', 'createdAt', 'updatedAt']),
    space: clean(space?.name || 'My Life', 120),
    rows: Array.isArray(item?.rows)
      ? item.rows.slice(0, 20).map(row => ({ text: clean(row?.text, 220), done: Boolean(row?.done) })).filter(row => row.text)
      : undefined
  }))).slice(-MAX_ITEMS).reverse();

  return {
    available: Boolean(state),
    spaceCount: spaces.length,
    itemCount: spaces.reduce((count, space) => count + (Array.isArray(space?.items) ? space.items.length : 0), 0),
    spaces: spaces.slice(0, 12).map(space => ({
      id: clean(space?.id, 120),
      name: clean(space?.name, 120),
      itemCount: Array.isArray(space?.items) ? space.items.length : 0
    })),
    items
  };
}

export function summarizeLeadFinder(value) {
  const leads = asList(value);
  return {
    available: value !== null,
    count: leads.length,
    leads: leads.slice(0, MAX_ITEMS).map(record => compactRecord(record, [
      'id', 'business', 'location', 'status', 'stage', 'notes', 'source', 'score',
      'lastContactAt', 'nextAction', 'createdAt', 'updatedAt'
    ]))
  };
}

export function summarizeCrm(value) {
  const records = asList(value);
  return {
    available: value !== null,
    count: records.length,
    records: records.slice(0, MAX_ITEMS).map(record => compactRecord(record, [
      'id', 'name', 'company', 'business', 'status', 'recordType', 'warmth', 'fit',
      'marketSegment', 'primaryPain', 'painSeverity', 'pilotStatus', 'offerAmount',
      'lastSignal', 'nextExperiment', 'nextBestAction', 'source', 'createdAt', 'updatedAt'
    ]))
  };
}

export function summarizeCalendar(value, now = new Date()) {
  const events = asList(value);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const ordered = events.slice().sort((a, b) => {
    const aTime = new Date(a?.start || a?.startTime || a?.date || 0).getTime() || 0;
    const bTime = new Date(b?.start || b?.startTime || b?.date || 0).getTime() || 0;
    return aTime - bTime;
  });
  const upcoming = ordered.filter(event => {
    const end = new Date(event?.end || event?.endTime || event?.start || event?.startTime || event?.date || 0).getTime();
    return !Number.isFinite(nowMs) || !end || end >= nowMs - 24 * 60 * 60 * 1000;
  });

  return {
    available: value !== null,
    count: events.length,
    upcoming: upcoming.slice(0, MAX_ITEMS).map(event => compactRecord(event, [
      'id', 'title', 'summary', 'start', 'startTime', 'end', 'endTime', 'date',
      'allDay', 'location', 'provider', 'source'
    ]))
  };
}

export async function collectPortalContext({
  storage = globalThis.localStorage,
  openDb = openDatabase,
  load = loadState,
  now = () => new Date(),
  developerProof = createOperatorDeveloperProof
} = {}) {
  let lifeSpaceState = null;
  try {
    const db = await openDb();
    lifeSpaceState = await load(db);
    db?.close?.();
  } catch {
    lifeSpaceState = parseJson(storage?.getItem?.('3dvr-life-space-state'));
  }

  const leads = parseJson(storage?.getItem?.(LEADS_KEY));
  const crm = parseJson(storage?.getItem?.(CRM_KEY));
  const calendar = parseJson(storage?.getItem?.(CALENDAR_KEY));
  const capturedAt = now();
  let developerAuth = null;
  try { developerAuth = await developerProof(); } catch {}

  return {
    version: 1,
    capturedAt: capturedAt instanceof Date && !Number.isNaN(capturedAt.getTime()) ? capturedAt.toISOString() : new Date().toISOString(),
    developerAuth,
    apps: {
      lifeSpace: summarizeLifeSpaceState(lifeSpaceState),
      leadFinder: summarizeLeadFinder(leads),
      crm: summarizeCrm(crm),
      calendar: summarizeCalendar(calendar, capturedAt)
    }
  };
}
