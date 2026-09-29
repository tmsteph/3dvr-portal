const BOOKED_WORK_STATUSES = new Set(['booked', 'completed']);

export const SCHEDULE_ACTION_TYPES = Object.freeze({
  REQUEST_ENCORE_OFF: 'request-encore-off',
  UPDATE_IATSE: 'update-iatse',
  PROTECT_REST_DAY: 'protect-rest-day',
  RESOLVE_CONFLICT: 'resolve-conflict',
});

function isValidDateKey(value = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function normalizeDateKey(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  // Preserve the calendar date carried by ISO-like local timestamps instead of
  // converting through UTC, which can move late-night work into the next day.
  const prefixedDate = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T\s])/);
  if (prefixedDate) return isValidDateKey(prefixedDate[1]) ? prefixedDate[1] : '';

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
    startTime: String(record.startTime || record.callTime || '').trim(),
    endTime: String(record.endTime || '').trim(),
    source: String(record.source || record.workSource || fallbackSource).trim().toLowerCase() || fallbackSource,
    status: String(record.status || 'Booked').trim() || 'Booked',
  };
}


function parseTimeMinutes(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  const twentyFour = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) return hour * 60 + minute;
    return null;
  }

  const twelve = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(raw);
  if (!twelve) return null;
  let hour = Number(twelve[1]);
  const minute = Number(twelve[2] || 0);
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  if (hour === 12) hour = 0;
  if (twelve[3] === 'pm') hour += 12;
  return hour * 60 + minute;
}

function recordTimeRange(record = {}, date = '') {
  if (!record.startDate || !record.endDate || record.startDate !== record.endDate || record.startDate !== date) {
    return null;
  }
  const start = parseTimeMinutes(record.startTime);
  const end = parseTimeMinutes(record.endTime);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function recordsOverlapOnDate(left = {}, right = {}, date = '') {
  const leftRange = recordTimeRange(left, date);
  const rightRange = recordTimeRange(right, date);
  // Missing/ambiguous time stays conservative: same-day commitments conflict.
  if (!leftRange || !rightRange) return true;
  return leftRange.start < rightRange.end && rightRange.start < leftRange.end;
}

function hasInternalOverlap(records = [], date = '') {
  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      if (recordsOverlapOnDate(records[left], records[right], date)) return true;
    }
  }
  return false;
}

function hasCrossOverlap(leftRecords = [], rightRecords = [], date = '') {
  return leftRecords.some(left => rightRecords.some(right => recordsOverlapOnDate(left, right, date)));
}

function isBookedWork(record = {}) {
  return BOOKED_WORK_STATUSES.has(String(record.status || '').trim().toLowerCase());
}

function isOutsideWork(record = {}) {
  return record.source !== 'encore';
}

function hasConfirmedDates(record = {}) {
  const status = String(record.confirmationStatus || '').trim().toLowerCase();
  return record.confirmed === true || status === 'confirmed';
}

function hasApprovedRate(record = {}) {
  const decision = String(record.rateDecision || record.rateQuality || '').trim().toLowerCase();
  return record.rateApproved === true || ['approved', 'good', 'worth-it', 'worth_it'].includes(decision);
}

