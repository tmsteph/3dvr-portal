export function createScheduleId() {
  const timestamp = Date.now();
  const random = Math.random().toString(16).slice(2, 8);
  return `post-${timestamp}-${random}`;
}

export function scheduleSortKey(record) {
  if (!record) return Number.MAX_SAFE_INTEGER;
  const date = record.scheduledDate || '';
  if (!date) return Number.MAX_SAFE_INTEGER;
  const time = record.scheduledTime || '00:00';
  const iso = `${date}T${time}`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

export function formatScheduleWindow(date, time, timezone) {
  if (!date) return 'Schedule: TBD';
  const timeLabel = time ? ` at ${time}` : '';
  const tzLabel = timezone ? ` ${timezone}` : '';
  return `Schedule: ${date}${timeLabel}${tzLabel}`;
}

export function labelForStatus(value) {
  switch (value) {
    case 'idea':
      return 'Idea';
    case 'drafting':
      return 'Drafting';
    case 'queued':
      return 'Queued';
    case 'published':
      return 'Published';
    case 'scheduled':
    default:
      return 'Scheduled';
  }
}

export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'just now';
  const now = Date.now();
  const diff = Math.max(0, now - Number(timestamp));
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  if (weeks === 1) return '1 week ago';
  return `${weeks} weeks ago`;
}

export function sanitizeRecord(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === '_' || typeof value === 'function') continue;
    result[key] = value;
  }
  return result;
}

export function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
