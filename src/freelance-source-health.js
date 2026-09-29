export const FREELANCE_SOURCE_HEALTH = Object.freeze({
  MANUAL: 'manual',
  UNKNOWN: 'unknown',
  HEALTHY: 'healthy',
  STALE: 'stale',
  ERROR: 'error',
});

function text(value) {
  return String(value || '').trim();
}

function timestamp(value) {
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function evaluateFreelanceSourceHealth(source = {}, now = new Date()) {
  const monitoring = text(source.monitoring || 'manual').toLowerCase();
  if (monitoring !== 'connector') {
    return {
      health: FREELANCE_SOURCE_HEALTH.MANUAL,
      monitoring,
      label: 'Manual',
      detail: 'No automated heartbeat expected',
    };
  }

  const nowMs = now instanceof Date ? now.getTime() : timestamp(now);
  const lastCheckedMs = timestamp(source.lastCheckedAt);
  const lastSuccessMs = timestamp(source.lastSuccessAt);
  const lastFailureMs = timestamp(source.lastFailureAt);
  const cadenceMinutes = positiveNumber(source.checkCadenceMinutes, 1440);
  const staleAfterMs = cadenceMinutes * 2 * 60 * 1000;

  if (lastFailureMs && lastFailureMs >= lastSuccessMs) {
    return {
      health: FREELANCE_SOURCE_HEALTH.ERROR,
      monitoring,
      label: 'Connector error',
      detail: text(source.lastError) || 'Most recent source check failed',
    };
  }

  if (!lastCheckedMs) {
    return {
      health: FREELANCE_SOURCE_HEALTH.UNKNOWN,
      monitoring,
      label: 'Not checked',
      detail: 'Connector has not reported a heartbeat yet',
    };
  }

  if (Number.isFinite(nowMs) && nowMs - lastCheckedMs > staleAfterMs) {
    return {
      health: FREELANCE_SOURCE_HEALTH.STALE,
      monitoring,
      label: 'Stale',
      detail: `No heartbeat within ${cadenceMinutes * 2} minutes`,
    };
  }

  if (source.lastResult === 'empty') {
    return {
      health: FREELANCE_SOURCE_HEALTH.HEALTHY,
      monitoring,
      label: 'Healthy · 0 found',
      detail: 'Source checked successfully and returned no opportunities',
    };
  }

  if (source.lastResult === 'opportunities') {
    const count = Math.max(0, Number(source.lastOpportunityCount) || 0);
    return {
      health: FREELANCE_SOURCE_HEALTH.HEALTHY,
      monitoring,
      label: `Healthy · ${count} found`,
      detail: 'Source checked successfully',
    };
  }

  if (lastSuccessMs) {
    return {
      health: FREELANCE_SOURCE_HEALTH.HEALTHY,
      monitoring,
      label: 'Healthy',
      detail: 'Source checked successfully',
    };
  }

  return {
    health: FREELANCE_SOURCE_HEALTH.UNKNOWN,
    monitoring,
    label: 'Unknown',
    detail: 'Heartbeat exists but no successful result is recorded',
  };
}

export function recordFreelanceSourceCheck(source = {}, result = {}, now = new Date()) {
  const checkedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  const ok = result.ok !== false;

  if (!ok) {
    return {
      ...source,
      monitoring: 'connector',
      lastCheckedAt: checkedAt,
      lastFailureAt: checkedAt,
      lastResult: 'error',
      lastError: text(result.error || result.message || 'Source check failed'),
    };
  }

  const opportunityCount = Math.max(0, Number(result.opportunityCount) || 0);
  return {
    ...source,
    monitoring: 'connector',
    lastCheckedAt: checkedAt,
    lastSuccessAt: checkedAt,
    lastResult: opportunityCount > 0 ? 'opportunities' : 'empty',
    lastOpportunityCount: opportunityCount,
    lastError: '',
  };
}
