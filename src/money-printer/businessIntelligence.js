function clean(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function needKey(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function summarizeBusinessNeeds(leads = [], { minConfidence = 0.45 } = {}) {
  const groups = new Map();

  for (const lead of Array.isArray(leads) ? leads : []) {
    const business = clean(lead?.name || lead?.business || lead?.email);
    const seenForLead = new Set();

    for (const item of Array.isArray(lead?.needs) ? lead.needs : []) {
      const need = clean(item?.need);
      const key = needKey(need);
      const confidence = Math.max(0, Math.min(1, Number(item?.confidence) || 0));
      if (!key || confidence < minConfidence || seenForLead.has(key)) continue;
      seenForLead.add(key);

      const current = groups.get(key) || {
        key,
        need,
        businesses: [],
        count: 0,
        confidenceTotal: 0,
        observed: 0,
        inferred: 0,
        solutionRoutes: {}
      };

      current.count += 1;
      current.confidenceTotal += confidence;
      if (business) current.businesses.push(business);
      if (item?.kind === 'observed') current.observed += 1;
      else current.inferred += 1;

      const route = clean(lead?.solutionRoute) || 'unknown';
      current.solutionRoutes[route] = (current.solutionRoutes[route] || 0) + 1;
      groups.set(key, current);
    }
  }

  return [...groups.values()]
    .map(item => ({
      ...item,
      averageConfidence: item.count ? item.confidenceTotal / item.count : 0,
      businesses: [...new Set(item.businesses)]
    }))
    .sort((a, b) => b.count - a.count || b.averageConfidence - a.averageConfidence || a.need.localeCompare(b.need));
}

export function topBusinessNeed(leads = [], options = {}) {
  return summarizeBusinessNeeds(leads, options)[0] || null;
}


const MATCH_STOPWORDS = new Set([
  'a','an','and','are','as','at','be','better','business','businesses','for','from',
  'help','improve','in','more','need','needs','of','on','or','service','services',
  'the','their','to','with'
]);

function matchTokens(value = '') {
  return [...new Set(
    clean(value)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(token => token.length > 2 && !MATCH_STOPWORDS.has(token))
  )];
}

function capabilityScore(need = '', capability = '') {
  const needText = clean(need).toLowerCase();
  const capabilityText = clean(capability).toLowerCase();
  if (!needText || !capabilityText) return 0;
  if (needText.includes(capabilityText) || capabilityText.includes(needText)) return 1;

  const needTokens = matchTokens(needText);
  const capabilityTokens = matchTokens(capabilityText);
  if (!needTokens.length || !capabilityTokens.length) return 0;
  const overlap = capabilityTokens.filter(token => needTokens.includes(token)).length;
  if (!overlap) return 0;
  return overlap / Math.max(needTokens.length, capabilityTokens.length);
}

export function providerProfilesFromBusinesses(businesses = []) {
  return (Array.isArray(businesses) ? businesses : [])
    .map((business, index) => {
      const capabilities = (Array.isArray(business?.capabilities) ? business.capabilities : [])
        .map(clean)
        .filter(Boolean);
      if (!capabilities.length) return null;
      return {
        id: clean(business?.id || business?.email) || `business-provider-${index + 1}`,
        name: clean(business?.name || business?.business || business?.email) || 'Unknown business',
        capabilities,
        location: clean(business?.location),
        sourceUrl: clean(business?.sourceUrl),
        sourceBusiness: clean(business?.name || business?.business || business?.email)
      };
    })
    .filter(Boolean);
}

export function matchBusinessNeedsToProviders(needs = [], providers = [], {
  minNeedConfidence = 0.45,
  minMatchScore = 0.2,
  maxMatchesPerNeed = 3
} = {}) {
  const output = [];

  for (const item of Array.isArray(needs) ? needs : []) {
    const need = clean(item?.need);
    const confidence = Math.max(0, Math.min(1, Number(item?.confidence) || 0));
    if (!need || confidence < minNeedConfidence) continue;

    const matches = [];
    for (const provider of Array.isArray(providers) ? providers : []) {
      const capabilities = (Array.isArray(provider?.capabilities) ? provider.capabilities : [])
        .map(clean)
        .filter(Boolean);
      let best = null;
      for (const capability of capabilities) {
        const score = capabilityScore(need, capability);
        if (!best || score > best.score) best = { capability, score };
      }
      if (!best || best.score < minMatchScore) continue;
      matches.push({
        providerId: clean(provider?.id),
        providerName: clean(provider?.name) || clean(provider?.id) || 'Unknown provider',
        capability: best.capability,
        score: best.score,
        location: clean(provider?.location),
        sourceUrl: clean(provider?.sourceUrl),
        sourceBusiness: clean(provider?.sourceBusiness)
      });
    }

    matches.sort((a, b) => b.score - a.score || a.providerName.localeCompare(b.providerName));
    output.push({
      need,
      confidence,
      kind: item?.kind === 'observed' ? 'observed' : 'inferred',
      matches: matches.slice(0, Math.max(1, maxMatchesPerNeed))
    });
  }

  return output;
}

export function matchBusinessesToEachOther(businesses = [], options = {}) {
  const providers = providerProfilesFromBusinesses(businesses);
  return (Array.isArray(businesses) ? businesses : []).map(business => {
    const businessName = clean(business?.name || business?.business || business?.email);
    const candidates = providers.filter(provider => provider.sourceBusiness !== businessName);
    return {
      business: businessName,
      matches: matchBusinessNeedsToProviders(business?.needs, candidates, options)
    };
  });
}
