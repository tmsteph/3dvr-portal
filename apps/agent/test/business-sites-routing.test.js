const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTemplateOutreachDraft } = require('../thomas-agent/node/outreach-draft');

test('existing sites keep hosting and use one-time upgrade pricing', () => {
  process.env.THREEDVR_OUTREACH_OFFER_PROFILE = 'business-sites';
  process.env.THREEDVR_OUTREACH_POSTAL_ADDRESS = '123 Business Way, San Diego, CA 92101';
  try {
    const draft = buildTemplateOutreachDraft({
      name: 'Acme Repair',
      site: 'https://acme.example',
      previewUrl: 'https://portal.3dvr.tech/free-page/preview/?r=test&offer=business-sites',
    });
    assert.match(draft.text, /\$99 one time/i);
    assert.match(draft.text, /keep your current hosting/i);
    assert.doesNotMatch(draft.text, /\$19\/month/i);
  } finally {
    delete process.env.THREEDVR_OUTREACH_OFFER_PROFILE;
    delete process.env.THREEDVR_OUTREACH_POSTAL_ADDRESS;
  }
});