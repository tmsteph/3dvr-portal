// Shared, side-effect-free Workboard state labels. Keep failed/closed work
// distinguishable from work actually completed by a worker or merged in GitHub.
function clean(value = '', max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function laneFor(status = '', kind = '') {
  const normalized = clean(status, 80).toLowerCase().replace(/[\s-]+/g, '_');
  if (kind === 'github-pr') return ['closed', 'merged'].includes(normalized) ? 'done' : 'review';
  if (kind === 'github-issue') return normalized === 'closed' ? 'done' : 'inbox';
  if (['done', 'completed', 'complete', 'merged', 'closed', 'success', 'succeeded', 'cancelled', 'canceled'].includes(normalized)) return 'done';
  if (['review', 'ready_for_review', 'awaiting_review', 'needs_review', 'waiting_human', 'blocked', 'failed', 'error', 'skipped'].includes(normalized)) return 'review';
  if (['working', 'running', 'in_progress', 'executing', 'claimed', 'processing', 'waiting_external', 'verifying'].includes(normalized)) return 'working';
  return 'inbox';
}

export function friendlyStatus(item, lane) {
  const normalized = clean(item.record.status || 'open', 80).toLowerCase().replace(/[\s-]+/g, '_');
  // Terminal cancellation or closing is not evidence of completed work.
  if (normalized === 'cancelled' || normalized === 'canceled') return 'cancelled';
  if (normalized === 'closed') return 'closed';
  if (normalized === 'waiting_external') return 'waiting outside';
  if (normalized === 'verifying') return 'verifying';
  if (lane === 'review') {
    if (normalized === 'waiting_human') return 'needs you';
    if (['failed', 'error', 'blocked', 'skipped'].includes(normalized)) return normalized.replaceAll('_', ' ');
    return 'needs review';
  }
  if (lane === 'working') return 'working';
  if (lane === 'done') return normalized === 'merged' ? 'merged' : 'done';
  return 'queued';
}
