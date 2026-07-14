const form = document.querySelector('#freePageBrief');
const mailtoLink = document.querySelector('#mailtoLink');
const handoffCopy = document.querySelector('#handoffCopy');

const email = '3dvr.tech@gmail.com';

function valueFor(formData, key, fallback) {
  const value = String(formData.get(key) || '').trim();
  return value || fallback;
}

function buildMailto(formData) {
  const name = valueFor(formData, 'name', 'A new 3DVR page');
  const offer = valueFor(formData, 'offer', 'I want help turning this into a simple one-page website.');
  const audience = valueFor(formData, 'audience', 'People who might hire, book, buy, or understand this.');
  const action = valueFor(formData, 'action', 'Contact me');
  const contact = valueFor(formData, 'contact', 'I will send the best contact link next.');

  const subject = `Free 3DVR one-page website for ${name}`;
  const body = [
    'I want a free one-page 3DVR website draft.',
    '',
    `Name/business: ${name}`,
    `Offer/project: ${offer}`,
    `Audience: ${audience}`,
    `Main action button: ${action}`,
    `Best contact link: ${contact}`,
    '',
    'If I like it, I am open to keeping it live for $5/month.'
  ].join('\n');

  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function trackLeadIntent() {
  if (typeof window.gtag !== 'function') return;

  window.gtag('event', 'generate_lead', {
    method: 'mailto_brief'
  });
}

if (form && mailtoLink && handoffCopy) {
  form.addEventListener('submit', event => {
    event.preventDefault();
    const formData = new FormData(form);
    const href = buildMailto(formData);
    trackLeadIntent();
    mailtoLink.href = href;
    handoffCopy.textContent = 'Your email is ready. Review it, add any links or photos, and send.';
    window.location.href = href;
  });

  form.addEventListener('input', () => {
    mailtoLink.href = buildMailto(new FormData(form));
  });
}
