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

  if (kind === 'suggestion') anchor.textContent = 'Open Forge suggestion →';
  if (kind === 'edit') anchor.textContent = 'Open Forge edit →';
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
    records.forEach(record => record.addedNodes.forEach(node => {
      if (node?.nodeType === 1) scan(node);
    }));
  });
  observer.observe(documentObj.body || documentObj.documentElement, { childList: true, subtree: true });
  return observer;
}

installForgeLinkLabels();

export { labelForgeLink };
