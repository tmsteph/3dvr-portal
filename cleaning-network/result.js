let result = {};
try {
  result = JSON.parse(sessionStorage.getItem('cleaningPartnerResult') || '{}');
} catch {
  result = {};
}

const preview = document.querySelector('#previewLink');
if (preview && result.previewUrl) {
  preview.href = result.previewUrl;
  preview.hidden = false;
}

const reference = document.querySelector('#reference');
if (reference && result.requestId) reference.textContent = `Reference: ${result.requestId}`;

if (window.location.pathname.endsWith('/qualified.html')) {
  const detail = {
    funnel: 'cleaning-partner',
    requestId: result.requestId || '',
    score: Number(result.qualificationScore || 4)
  };
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: 'qualified_lead', ...detail });
  window.dispatchEvent(new CustomEvent('3dvr:qualified-lead', { detail }));
}
