const BOOKED_WORK_STATUSES = new Set(['booked', 'completed']);

export const SCHEDULE_ACTION_TYPES = Object.freeze({
  REQUEST_ENCORE_OFF: 'request-encore-off',
  UPDATE_IATSE: 'update-iatse',
  PROTECT_REST_DAY: 'protect-rest-day',
  RESOLVE_CONFLICT: 'resolve-conflict',
});

export function normalizeDateKey(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function parseDateKey(value) {
  const key = normalizeDateKey(value);
  if (!key) return null;
  const date = new Date(`${key}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDateDays(value, amount) {
  const date = parseDateKey(value);
  if (!date) return '';
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

export function enumerateDateRange(startValue, endValue = startValue) {
  const start = normalizeDateKey(startValue);
  const end = normalizeDateKey(endValue || startValue);
  if (!start || !end || end < start) return [];
  const result = [];
  for (let current = start; current <= end; current = addDateDays(current, 1)) {
    result.push(current);
  }
  return result;
}

export function startOfWeekKey(value) {
  const date = parseDateKey(value);
  if (!date) return '';
  const day = date.getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysFromMonday);
  return date.toISOString().slice(0, 10);
}

function normalizeWorkRecord(record = {}, fallbackSource = 'freelance') {
  const startDate = normalizeDateKey(record.startDate || record.date || '');
  const endDate = normalizeDateKey(record.endDate || startDate);
  return {
    ...record,
    id: String(record.id || '').trim(),
    title: String(record.title || record.summary || '').trim(),
    startDate,
    endDate: endDate || startDate,
    source: String(record.source || record.workSource || fallbackSource).trim().toLowerCase() || fallbackSource,
    status: String(record.status || 'Booked').trim() || 'Booked',
  };
}

function isBookedWork(record = {}) {
  return BOOKED_WORK_STATUSES.has(String(record.status || '').trim().toLowerCase());
}

function isOutsideWork(record = {}) {
  return record.source !== 'encore';
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  return items.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chooseRestDaysForWeek({ dates, workDates, protectedDates, minimumRestDays }) {
  const candidates = dates.filter(date => !workDates.has(date));
  const protectedRest = dates.filter(date => protectedDates.has(date) && !workDates.has(date));
  const chosen = [...protectedRest];

  if (chosen.length >= minimumRestDays) return chosen.slice(0, minimumRestDays);

  const remaining = candidates.filter(date => !chosen.includes(date));

  // Prefer a consecutive block, and prefer pairing with an already protected day.
  for (const date of candidates) {
    const next = addDateDays(date, 1);
    if (!candidates.includes(next)) continue;
    const pair = [date, next];
    const merged = uniqueBy([...chosen, ...pair], value => value);
    if (merged.length >= minimumRestDays) return merged.slice(0, minimumRestDays);
  }

  return uniqueBy([...chosen, ...remaining], value => value).slice(0, minimumRestDays);
}

export function buildWorkSchedulePlan({
  gigs = [],
  encoreShifts = [],
  protectedCommitments = [],
  horizonStart = new Date().toISOString().slice(0, 10),
  horizonEnd,
  minimumRestDays = 2,
} = {}) {
  const start = normalizeDateKey(horizonStart);
  const end = normalizeDateKey(horizonEnd || addDateDays(start, 41));
  if (!start || !end || end < start) {
    return { dates: [], restDays: [], actions: [], conflicts: [], iatseAvailability: {} };
  }

  const dates = enumerateDateRange(start, end);
  const normalizedGigs = gigs.map(record => normalizeWorkRecord(record, 'freelance'));
  const normalizedEncore = encoreShifts.map(record => normalizeWorkRecord({ ...record, source: 'encore' }, 'encore'));
  const bookedOutside = normalizedGigs.filter(record => isBookedWork(record) && isOutsideWork(record));
  const bookedEncore = normalizedEncore.filter(isBookedWork);

  const outsideDates = new Map();
  bookedOutside.forEach(gig => {
    enumerateDateRange(gig.startDate, gig.endDate).forEach(date => {
      if (date >= start && date <= end) outsideDates.set(date, gig);
    });
  });

  const encoreDates = new Map();
  bookedEncore.forEach(shift => {
    enumerateDateRange(shift.startDate, shift.endDate).forEach(date => {
      if (date >= start && date <= end) encoreDates.set(date, shift);
    });
  });

  const protectedDates = new Set();
  protectedCommitments.forEach(commitment => {
    if (commitment.countsAsRestDay === false) return;
    enumerateDateRange(commitment.startDate || commitment.date, commitment.endDate || commitment.startDate || commitment.date)
      .forEach(date => {
        if (date >= start && date <= end) protectedDates.add(date);
      });
  });

  const workDates = new Set([...outsideDates.keys(), ...encoreDates.keys()]);
  const conflicts = [...outsideDates.keys()]
    .filter(date => encoreDates.has(date))
    .map(date => ({
      date,
      outsideGig: outsideDates.get(date),
      encoreShift: encoreDates.get(date),
      severity: 'high',
    }));

  const restDays = [];
  const weekStarts = uniqueBy(dates.map(startOfWeekKey), value => value);
  weekStarts.forEach(weekStart => {
    const weekDates = enumerateDateRange(weekStart, addDateDays(weekStart, 6))
      .filter(date => date >= start && date <= end);
    restDays.push(...chooseRestDaysForWeek({
      dates: weekDates,
      workDates,
      protectedDates,
      minimumRestDays,
    }));
  });

  const restDaySet = new Set(restDays);
  const iatseAvailability = {};
  dates.forEach(date => {
    if (outsideDates.has(date) || encoreDates.has(date)) iatseAvailability[date] = 'Booked';
    else if (restDaySet.has(date) || protectedDates.has(date)) iatseAvailability[date] = 'Not Available';
    else iatseAvailability[date] = 'All Day';
  });

  const actions = [];
  outsideDates.forEach((gig, date) => {
    actions.push({
      id: `encore-off:${date}:${gig.id || gig.title}`,
      type: SCHEDULE_ACTION_TYPES.REQUEST_ENCORE_OFF,
      date,
      source: gig.source,
      gigId: gig.id,
      title: `Request Encore off for ${date}`,
      status: 'pending',
    });
  });

  dates.forEach(date => {
    actions.push({
      id: `iatse:${date}`,
      type: SCHEDULE_ACTION_TYPES.UPDATE_IATSE,
      date,
      availability: iatseAvailability[date],
      title: `Set IATSE ${date} to ${iatseAvailability[date]}`,
      status: 'pending',
    });
  });

  restDays.forEach(date => {
    actions.push({
      id: `rest:${date}`,
      type: SCHEDULE_ACTION_TYPES.PROTECT_REST_DAY,
      date,
      title: `Protect ${date} as a rest day`,
      status: 'pending',
    });
  });

  conflicts.forEach(conflict => {
    actions.push({
      id: `conflict:${conflict.date}`,
      type: SCHEDULE_ACTION_TYPES.RESOLVE_CONFLICT,
      date: conflict.date,
      title: `Resolve double-booking on ${conflict.date}`,
      status: 'blocked',
    });
  });

  return {
    dates,
    restDays: uniqueBy(restDays, value => value).sort(),
    actions: uniqueBy(actions, action => action.id),
    conflicts,
    iatseAvailability,
    metrics: {
      outsideBookedDays: outsideDates.size,
      encoreBookedDays: encoreDates.size,
      restDays: new Set(restDays).size,
      conflicts: conflicts.length,
      encoreRequestsNeeded: outsideDates.size,
    },
  };
}
