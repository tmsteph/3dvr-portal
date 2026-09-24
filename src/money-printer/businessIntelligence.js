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
