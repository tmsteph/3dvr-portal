import { enumerateDateRange, normalizeDateKey } from './work-schedule-coordinator.js';

export const OPPORTUNITY_AVAILABILITY = Object.freeze({
  UNKNOWN: 'unknown',
  CLEAR: 'clear',
  SOFT: 'soft',
  BLOCKED: 'blocked',
  CONFLICT: 'conflict',
});

const SEVERITY = Object.freeze({
  clear: 0,
  soft: 1,
  unknown: 2,
  blocked: 3,
  conflict: 4,
});

function opportunityDates(record = {}) {
  const start = normalizeDateKey(record.startsAt || record.startDate || record.date || '');
  if (!start) return [];
  const end = normalizeDateKey(record.endsAt || record.endDate || start) || start;
  return enumerateDateRange(start, end);
}

function classifyDate(date, plan = {}) {
  const status = plan.iatseAvailability?.[date];
  const softEncore = new Set(plan.softEncoreDates || []);
  const scheduleConflict = (plan.conflicts || []).find(conflict => conflict.date === date);

  if (scheduleConflict) {
    return {
      date,
      availability: OPPORTUNITY_AVAILABILITY.CONFLICT,
      reason: `${date}: schedule already contains a booking conflict`,
    };
  }
  if (status === 'Booked') {
    return {
      date,
      availability: OPPORTUNITY_AVAILABILITY.CONFLICT,
      reason: `${date}: existing booked work`,
    };
  }
  if (status === 'Not Available') {
    return {
      date,
      availability: OPPORTUNITY_AVAILABILITY.BLOCKED,
      reason: `${date}: protected or unavailable`,
    };
  }
  if (status === 'All Day' && softEncore.has(date)) {
    return {
      date,
      availability: OPPORTUNITY_AVAILABILITY.SOFT,
      reason: `${date}: distant sparse Encore work is soft/replaceable`,
    };
  }
  if (status === 'All Day') {
    return {
      date,
      availability: OPPORTUNITY_AVAILABILITY.CLEAR,
      reason: `${date}: calendar clear`,
    };
  }
  return {
    date,
    availability: OPPORTUNITY_AVAILABILITY.UNKNOWN,
    reason: `${date}: schedule not reconciled`,
  };
}

export function evaluateOpportunityAvailability(record = {}, plan = {}) {
  const dates = opportunityDates(record);
  if (!dates.length) {
    return {
      availability: OPPORTUNITY_AVAILABILITY.UNKNOWN,
      hardBlock: false,
      dates: [],
      details: [],
      reasons: ['Opportunity has no usable work date'],
    };
  }

  const details = dates.map(date => classifyDate(date, plan));
  const worst = details.reduce((current, detail) => (
    SEVERITY[detail.availability] > SEVERITY[current.availability] ? detail : current
  ), details[0]);

  return {
    availability: worst.availability,
    hardBlock: [
      OPPORTUNITY_AVAILABILITY.BLOCKED,
      OPPORTUNITY_AVAILABILITY.CONFLICT,
    ].includes(worst.availability),
    dates,
    details,
    reasons: details.map(detail => detail.reason),
  };
}
