function labelForgeLink(anchor) {
  if (!anchor?.getAttribute) return;
  const href = anchor.getAttribute('href') || '';
  if (!href.includes('/forge/record.html?')) return;

  let kind = '';
  try {
    const url = new URL(href, globalThis.location?.origin || 'https://portal.3dvr.tech');
    kind = url.searchParams.get('kind') || '';
  } catch {
    return;
  }

  const label = kind === 'suggestion'
    ? 'Forge suggestion'
    : kind === 'edit'
      ? 'Forge edit'
      : '';
  if (!label) return;

  const text = `Open ${label} →`;
  if (anchor.textContent !== text) anchor.textContent = text;
  if (anchor.getAttribute('aria-label') !== `Open ${label}`) {
    anchor.setAttribute?.('aria-label', `Open ${label}`);
  }
}

export function installForgeLinkLabels(documentObj = globalThis.document) {
  if (!documentObj?.querySelectorAll || typeof globalThis.MutationObserver !== 'function') return null;
  if (documentObj.documentElement?.dataset?.forgeLinkLabelsInstalled === 'true') return null;
  if (documentObj.documentElement) documentObj.documentElement.dataset.forgeLinkLabelsInstalled = 'true';

  const scan = root => {
    if (root?.matches?.('a[href*="/forge/record.html?"]')) labelForgeLink(root);
    root?.querySelectorAll?.('a[href*="/forge/record.html?"]').forEach(labelForgeLink);
  };

  scan(documentObj);
  const observer = new MutationObserver(records => {
    records.forEach(record => {
      // The homepage reuses one existing action anchor. Replacing its text creates
      // a child-list mutation whose target is the anchor, so scan the target too.
      if (record.target?.nodeType === 1) scan(record.target);
      record.addedNodes.forEach(node => {
        if (node?.nodeType === 1) scan(node);
      });
    });
  });
  observer.observe(documentObj.body || documentObj.documentElement, { childList: true, subtree: true });
  return observer;
}

installForgeLinkLabels();

export { labelForgeLink };