function isEncoreTimeOffEligible(record = {}) {
  return hasConfirmedDates(record) && hasApprovedRate(record);
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

function splitEncoreAvailabilityDates({ encoreDates, horizonStart, hardWindowDays, softWeeklyMaxDays }) {
  const hardWindowEnd = addDateDays(horizonStart, Math.max(0, Number(hardWindowDays) || 0));
  const weeklyCounts = new Map();

  encoreDates.forEach((_shift, date) => {
    const weekStart = startOfWeekKey(date);
    weeklyCounts.set(weekStart, (weeklyCounts.get(weekStart) || 0) + 1);
  });

  const blocking = new Map();
  const soft = new Map();
  encoreDates.forEach((shift, date) => {
    const weekCount = weeklyCounts.get(startOfWeekKey(date)) || 0;
    const isDistant = date > hardWindowEnd;
    const isOnesieTwosie = weekCount <= Math.max(0, Number(softWeeklyMaxDays) || 0);
    (isDistant && isOnesieTwosie ? soft : blocking).set(date, shift);
  });

  return { blocking, soft };
}

export function buildWorkSchedulePlan({
  gigs = [],
  encoreShifts = [],
  protectedCommitments = [],
  horizonStart = new Date().toISOString().slice(0, 10),
  horizonEnd,
  minimumRestDays = 2,
  encoreHardWindowDays = 14,
  softEncoreWeeklyMaxDays = 2,
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

  const addRecordByDate = (map, date, record) => {
    const records = map.get(date) || [];
    records.push(record);
    map.set(date, records);
  };

  const outsideDates = new Map();
  bookedOutside.forEach(gig => {
    enumerateDateRange(gig.startDate, gig.endDate).forEach(date => {
      if (date >= start && date <= end) addRecordByDate(outsideDates, date, gig);
    });
  });

  const allEncoreDates = new Map();
  bookedEncore.forEach(shift => {
    enumerateDateRange(shift.startDate, shift.endDate).forEach(date => {
      if (date >= start && date <= end) addRecordByDate(allEncoreDates, date, shift);
    });
  });
  const { blocking: encoreDates, soft: softEncoreDates } = splitEncoreAvailabilityDates({
    encoreDates: allEncoreDates,
    horizonStart: start,
    hardWindowDays: encoreHardWindowDays,
    softWeeklyMaxDays: softEncoreWeeklyMaxDays,
  });

  const protectedBusyDates = new Set();
  const protectedRestDates = new Set();
  protectedCommitments.forEach(commitment => {
    enumerateDateRange(commitment.startDate || commitment.date, commitment.endDate || commitment.startDate || commitment.date)
      .forEach(date => {
        if (date < start || date > end) return;
        protectedBusyDates.add(date);
        if (commitment.countsAsRestDay === true) protectedRestDates.add(date);
      });
  });

  // Distant Encore onesies/twosies stay real work commitments for rest planning,
  // but they do not close IATSE/freelance availability until they enter the hard window.
  // Personal commitments also occupy the day, but only explicit rest commitments
  // satisfy the recovery quota.
  const protectedNonRestDates = [...protectedBusyDates]
    .filter(date => !protectedRestDates.has(date));
  const workDates = new Set([
    ...outsideDates.keys(),
    ...allEncoreDates.keys(),
    ...protectedNonRestDates,
  ]);
  const possibleConflictDates = new Set([
    ...outsideDates.keys(),
    ...allEncoreDates.keys(),
  ]);
  const conflicts = [...possibleConflictDates].sort().flatMap(date => {
    const outsideGigs = outsideDates.get(date) || [];
    const encoreShiftsForDate = allEncoreDates.get(date) || [];
    const types = [];
    if (hasInternalOverlap(outsideGigs, date)) types.push('outside-vs-outside');
    if (hasInternalOverlap(encoreShiftsForDate, date)) types.push('encore-vs-encore');
    if (hasCrossOverlap(outsideGigs, encoreShiftsForDate, date)) types.push('outside-vs-encore');
    if (!types.length) return [];
    return [{
      date,
      types,
      outsideGigs,
      encoreShifts: encoreShiftsForDate,
      // Preserve legacy single-record fields for existing consumers.
      outsideGig: outsideGigs[0] || null,
      encoreShift: encoreShiftsForDate[0] || null,
      severity: 'high',
    }];
  });

  const restDays = [];
  const weekStarts = uniqueBy(dates.map(startOfWeekKey), value => value);
  weekStarts.forEach(weekStart => {
    const weekDates = enumerateDateRange(weekStart, addDateDays(weekStart, 6))
      .filter(date => date >= start && date <= end);
    restDays.push(...chooseRestDaysForWeek({
      dates: weekDates,
      workDates,
      protectedDates: protectedRestDates,
      minimumRestDays,
    }));
  });

  const restDaySet = new Set(restDays);
  const iatseAvailability = {};
  dates.forEach(date => {
    if (outsideDates.has(date) || encoreDates.has(date)) iatseAvailability[date] = 'Booked';
    else if (restDaySet.has(date) || protectedBusyDates.has(date)) iatseAvailability[date] = 'Not Available';
    else iatseAvailability[date] = 'All Day';
  });

  const encoreTimeOffDates = new Map(
    [...outsideDates.entries()]
      .map(([date, gigsForDate]) => [date, gigsForDate.find(isEncoreTimeOffEligible)])
      .filter(([, gig]) => Boolean(gig)),
  );

  const actions = [];
  encoreTimeOffDates.forEach((gig, date) => {
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
    softEncoreDates: [...softEncoreDates.keys()].sort(),
    metrics: {
      outsideBookedDays: outsideDates.size,
      encoreBookedDays: allEncoreDates.size,
      encoreSoftDays: softEncoreDates.size,
      restDays: new Set(restDays).size,
      conflicts: conflicts.length,
      encoreRequestsNeeded: encoreTimeOffDates.size,
      encoreRequestsBlockedByGate: outsideDates.size - encoreTimeOffDates.size,
    },
  };
}
