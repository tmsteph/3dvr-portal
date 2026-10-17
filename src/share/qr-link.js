/** Progressive enhancement for shareable links. No tracking or remote QR service. */
import QRCode from 'qrcode';

export async function makeQrSvg(url) {
  const parsed = new URL(url, window.location.href);
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Unsupported QR destination');
  return QRCode.toString(parsed.href, { type: 'svg', margin: 2, width: 256, errorCorrectionLevel: 'M' });
}

/** Attach an accessible QR reveal button beside a link. */
export function attachLinkQr(link) {
  if (!(link instanceof HTMLAnchorElement) || link.dataset.qrAttached) return;
  const url = new URL(link.getAttribute('href') || '', window.location.href);
  if (!['https:', 'http:'].includes(url.protocol)) return;
  link.dataset.qrAttached = 'true';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'QR';
  button.className = 'link-qr-button';
  button.setAttribute('aria-label', `Show QR code for ${link.textContent.trim() || url.hostname}`);
  button.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('span');
  panel.className = 'link-qr-panel';
  panel.hidden = true;
  button.addEventListener('click', async () => {
    if (!panel.hidden) { panel.hidden = true; button.setAttribute('aria-expanded', 'false'); return; }
    try {
      panel.innerHTML = await makeQrSvg(url.href);
      panel.querySelector('svg')?.setAttribute('role', 'img');
      panel.querySelector('svg')?.setAttribute('aria-label', `QR code for ${url.href}`);
      panel.hidden = false;
      button.setAttribute('aria-expanded', 'true');
    } catch { panel.textContent = 'QR code unavailable'; panel.hidden = false; }
  });
  link.after(button, panel);
}

export function enhanceLinkQrs(root = document) {
  root.querySelectorAll('a[href]').forEach(attachLinkQr);
}
