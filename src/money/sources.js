function uniqueKeywords(input = []) {
  const seen = new Set();
  const result = [];

  input.forEach(keyword => {
    const normalized = String(keyword || '').trim().toLowerCase();
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(normalized);
  });

  return result;
}

export function buildKeywordList({ market = '', keywords = [] } = {}) {
  const fromMarket = String(market || '')
    .split(/[,+]/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 4);

  return uniqueKeywords([...keywords, ...fromMarket]).slice(0, 6);
}

function normalizeSignal(source, payload = {}, keyword) {
  return {
    id: payload.id || `${source}-${Math.random().toString(36).slice(2, 9)}`,
    source,
    keyword,
    title: String(payload.title || '').trim(),
    summary: String(payload.summary || '').trim(),
    url: payload.url || '',
    popularity: Number(payload.popularity) || 0,
    comments: Number(payload.comments) || 0,
    createdAt: payload.createdAt || new Date().toISOString()
  };
}

function normalizeFreshness(createdAt) {
  const timestamp = Date.parse(createdAt || '');
  if (Number.isNaN(timestamp)) {
    return 0;
  }
  const ageDays = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);
  if (!Number.isFinite(ageDays) || ageDays < 0) {
    return 0;
  }
  return Math.max(0, 100 - Math.min(100, ageDays * 3));
}

function keywordRelevance(signal) {
  const haystack = `${signal.title || ''} ${signal.summary || ''}`.toLowerCase();
  const terms = String(signal.keyword || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(item => item.trim())
    .filter(item => item.length >= 3);

  if (!terms.length || !haystack) {
    return 0;
  }

  const hits = terms.filter(term => haystack.includes(term)).length;
  return Math.round((hits / terms.length) * 100);
}

function scoreSignal(signal) {
  const popularity = Number(signal.popularity) || 0;
  const comments = Number(signal.comments) || 0;
  const freshness = normalizeFreshness(signal.createdAt);
  const relevance = keywordRelevance(signal);
  return (relevance * 0.5) + (popularity * 0.25) + (comments * 0.15) + (freshness * 0.1);
}

function dedupeSignals(signals = []) {
  const seen = new Set();
  const unique = [];

  signals.forEach(signal => {
    const key = (signal.url || signal.title || '').toLowerCase().trim();
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    unique.push(signal);
  });

  return unique;
}

function takeTopSignals(signals = [], limit = 24) {
  return signals
    .filter(signal => keywordRelevance(signal) >= 35)
    .slice()
    .sort((left, right) => scoreSignal(right) - scoreSignal(left))
    .slice(0, limit);
}

function sanitizeErrorBody(raw = '') {
  const withoutTags = String(raw)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return withoutTags.slice(0, 120);
}

async function readJson(response, sourceLabel = 'Demand source') {
  if (!response.ok) {
    const errorBody = await response.text();
    const safeBody = sanitizeErrorBody(errorBody);
    const looksLikeHtml = /<html|<body|theme-light|:root\{|\{--/i.test(String(errorBody || ''));
    const detail = safeBody && !looksLikeHtml ? `: ${safeBody}` : '';
    throw new Error(`${sourceLabel} unavailable (HTTP ${response.status})${detail}`);
  }
  return response.json();
}

export async function fetchHackerNewsSignals({ keywords = [], limit = 24, fetchImpl = globalThis.fetch } = {}) {
  const perKeyword = Math.max(3, Math.ceil(limit / Math.max(1, keywords.length)));
  const collected = [];

  for (const keyword of keywords) {
    const params = new URLSearchParams({
      query: keyword,
      tags: 'story',
      hitsPerPage: String(perKeyword)
    });
    const url = `https://hn.algolia.com/api/v1/search?${params.toString()}`;
    const response = await fetchImpl(url);
    const payload = await readJson(response, 'Hacker News');
    const hits = Array.isArray(payload.hits) ? payload.hits : [];

    hits.forEach(hit => {
      collected.push(normalizeSignal('hackernews', {
        id: hit.objectID,
        title: hit.title,
        summary: hit.story_text || hit.comment_text || '',
        url: hit.url || hit.story_url || '',
        popularity: hit.points,
        comments: hit.num_comments,
        createdAt: hit.created_at
      }, keyword));
    });
  }

  return takeTopSignals(dedupeSignals(collected), limit);
}

export async function fetchRedditSignals({ keywords = [], limit = 24, fetchImpl = globalThis.fetch } = {}) {
  const businessSubreddits = ['freelance', 'smallbusiness', 'entrepreneur', 'startups'];
  const requestCount = Math.max(1, keywords.length * businessSubreddits.length);
  const perRequest = Math.max(2, Math.ceil(limit / requestCount));
  const collected = [];

  for (const keyword of keywords) {
    for (const subreddit of businessSubreddits) {
      const params = new URLSearchParams({
        q: keyword,
        restrict_sr: '1',
        sort: 'top',
        t: 'month',
        limit: String(perRequest),
        type: 'link'
      });
      const url = `https://www.reddit.com/r/${subreddit}/search.json?${params.toString()}`;
      const response = await fetchImpl(url, {
        headers: {
          'User-Agent': '3dvr-money-loop/0.1'
        }
      });

      const payload = await readJson(response, `Reddit r/${subreddit}`);
      const children = Array.isArray(payload?.data?.children) ? payload.data.children : [];

      children.forEach(item => {
        const data = item?.data || {};
        const permalink = typeof data.permalink === 'string' && data.permalink
          ? `https://www.reddit.com${data.permalink}`
          : data.url;

        collected.push(normalizeSignal(`reddit:r/${subreddit}`, {
          id: data.id,
          title: data.title,
          summary: data.selftext,
          url: permalink,
          popularity: data.score,
          comments: data.num_comments,
          createdAt: data.created_utc ? new Date(data.created_utc * 1000).toISOString() : ''
        }, keyword));
      });
    }
  }

  return takeTopSignals(dedupeSignals(collected), limit);
}

export async function collectDemandSignals(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const keywords = buildKeywordList(options);
  const signalLimit = Number.isFinite(options.limit) ? options.limit : 24;

  if (!keywords.length) {
    return {
      keywords: [],
      signals: [],
      warnings: ['No keywords provided for demand research.']
    };
  }

  const warnings = [];
  const batches = await Promise.allSettled([
    fetchHackerNewsSignals({ keywords, limit: signalLimit, fetchImpl }),
    fetchRedditSignals({ keywords, limit: signalLimit, fetchImpl })
  ]);

  const signals = [];
  batches.forEach(result => {
    if (result.status === 'fulfilled') {
      signals.push(...result.value);
      return;
    }
    warnings.push(result.reason?.message || 'Demand source fetch failed.');
  });

  return {
    keywords,
    signals: takeTopSignals(dedupeSignals(signals), signalLimit),
    warnings
  };
}
