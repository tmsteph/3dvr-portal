function hasExplicitScheme(value) {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(value);
}

export function classifyPreviewHref(rawHref, parentUrl) {
  const href = String(rawHref || '').trim();

  if (!href || href === '#') {
    return { action: 'stay' };
  }

  if (href.startsWith('#')) {
    return { action: 'hash', hash: href };
  }

  if (href.startsWith('mailto:') || href.startsWith('tel:')) {
    return { action: 'external', url: href };
  }

  try {
    const parent = new URL(parentUrl);
    const resolved = new URL(href, parent);
    const isRelative = !hasExplicitScheme(href) && !href.startsWith('//');

    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return { action: 'block' };
    }

    if (isRelative || resolved.origin === parent.origin) {
      return { action: 'block' };
    }

    return { action: 'external', url: resolved.href };
  } catch (error) {
    return { action: 'block' };
  }
}
