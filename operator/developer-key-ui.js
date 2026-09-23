function readStorageValue(storage, key) {
  try {
    return String(storage?.getItem?.(key) || '').trim();
  } catch {
    return '';
  }
}

export function getStoredDeveloperKey(storage = globalThis.localStorage) {
  if (readStorageValue(storage, 'signedIn') !== 'true') return '';
  return readStorageValue(storage, 'userPubKey');
}

function copyWithFallback(text, documentObj) {
  const area = documentObj.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  documentObj.body.appendChild(area);
  area.select();
  const copied = documentObj.execCommand?.('copy') !== false;
  area.remove();
  return copied;
}

export function revealDeveloperKeyButton({
  storage = globalThis.localStorage,
  documentObj = globalThis.document,
  navigatorObj = globalThis.navigator
} = {}) {
  const pub = getStoredDeveloperKey(storage);
  if (!pub || !documentObj?.createElement) return null;

  const existing = documentObj.querySelector('[data-operator-developer-key]');
  if (existing) {
    existing.hidden = false;
    existing.dataset.operatorDeveloperKey = pub;
    return existing;
  }

  const headerActions = documentObj.querySelector('.header-actions');
  const anchor = headerActions
    || documentObj.querySelector('#homeOperatorStatus')
    || documentObj.querySelector('#operator-status')
    || documentObj.querySelector('#homeOperatorResult')
    || documentObj.querySelector('#operator-form');
  if (!anchor) return null;

  const button = documentObj.createElement('button');
  button.type = 'button';
  button.className = 'developer-key-button';
  button.dataset.operatorDeveloperKey = pub;
  button.textContent = 'Dev key';
  button.setAttribute('aria-label', 'Copy public developer key for approval');
  button.setAttribute('title', 'Copy developer key');
  button.style.display = 'inline-flex';
  button.style.alignItems = 'center';
  button.style.justifyContent = 'center';
  button.style.width = 'auto';
  button.style.height = 'auto';
  button.style.minHeight = '0';
  button.style.marginLeft = headerActions ? '0' : '6px';
  button.style.border = '1px solid currentColor';
  button.style.borderRadius = '999px';
  button.style.padding = '3px 7px';
  button.style.background = 'transparent';
  button.style.color = 'inherit';
  button.style.font = 'inherit';
  button.style.fontSize = '.72rem';
  button.style.fontWeight = '700';
  button.style.lineHeight = '1.2';
  button.style.opacity = '.72';
  button.style.cursor = 'pointer';

  button.addEventListener('click', async () => {
    const currentPub = String(button.dataset.operatorDeveloperKey || getStoredDeveloperKey(storage) || '').trim();
    if (!currentPub) return;

    let copied = false;
    try {
      if (navigatorObj?.clipboard?.writeText) {
        await navigatorObj.clipboard.writeText(currentPub);
        copied = true;
      } else {
        copied = copyWithFallback(currentPub, documentObj);
      }
    } catch {
      copied = copyWithFallback(currentPub, documentObj);
    }

    const prior = button.textContent;
    button.textContent = copied ? 'Copied' : 'Dev key';
    if (copied) setTimeout(() => { button.textContent = prior; }, 1800);
  });

  if (headerActions?.appendChild) {
    headerActions.appendChild(button);
  } else {
    anchor.insertAdjacentElement?.('afterend', button);
  }
  return button;
}
