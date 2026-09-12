const OPENAI_API_BASE = 'https://api.openai.com/v1';

function unixSeconds(value) {
  return Math.floor(value.getTime() / 1000);
}

function sumUsageBuckets(payload = {}) {
  return (payload.data || []).reduce((totals, bucket) => {
    for (const result of bucket.results || []) {
      totals.requests += Number(result.num_model_requests || 0);
      totals.inputTokens += Number(result.input_tokens || 0);
      totals.outputTokens += Number(result.output_tokens || 0);
      totals.cachedInputTokens += Number(result.input_cached_tokens || 0);
    }
    return totals;
  }, { requests: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 });
}

function sumCostBuckets(payload = {}) {
  return (payload.data || []).reduce((total, bucket) => {
    return total + (bucket.results || []).reduce((bucketTotal, result) => {
      return bucketTotal + Number(result?.amount?.value || 0);
    }, 0);
  }, 0);
}

async function fetchJson(fetchImpl, url, adminKey) {
  const response = await fetchImpl(url, {
    headers: {
      Authorization: `Bearer ${adminKey}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `OpenAI request failed (${response.status})`);
  }
  return data;
}

export function createOpenAiUsageHandler({ fetchImpl = fetch, config = process.env, now = () => new Date() } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const adminKey = String(config.OPENAI_ADMIN_KEY || '').trim();
    if (!adminKey) {
      return res.status(200).json({
        ok: true,
        configured: false,
        message: 'Set OPENAI_ADMIN_KEY on the server to show organization API usage and costs.'
      });
    }

    const end = now();
    const usageStart = new Date(end.getTime() - (7 * 24 * 60 * 60 * 1000));
    const costStart = new Date(end.getTime() - (30 * 24 * 60 * 60 * 1000));
    const usageUrl = new URL(`${OPENAI_API_BASE}/organization/usage/completions`);
    usageUrl.searchParams.set('start_time', String(unixSeconds(usageStart)));
    usageUrl.searchParams.set('end_time', String(unixSeconds(end)));
    usageUrl.searchParams.set('bucket_width', '1d');
    usageUrl.searchParams.set('limit', '7');

    const costUrl = new URL(`${OPENAI_API_BASE}/organization/costs`);
    costUrl.searchParams.set('start_time', String(unixSeconds(costStart)));
    costUrl.searchParams.set('end_time', String(unixSeconds(end)));
    costUrl.searchParams.set('bucket_width', '1d');
    costUrl.searchParams.set('limit', '30');

    try {
      const [usage, costs] = await Promise.all([
        fetchJson(fetchImpl, usageUrl, adminKey),
        fetchJson(fetchImpl, costUrl, adminKey)
      ]);
      return res.status(200).json({
        ok: true,
        configured: true,
        asOf: end.toISOString(),
        api: {
          last7Days: sumUsageBuckets(usage),
          last30Days: {
            cost: sumCostBuckets(costs),
            currency: 'usd'
          }
        },
        note: 'OpenAI API organization usage is separate from ChatGPT plan message allowances.'
      });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        configured: true,
        error: error?.message || 'Unable to load OpenAI organization usage.'
      });
    }
  };
}

const handler = createOpenAiUsageHandler();
export default handler;
