const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that screenshot.'));
    reader.readAsDataURL(file);
  });
}

export function installOperatorAttachments({ form, input, onStatus } = {}) {
  if (!form || !input || typeof document === 'undefined') {
    return { getPayload: () => [], clear: () => {} };
  }

  let current = null;
  const row = form.querySelector(':scope > div');
  const submit = row?.querySelector('button[type="submit"]');
  if (!row || !submit) return { getPayload: () => [], clear: () => {} };

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
  fileInput.hidden = true;
  fileInput.setAttribute('aria-label', 'Choose screenshot');

  const attach = document.createElement('button');
  attach.type = 'button';
  attach.className = 'operator-attach';
  attach.textContent = '＋';
  attach.setAttribute('aria-label', 'Attach screenshot');
  attach.setAttribute('title', 'Attach screenshot');

  const tray = document.createElement('div');
  tray.className = 'operator-attachment-tray';
  tray.hidden = true;

  const preview = document.createElement('img');
  preview.className = 'operator-attachment-preview';
  preview.alt = 'Attached screenshot preview';

  const name = document.createElement('span');
  name.className = 'operator-attachment-name';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'operator-attachment-remove';
  remove.textContent = 'Remove';
  remove.setAttribute('aria-label', 'Remove attached screenshot');

  tray.append(preview, name, remove);
  form.insertBefore(tray, row);
  row.insertBefore(attach, submit);
  form.appendChild(fileInput);

  const style = document.createElement('style');
  style.textContent = `
    #operator-form .operator-attach {
      width: 2.7rem;
      min-width: 2.7rem;
      padding: .62rem 0;
      border: 1px solid var(--line);
      background: #102238;
      color: var(--mint);
      font-size: 1.15rem;
      line-height: 1;
    }
    #operator-form .operator-attach:hover,
    #operator-form .operator-attach:focus-visible {
      border-color: var(--mint);
      background: #17344a;
      outline: none;
    }
    #operator-form .operator-attachment-tray {
      display: grid;
      grid-template-columns: 3rem minmax(0, 1fr) auto;
      align-items: center;
      gap: .6rem;
      margin: .2rem .2rem .55rem;
      padding: .45rem .55rem;
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #0a1625;
    }
    #operator-form .operator-attachment-tray[hidden] { display: none; }
    #operator-form .operator-attachment-preview {
      width: 3rem;
      height: 3rem;
      object-fit: cover;
      border-radius: 8px;
      border: 1px solid var(--line);
    }
    #operator-form .operator-attachment-name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--muted);
      font-size: .78rem;
    }
    #operator-form .operator-attachment-remove {
      padding: .4rem .55rem;
      background: transparent;
      color: var(--muted);
      border-color: var(--line);
      font-size: .72rem;
    }
  `;
  document.head.appendChild(style);

  const clear = () => {
    current = null;
    fileInput.value = '';
    preview.removeAttribute('src');
    name.textContent = '';
    tray.hidden = true;
  };

  attach.addEventListener('click', () => fileInput.click());
  remove.addEventListener('click', clear);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!ALLOWED_TYPES.has(file.type)) {
      clear();
      onStatus?.('Use a PNG, JPEG, WebP, or GIF screenshot.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      clear();
      onStatus?.('Screenshot is too large. Keep it under 4 MB.');
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      current = { name: file.name || 'screenshot', type: file.type, dataUrl };
      preview.src = dataUrl;
      name.textContent = current.name;
      tray.hidden = false;
      onStatus?.('Screenshot attached');
      input.focus();
    } catch (error) {
      clear();
      onStatus?.(error.message || 'Could not attach that screenshot.');
    }
  });

  return {
    getPayload: () => current ? [current] : [],
    clear
  };
}
