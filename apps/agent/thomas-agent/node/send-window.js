const TIME_ZONE = process.env.THREEDVR_OUTREACH_TIMEZONE || 'America/Los_Angeles';
const START_HOUR = Number.parseInt(process.env.THREEDVR_OUTREACH_START_HOUR || '8', 10);
const START_MINUTE = Number.parseInt(process.env.THREEDVR_OUTREACH_START_MINUTE || '30', 10);
const END_HOUR = Number.parseInt(process.env.THREEDVR_OUTREACH_END_HOUR || '16', 10);
const END_MINUTE = Number.parseInt(process.env.THREEDVR_OUTREACH_END_MINUTE || '30', 10);

function partsFor(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return {
    weekday: get('weekday'),
    hour: Number.parseInt(get('hour'), 10),
    minute: Number.parseInt(get('minute'), 10),
  };
}

function isWithinBusinessHours(date = new Date()) {
  const { weekday, hour, minute } = partsFor(date);
  if (!['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].includes(weekday)) return false;
  const current = (hour * 60) + minute;
  const start = (START_HOUR * 60) + START_MINUTE;
  const end = (END_HOUR * 60) + END_MINUTE;
  return current >= start && current < end;
}

function businessHoursStatus(date = new Date()) {
  const local = partsFor(date);
  return {
    timezone: TIME_ZONE,
    weekday: local.weekday,
    localTime: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
    start: `${String(START_HOUR).padStart(2, '0')}:${String(START_MINUTE).padStart(2, '0')}`,
    end: `${String(END_HOUR).padStart(2, '0')}:${String(END_MINUTE).padStart(2, '0')}`,
    allowed: isWithinBusinessHours(date),
  };
}

module.exports = {
  TIME_ZONE,
  businessHoursStatus,
  isWithinBusinessHours,
  partsFor,
};
