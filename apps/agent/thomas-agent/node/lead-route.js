const ROUTES = new Set(['email', 'form', 'contact-page', 'site']);
const ACTIONS = new Set(['email', 'form', 'open', 'review', 'unreachable']);

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeRoute(route) {
  const value = normalizeText(route).toLowerCase();
  if (!value) return '';
  if (value === 'contact-page-unverified') return 'contact-page';
  if (ROUTES.has(value)) return value;
  return '';
}

function splitVariantTokens(variant) {
  return normalizeText(variant)
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean);
}

function routeFromVariant(variant) {
  const raw = normalizeText(variant).toLowerCase();
  if (!raw) return '';

  const explicit = raw.match(/\broute\s*=\s*(email|form|contact-page|site|contact-page-unverified)\b/i);
  if (explicit) return normalizeRoute(explicit[1]);

  if (/\bcontact-page-unverified\b/i.test(raw)) return 'contact-page';

  for (const token of splitVariantTokens(raw)) {
    const normalized = normalizeRoute(token);
    if (normalized) return normalized;
  }

  return '';
}

function routeFromContact({ contact = '', link = '', variant = '' } = {}) {
  const variantRoute = routeFromVariant(variant);
  if (variantRoute) return variantRoute;

  const values = [contact, link];
  for (const value of values) {
    const text = normalizeText(value);
    if (!text) continue;

    const lower = text.toLowerCase();
    if (/^mailto:/.test(lower) || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower) && !/^https?:\/\//.test(lower))) {
      return 'email';
    }

    if (/^https?:\/\//.test(lower)) {
      try {
        const url = new URL(lower);
        const path = `${url.hostname}${url.pathname}`.toLowerCase();
        if (/(\/|^)(contact|contact-us|connect|booking|book|appointment|appointments|estimate|quote|consult|consultation|start|hire|support)(\/|$)/.test(path)) {
          return 'contact-page';
        }
        return 'site';
      } catch {
        return 'site';
      }
    }
  }

  return 'site';
}

function routeLabel(route) {
  return normalizeRoute(route) || 'site';
}

function isLikelyAssetUrl(value) {
  const text = normalizeText(value).toLowerCase();
  if (!/^https?:\/\//.test(text)) return false;
  return /wp-content\/|wp-json\/|feed\/|cdn-cgi\/|contact-form-7\/includes\/css\/|[.\/](css|js|json|xml|txt|pdf|jpg|jpeg|png|gif|svg|webp|ico|woff|woff2|ttf|eot)([?#].*)?$/.test(text);
}

function leadAction({ contact = '', link = '', variant = '' } = {}) {
  const route = routeFromContact({ contact, link, variant });
  const normalizedContact = normalizeText(contact);
  const normalizedLink = normalizeText(link);

  if (!normalizedContact && !normalizedLink) {
    return 'unreachable';
  }

  if (route === 'email') {
    return 'email';
  }

  if (route === 'form' || route === 'contact-page') {
    if (normalizedContact && /^https?:\/\//i.test(normalizedContact) && isLikelyAssetUrl(normalizedContact)) {
      return normalizedLink ? 'open' : 'review';
    }
    return 'form';
  }

  if (route === 'site') {
    return normalizedLink ? 'open' : 'review';
  }

  return 'review';
}

function actionLabel(action) {
  const value = normalizeText(action).toLowerCase();
  if (ACTIONS.has(value)) return value;
  return 'review';
}

function applyRouteToVariant(variant, route) {
  const normalizedRoute = normalizeRoute(route) || routeFromVariant(variant) || 'site';
  const preserved = splitVariantTokens(variant)
    .filter((token) => !/^route\s*=/i.test(token))
    .filter((token) => !normalizeRoute(token))
    .filter((token) => token.toLowerCase() !== 'contact-page-unverified');

  preserved.push(`route=${normalizedRoute}`);
  return preserved.join('+');
}

function cli(argv = process.argv.slice(2)) {
  let contact = '';
  let link = '';
  let variant = '';
  let mode = 'route';

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--contact') {
      contact = argv[++index] || '';
    } else if (arg === '--link') {
      link = argv[++index] || '';
    } else if (arg === '--variant') {
      variant = argv[++index] || '';
    } else if (arg === '--action') {
      mode = 'action';
    } else if (arg === '-h' || arg === '--help') {
      console.log('Usage: node lead-route.js [--contact value] [--link value] [--variant value] [--action]');
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  console.log(mode === 'action'
    ? leadAction({ contact, link, variant })
    : routeFromContact({ contact, link, variant }));
}

module.exports = {
  ROUTES,
  normalizeRoute,
  routeFromVariant,
  routeFromContact,
  routeLabel,
  leadAction,
  actionLabel,
  applyRouteToVariant,
};

if (require.main === module) {
  try {
    cli();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
