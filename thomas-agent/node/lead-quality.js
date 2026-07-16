function normalizeText(value) {
  return String(value || '').trim();
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|#39);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countInternalLinks(html, pageUrl) {
  let pageHost = '';
  try {
    pageHost = new URL(pageUrl).hostname.replace(/^www\./, '');
  } catch {
    return 0;
  }

  const links = new Set();
  for (const match of String(html || '').matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1], pageUrl);
      if (url.hostname.replace(/^www\./, '') === pageHost && /^https?:$/.test(url.protocol)) {
        links.add(`${url.pathname}${url.search}`);
      }
    } catch {
      // Ignore malformed links.
    }
  }
  return links.size;
}

function assessWebsiteHtml(html, pageUrl = '') {
  const source = String(html || '');
  const text = stripHtml(source);
  const lower = text.toLowerCase();
  const wordCount = text ? text.split(/\s+/).length : 0;
  const internalLinks = countInternalLinks(source, pageUrl);
  const headings = (source.match(/<h[1-3]\b/gi) || []).length;
  const contactSignals = (source.match(/(?:mailto:|tel:|book(?:ing)?|appointment|contact us|get a quote)/gi) || []).length;
  const placeholder = /(coming soon|under construction|domain (?:is )?for sale|website is parked|future home of)/i.test(lower);
  const substantial = !placeholder && (
    wordCount >= 250
    || (wordCount >= 120 && headings >= 3 && (internalLinks >= 3 || contactSignals >= 1))
  );
  const weak = placeholder || wordCount < 80 || (wordCount < 140 && internalLinks < 2 && headings < 2);

  return {
    classification: substantial ? 'substantial' : weak ? 'weak' : 'uncertain',
    wordCount,
    internalLinks,
    headings,
    contactSignals,
    placeholder,
  };
}

async function qualifyLeadWebsite(lead = {}, options = {}) {
  const site = normalizeText(lead.link || lead.site);
  if (!site) {
    return { qualified: true, classification: 'missing', reason: 'no website is listed' };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number.parseInt(options.timeoutMs, 10) || 9000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(site, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': '3dvr-agent/1.0 (website qualification; 3dvr.tech)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!response.ok) {
      return {
        qualified: false,
        classification: 'unverified',
        reason: `website returned HTTP ${response.status}`,
      };
    }
    const contentType = response.headers?.get?.('content-type') || '';
    if (contentType && !/html|text/i.test(contentType)) {
      return { qualified: false, classification: 'unverified', reason: `website returned ${contentType}` };
    }
    const assessment = assessWebsiteHtml(await response.text(), response.url || site);
    return {
      ...assessment,
      qualified: assessment.classification === 'weak',
      reason: assessment.classification === 'weak'
        ? 'website is sparse or a placeholder'
        : assessment.classification === 'substantial'
          ? 'website already has substantial current content'
          : 'website quality is uncertain and requires review',
    };
  } catch (error) {
    return {
      qualified: false,
      classification: 'unverified',
      reason: error?.name === 'AbortError' ? 'website verification timed out' : `website verification failed: ${error.message}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  assessWebsiteHtml,
  qualifyLeadWebsite,
  stripHtml,
};
