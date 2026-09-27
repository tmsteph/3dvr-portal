function parseNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function configuredLimit(env = process.env) {
  return parseNumber(
    env.THREEDVR_OPENAI_COST_LIMIT_USD
      ?? env.THREEDVR_AUTOPILOT_OPENAI_COST_LIMIT_USD,
    null,
  );
}

function configuredWindowDays(env = process.env) {
  const days = parseNumber(
    env.THREEDVR_OPENAI_COST_WINDOW_DAYS
      ?? env.THREEDVR_AUTOPILOT_OPENAI_COST_WINDOW_DAYS,
    1,
  );
  return Math.max(1, Math.floor(days || 1));
}

async function readOpenAiSpendGuard({ env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const limitUsd = configuredLimit(env);
  const days = configuredWindowDays(env);
  if (!Number.isFinite(limitUsd)) {
    return { configured: false, allowed: true, available: false, limitUsd: null, days, reason: 'cost limit not configured' };
  }

  const adminKey = String(env.OPENAI_ADMIN_KEY || '').trim();
  if (!adminKey) {
    return { configured: true, allowed: false, available: false, limitUsd, days, reason: 'OPENAI_ADMIN_KEY not set' };
  }

  const startTime = Math.floor((Number(now) - (days * 24 * 60 * 60 * 1000)) / 1000);
  const url = new URL('https://api.openai.com/v1/organization/costs');
  url.searchParams.set('start_time', String(startTime));
  url.searchParams.set('limit', String(days));

  let response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: {
        Authorization: `Bearer ${adminKey}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    return { configured: true, allowed: false, available: false, limitUsd, days, reason: error.message || 'cost check failed' };
  }

  if (!response.ok) {
    return { configured: true, allowed: false, available: false, limitUsd, days, reason: `OpenAI costs request failed: ${response.status}` };
  }

  const payload = await response.json().catch(() => ({}));
  let totalUsd = 0;
  for (const bucket of Array.isArray(payload?.data) ? payload.data : []) {
    for (const result of Array.isArray(bucket?.results) ? bucket.results : []) {
      totalUsd += Number(result?.amount?.value || 0);
    }
  }
  const limitExceeded = totalUsd >= limitUsd;
  return {
    configured: true,
    allowed: !limitExceeded,
    available: true,
    totalUsd,
    limitUsd,
    limitExceeded,
    currency: 'usd',
    days,
  };
}

async function assertOpenAiSpendAllowed(options = {}) {
  const status = await readOpenAiSpendGuard(options);
  if (!status.allowed) {
    const reason = status.limitExceeded
      ? `OpenAI spend guard blocked API call: $${status.totalUsd.toFixed(2)} / $${status.limitUsd.toFixed(2)} ceiling reached`
      : `OpenAI spend guard blocked API call: ${status.reason}`;
    const error = new Error(reason);
    error.code = 'OPENAI_SPEND_GUARD';
    error.spendGuard = status;
    throw error;
  }
  return status;
}

module.exports = {
  configuredLimit,
  configuredWindowDays,
  readOpenAiSpendGuard,
  assertOpenAiSpendAllowed,
};
